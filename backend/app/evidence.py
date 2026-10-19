import hashlib
import hmac
import io
import time
import warnings
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import func, select

from app.config import get_settings
from app.models import Complaint, Evidence, Role, new_id
from app.schemas import EvidenceOut
from app.security import Credentials, CurrentUser, Database, current_user, get_visible_complaint
from app.storage import get_storage

router = APIRouter(prefix="/complaints", tags=["Private evidence"])
Image.MAX_IMAGE_PIXELS = 20_000_000


def make_evidence_signature(tracking_id: str, evidence_id: str, expires: int) -> str:
    secret = get_settings().secret_key.encode()
    msg = f"{tracking_id}:{evidence_id}:{expires}".encode()
    return hmac.new(secret, msg, hashlib.sha256).hexdigest()


def verify_evidence_signature(tracking_id: str, evidence_id: str, expires: int, sig: str) -> bool:
    if expires < int(time.time()):
        return False
    expected = make_evidence_signature(tracking_id, evidence_id, expires)
    return hmac.compare_digest(sig, expected)


def clean_image(raw: bytes) -> bytes:
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(raw)) as image:
                if image.format not in ("JPEG", "PNG"):
                    raise ValueError("Only JPEG and PNG images are supported")
                if getattr(image, "n_frames", 1) != 1:
                    raise ValueError("Animated images are not supported")
                image.load()
                image = ImageOps.exif_transpose(image).convert("RGB")
                output = io.BytesIO()
                image.save(output, format="JPEG", quality=90)
                return output.getvalue()
    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ) as error:
        raise HTTPException(
            422, "Invalid image. Use a non-animated JPEG/PNG below 20 megapixels"
        ) from error


@router.post("/{tracking_id}/evidence", response_model=EvidenceOut, status_code=201)
def upload_evidence(
    tracking_id: str,
    user: CurrentUser,
    db: Database,
    file: Annotated[UploadFile, File()],
    storage=Depends(get_storage),
):
    complaint = get_visible_complaint(db, tracking_id, user)
    if user.role != Role.CITIZEN or complaint.citizen_id != user.id:
        raise HTTPException(403, "Only the submitting citizen can add complaint photographs")
    # Serialise per-complaint upload counts in PostgreSQL.
    db.scalar(select(Complaint).where(Complaint.id == complaint.id).with_for_update())
    raw = file.file.read(get_settings().max_image_bytes + 1)
    if len(raw) > get_settings().max_image_bytes:
        raise HTTPException(413, "Photograph must be 8 MiB or smaller")
    data = clean_image(raw)
    if len(data) > get_settings().max_image_bytes:
        raise HTTPException(413, "Processed photograph is too large; use a smaller image")
    digest = hashlib.sha256(data).hexdigest()
    existing = db.scalar(
        select(Evidence).where(Evidence.complaint_id == complaint.id, Evidence.sha256 == digest)
    )
    if existing:
        return existing
    count = db.scalar(
        select(func.count()).select_from(Evidence).where(Evidence.complaint_id == complaint.id)
    )
    if count >= 5:
        raise HTTPException(422, "A complaint can have at most five photographs")
    evidence = Evidence(
        id=new_id(),
        complaint_id=complaint.id,
        sha256=digest,
        media_type="image/jpeg",
        size_bytes=len(data),
    )
    evidence.object_key = f"complaints/{complaint.id}/{evidence.id}.jpg"
    try:
        storage.put(evidence.object_key, data, evidence.media_type)
    except Exception:
        raise HTTPException(
            503, "Evidence storage unavailable. Complaint remains saved; retry upload"
        ) from None
    try:
        db.add(evidence)
        db.commit()
    except Exception:
        db.rollback()
        try:
            storage.delete(evidence.object_key)
        except Exception:
            pass  # Operational orphan cleanup must reconcile storage with DB references.
        raise HTTPException(503, "Could not save evidence reference; retry upload") from None

    # Queue background photo suggestion & validation analysis
    if get_settings().analysis_state == "enabled":
        try:
            from app.worker.tasks import process_report_photo
            process_report_photo.delay(evidence.id)
        except Exception:
            pass

    return evidence


@router.get("/{tracking_id}/evidence/{evidence_id}/signed-url")
def get_signed_evidence_url(
    tracking_id: str,
    evidence_id: str,
    user: CurrentUser,
    db: Database,
):
    complaint = get_visible_complaint(db, tracking_id, user)
    evidence = db.scalar(
        select(Evidence).where(Evidence.id == evidence_id, Evidence.complaint_id == complaint.id)
    )
    if evidence is None:
        raise HTTPException(404, "Evidence not found")
    expires = int(time.time()) + 300  # 5 minutes
    sig = make_evidence_signature(tracking_id, evidence_id, expires)
    url = f"/api/v1/complaints/{tracking_id}/evidence/{evidence_id}?expires={expires}&sig={sig}"
    return {
        "signed_url": url,
        "expires_at": datetime.fromtimestamp(expires, tz=UTC).isoformat(),
    }


@router.get("/{tracking_id}/evidence/{evidence_id}")
def download_evidence(
    tracking_id: str,
    evidence_id: str,
    db: Database,
    credentials: Credentials,
    sig: str | None = None,
    expires: int | None = None,
    storage=Depends(get_storage),
):
    if sig is not None and expires is not None:
        if not verify_evidence_signature(tracking_id, evidence_id, expires, sig):
            raise HTTPException(401, "Invalid or expired photo signature")
        complaint = db.scalar(select(Complaint).where(Complaint.tracking_id == tracking_id))
        if complaint is None:
            raise HTTPException(404, "Complaint not found")
    else:
        user = current_user(credentials, db)
        complaint = get_visible_complaint(db, tracking_id, user)

    evidence = db.scalar(
        select(Evidence).where(Evidence.id == evidence_id, Evidence.complaint_id == complaint.id)
    )
    if evidence is None:
        raise HTTPException(404, "Evidence not found")
    try:
        data = storage.get(evidence.object_key)
    except Exception:
        raise HTTPException(503, "Evidence temporarily unavailable") from None
    return Response(
        content=data,
        media_type=evidence.media_type,
        headers={
            "Content-Disposition": 'inline; filename="complaint-evidence.jpg"',
            "Cache-Control": "private, max-age=300" if sig else "no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )
