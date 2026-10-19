"""Suggestions, incident matching, and ML decision support endpoints."""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.ml.incident_matcher import (
    compute_text_embedding,
    find_possible_duplicates,
)
from app.ml.photo_classifier import (
    CATEGORY_PLAIN_NAMES,
    CATEGORY_TO_MODEL,
    dhash_distance,
    run_photo_classification,
)
from app.ml.priority_engine import compute_priority_recommendation
from app.models import (
    CategoryRecord,
    Complaint,
    EscalationEvent,
    Evidence,
    IncidentLink,
    MLFeedback,
    MLPrediction,
    Notification,
    PhotoSignal,
    Role,
    StatusEvent,
    User,
    new_id,
)
from app.security import CurrentUser, Database

router = APIRouter(tags=["suggestions"])

# Only staff roles can access suggestions and duplicates
StaffUser = CurrentUser


def require_staff_user(user: StaffUser) -> User:
    if user.role not in (Role.GRO, Role.SUPERVISOR, Role.ADMIN, Role.APPELLATE_OFFICER):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Suggestions are reserved for city officers and authorities.",
        )
    return user


class FeedbackIn(BaseModel):
    feedback_choice: str = Field(description="'right' or 'wrong' / 'looks_right' or 'not_right'")
    note: str | None = None


class DuplicateDecisionIn(BaseModel):
    decision: str = Field(description="'same_problem', 'different_problem', or 'recurrence'")
    reason: str | None = None
    propagate_to_linked: bool = False


@router.get("/reports/{tracking_or_id}/suggestions")
def get_report_suggestions(
    tracking_or_id: str,
    user: Annotated[User, Depends(require_staff_user)],
    db: Database,
) -> dict[str, Any]:
    """Return software suggestions, photo analysis, same-photo detection, and priority rationale."""
    settings = get_settings()
    complaint = db.scalar(
        select(Complaint).where(
            or_(Complaint.id == tracking_or_id, Complaint.tracking_id == tracking_or_id)
        )
    )
    if not complaint:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    # Fetch stored predictions
    stored_preds = list(
        db.scalars(
            select(MLPrediction)
            .where(MLPrediction.report_id == complaint.id)
            .order_by(MLPrediction.created_at.desc())
        )
    )

    # Fetch existing feedback for this report
    pred_ids = [p.id for p in stored_preds]
    feedbacks = []
    if pred_ids:
        feedbacks = list(
            db.scalars(
                select(MLFeedback).where(MLFeedback.prediction_id.in_(pred_ids))
            )
        )
    feedback_map = {f.prediction_id: f.feedback_choice for f in feedbacks}

    predictions_out: list[dict[str, Any]] = []
    primary_suggestion: str | None = None
    relevance_hint: str | None = None

    for p in stored_preds:
        try:
            data = json.loads(p.output_json)
        except Exception:
            data = {}
        pred_item = {
            "id": p.id,
            "kind": p.kind,
            "model_name": p.model_name,
            "display": data.get("display") or data.get("display_text") or ("; ".join(data.get("reasons", [])) if data.get("reasons") else None),
            "decision": data.get("decision") or data.get("authenticity_level"),
            "score": data.get("score"),
            "feedback": feedback_map.get(p.id),
            "created_at": p.created_at.isoformat(),
        }
        predictions_out.append(pred_item)

        if not primary_suggestion and data.get("display"):
            if data.get("decision") in ("certain", "uncertain"):
                primary_suggestion = data.get("display")
        if not relevance_hint and data.get("relevance_hint"):
            relevance_hint = data.get("relevance_hint")

    # Same-photo check (dHash distance <= 6 or identical sha256 against other reporters)
    same_photo_hint: str | None = None
    evidences = list(db.scalars(select(Evidence).where(Evidence.complaint_id == complaint.id)))
    for ev in evidences:
        if ev.dhash or ev.sha256:
            # Look for other evidence from other citizens
            other_ev = list(
                db.scalars(
                    select(Evidence)
                    .join(Complaint, Evidence.complaint_id == Complaint.id)
                    .where(
                        Evidence.complaint_id != complaint.id,
                        Complaint.citizen_id != complaint.citizen_id,
                    )
                    .limit(50)
                )
            )
            for oe in other_ev:
                is_same = False
                if ev.sha256 and oe.sha256 and ev.sha256 == oe.sha256:
                    is_same = True
                elif ev.dhash and oe.dhash and dhash_distance(ev.dhash, oe.dhash) <= 6:
                    is_same = True

                if is_same:
                    other_c = db.get(Complaint, oe.complaint_id)
                    if other_c:
                        same_photo_hint = f"This photo looks the same as one on {other_c.tracking_id}. It may be the same place."
                        break
        if same_photo_hint:
            break

    # Target category configuration
    cat_rec = db.scalar(select(CategoryRecord).where(CategoryRecord.code == complaint.category))
    target_hours = cat_rec.target_hours if cat_rec else 48

    # Confirmed duplicates count
    confirmed_links = list(
        db.scalars(
            select(IncidentLink).where(
                or_(IncidentLink.report_id_1 == complaint.id, IncidentLink.report_id_2 == complaint.id),
                IncidentLink.decision == "same_problem",
            )
        )
    )
    duplicate_count = 1 + len(confirmed_links)

    # Compute priority recommendation
    prio_info = compute_priority_recommendation(
        complaint=complaint,
        target_hours=target_hours,
        confirmed_duplicate_count=duplicate_count,
        photo_defect_confirmed=bool(primary_suggestion and "Looks like" in primary_suggestion),
    )

    # Check photo authenticity signals
    authenticity_info = None
    sig_row = db.scalar(
        select(PhotoSignal)
        .where(
            PhotoSignal.complaint_id == complaint.id,
            PhotoSignal.authenticity_level == "look_closer",
        )
        .order_by(PhotoSignal.created_at.desc())
        .limit(1)
    )
    if sig_row:
        try:
            reasons = json.loads(sig_row.reasons_json or "[]")
        except Exception:
            reasons = []
        authenticity_info = {
            "level": "look_closer",
            "reasons": reasons[:2],
            "disclaimer": "Suggestions come from software. You decide.",
        }

    return {
        "disclaimer": "Suggestions come from software. You decide.",
        "primary_suggestion": primary_suggestion,
        "relevance_hint": relevance_hint,
        "same_photo_hint": same_photo_hint,
        "priority_info": prio_info,
        "authenticity_info": authenticity_info,
        "predictions": predictions_out,
        "confirmed_duplicate_count": duplicate_count,
        "enabled": settings.ml_enabled,
    }


@router.post("/suggestions/{prediction_id}/feedback")
def submit_suggestion_feedback(
    prediction_id: str,
    payload: FeedbackIn,
    user: Annotated[User, Depends(require_staff_user)],
    db: Database,
) -> dict[str, Any]:
    """Store officer feedback ('right' or 'wrong') on a suggestion."""
    pred = db.get(MLPrediction, prediction_id)
    if not pred:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Suggestion not found")

    # Standardize choice
    choice = payload.feedback_choice.lower()
    if choice in ("looks_right", "right", "correct"):
        choice = "right"
    else:
        choice = "wrong"

    # Upsert feedback
    fb = db.scalar(
        select(MLFeedback).where(
            MLFeedback.prediction_id == prediction_id, MLFeedback.user_id == user.id
        )
    )
    if fb:
        fb.feedback_choice = choice
        fb.note = payload.note
    else:
        fb = MLFeedback(
            id=new_id(),
            prediction_id=prediction_id,
            user_id=user.id,
            feedback_choice=choice,
            note=payload.note,
            created_at=datetime.now(UTC),
        )
        db.add(fb)

    db.commit()
    return {"status": "saved", "feedback_choice": choice}


@router.get("/reports/{tracking_or_id}/duplicates")
def get_report_duplicates(
    tracking_or_id: str,
    user: Annotated[User, Depends(require_staff_user)],
    db: Database,
) -> list[dict[str, Any]]:
    """Return top 3 potential duplicate candidates using Strategy 2 formula."""
    complaint = db.scalar(
        select(Complaint).where(
            or_(Complaint.id == tracking_or_id, Complaint.tracking_id == tracking_or_id)
        )
    )
    if not complaint:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    # Find candidates
    candidates = find_possible_duplicates(db=db, target=complaint, max_candidates=3)

    # Attach thumbnail URL and confirmed link decision if already decided
    for cand in candidates:
        # Check if already linked
        link = db.scalar(
            select(IncidentLink).where(
                or_(
                    (IncidentLink.report_id_1 == complaint.id) & (IncidentLink.report_id_2 == cand["id"]),
                    (IncidentLink.report_id_1 == cand["id"]) & (IncidentLink.report_id_2 == complaint.id),
                )
            )
        )
        cand["existing_decision"] = link.decision if link else None
        cand["link_id"] = link.id if link else None

        # Evidence thumbnail
        ev = db.scalar(
            select(Evidence)
            .where(Evidence.complaint_id == cand["id"])
            .order_by(Evidence.uploaded_at.asc())
        )
        cand["thumbnail_url"] = (
            f"/api/v1/complaints/{cand['tracking_id']}/evidence/{ev.id}" if ev else None
        )

    return candidates


@router.post("/reports/{tracking_or_id}/duplicates/{other_id}")
def link_duplicate_decision(
    tracking_or_id: str,
    other_id: str,
    payload: DuplicateDecisionIn,
    user: Annotated[User, Depends(require_staff_user)],
    db: Database,
) -> dict[str, Any]:
    """Officer confirms: 'same_problem', 'different_problem', or 'recurrence'."""
    c1 = db.scalar(
        select(Complaint).where(
            or_(Complaint.id == tracking_or_id, Complaint.tracking_id == tracking_or_id)
        )
    )
    c2 = db.scalar(
        select(Complaint).where(
            or_(Complaint.id == other_id, Complaint.tracking_id == other_id)
        )
    )
    if not c1 or not c2:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reports not found")

    valid_decisions = ("same_problem", "different_problem", "recurrence")
    if payload.decision not in valid_decisions:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid duplicate decision")

    # Find or create IncidentLink
    link = db.scalar(
        select(IncidentLink).where(
            or_(
                (IncidentLink.report_id_1 == c1.id) & (IncidentLink.report_id_2 == c2.id),
                (IncidentLink.report_id_1 == c2.id) & (IncidentLink.report_id_2 == c1.id),
            )
        )
    )

    decision_label = (
        "same problem"
        if payload.decision == "same_problem"
        else "different problem"
        if payload.decision == "different_problem"
        else "recurrence after fix"
    )

    if link:
        link.decision = payload.decision
        link.reviewer_id = user.id
        link.reason = payload.reason
    else:
        link = IncidentLink(
            id=new_id(),
            report_id_1=c1.id,
            report_id_2=c2.id,
            decision=payload.decision,
            reviewer_id=user.id,
            reason=payload.reason,
            created_at=datetime.now(UTC),
        )
        db.add(link)

    # Add internal timeline event
    event = StatusEvent(
        id=new_id(),
        complaint_id=c1.id,
        actor_id=user.id,
        status=c1.status,
        note=f"Officer confirmed {c2.tracking_id} is {decision_label}.",
        created_at=datetime.now(UTC),
    )
    db.add(event)

    db.commit()
    return {"status": "linked", "decision": payload.decision, "link_id": link.id}


@router.delete("/reports/{tracking_or_id}/duplicates/{other_id}")
def undo_duplicate_link(
    tracking_or_id: str,
    other_id: str,
    user: Annotated[User, Depends(require_staff_user)],
    db: Database,
) -> dict[str, Any]:
    """Reversible undo for an officer duplicate decision."""
    c1 = db.scalar(
        select(Complaint).where(
            or_(Complaint.id == tracking_or_id, Complaint.tracking_id == tracking_or_id)
        )
    )
    c2 = db.scalar(
        select(Complaint).where(
            or_(Complaint.id == other_id, Complaint.tracking_id == other_id)
        )
    )
    if not c1 or not c2:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reports not found")

    db.execute(
        delete(IncidentLink).where(
            or_(
                (IncidentLink.report_id_1 == c1.id) & (IncidentLink.report_id_2 == c2.id),
                (IncidentLink.report_id_1 == c2.id) & (IncidentLink.report_id_2 == c1.id),
            )
        )
    )

    event = StatusEvent(
        id=new_id(),
        complaint_id=c1.id,
        actor_id=user.id,
        status=c1.status,
        note=f"Officer reversed duplicate link with {c2.tracking_id}.",
        created_at=datetime.now(UTC),
    )
    db.add(event)
    db.commit()

    return {"status": "undone"}


@router.post("/reports/{tracking_or_id}/recheck")
def recheck_report_ml(
    tracking_or_id: str,
    user: Annotated[User, Depends(require_staff_user)],
    db: Database,
) -> dict[str, Any]:
    """Officer requests fresh photo check and duplicate calculation."""
    complaint = db.scalar(
        select(Complaint).where(
            or_(Complaint.id == tracking_or_id, Complaint.tracking_id == tracking_or_id)
        )
    )
    if not complaint:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    settings = get_settings()
    evidences = list(db.scalars(select(Evidence).where(Evidence.complaint_id == complaint.id)))
    for ev in evidences:
        img_path = Path(settings.local_storage_path) / ev.object_key
        if img_path.exists():
            res = run_photo_classification(img_path, target_category=complaint.category)
            if res.get("dhash"):
                ev.dhash = res["dhash"]
                db.add(ev)

            # Record predictions
            for m_name, pred in res.get("predictions", {}).items():
                pred_row = MLPrediction(
                    id=new_id(),
                    kind="photo_check",
                    report_id=complaint.id,
                    photo_id=ev.id,
                    model_name=m_name,
                    model_version=pred.get("model_version", "v1.0"),
                    output_json=json.dumps(pred),
                    created_at=datetime.now(UTC),
                )
                db.add(pred_row)

    # Recompute embeddings
    emb = compute_text_embedding(f"{complaint.title} {complaint.description}")
    complaint.embedding_json = json.dumps(emb)
    db.add(complaint)
    db.commit()

    return {"status": "rechecked"}


@router.post("/photo-check/preview")
async def citizen_photo_preview(
    category: Annotated[str, Form(...)],
    file: UploadFile = File(...),
) -> dict[str, Any]:
    """Citizen photo preview hint: rates photo and suggests category change if clearly different."""
    # Enforce size limit
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Photo must be under 5 MB.")

    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as tmp:
        tmp.write(content)
        tmp_path = Path(tmp.name)

    try:
        res = run_photo_classification(tmp_path, target_category=category)
    finally:
        try:
            tmp_path.unlink()
        except Exception:
            pass

    flagged = res.get("flagged_categories", [])
    if flagged and category not in flagged:
        detected = flagged[0]
        detected_plain = CATEGORY_PLAIN_NAMES.get(detected, detected)
        return {
            "hint": f"This looks more like {detected_plain}. Change the category?",
            "suggested_category": detected,
        }

    return {"hint": None, "suggested_category": None}


@router.post("/complaints/{tracking_or_id}/escalation/remind")
def senior_remind_officer(
    tracking_or_id: str,
    user: Annotated[User, Depends(require_staff_user)],
    db: Database,
) -> dict[str, Any]:
    """Senior authority presses 'Remind the officer' on an escalated report."""
    if user.role not in (Role.SUPERVISOR, Role.ADMIN):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only senior authorities can send reminders.")

    complaint = db.scalar(
        select(Complaint).where(
            or_(Complaint.id == tracking_or_id, Complaint.tracking_id == tracking_or_id)
        )
    )
    if not complaint:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    # Add internal note to timeline
    event = StatusEvent(
        id=new_id(),
        complaint_id=complaint.id,
        actor_id=user.id,
        status=complaint.status,
        note="Senior authority sent a reminder to the team.",
        created_at=datetime.now(UTC),
    )
    db.add(event)

    # Notify officer(s) in municipality
    officers = list(db.scalars(select(User).where(User.role.in_([Role.GRO, Role.SUPERVISOR]))))
    for off in officers:
        notif = Notification(
            id=new_id(),
            user_id=off.id,
            title="Reminder on overdue report",
            body=f"Senior authority sent a reminder regarding {complaint.tracking_id} ({complaint.title}).",
            link=f"/officer?id={complaint.tracking_id}",
            read=False,
            created_at=datetime.now(UTC),
        )
        db.add(notif)

    db.commit()
    return {"status": "reminded"}


@router.get("/admin/suggestions/summary")
def get_admin_suggestions_summary(
    user: Annotated[User, Depends(require_staff_user)],
    db: Database,
) -> dict[str, Any]:
    """Admin summary of ML suggestions and officer feedback for the last 30 days."""
    if user.role != Role.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")

    settings = get_settings()
    thirty_days_ago = datetime.now(UTC) - timedelta(days=30)

    # Check model file availability on disk
    models_dir = Path(settings.ml_assets_dir) / "models"
    models_exist = models_dir.exists() and any(models_dir.glob("*.onnx"))

    total_preds = db.scalar(
        select(func.count())
        .select_from(MLPrediction)
        .where(MLPrediction.created_at >= thirty_days_ago)
    ) or 0

    feedback_rows = list(
        db.scalars(
            select(MLFeedback).where(MLFeedback.created_at >= thirty_days_ago)
        )
    )
    looks_right = sum(1 for f in feedback_rows if f.feedback_choice == "right")
    not_right = sum(1 for f in feedback_rows if f.feedback_choice == "wrong")

    def get_status(enabled: bool, has_model: bool) -> str:
        if not enabled:
            return "Turned off"
        if not has_model:
            return "Not set up"
        return "Working"

    feature_stats = {}
    for kind in ["photo_check", "duplicate_match", "priority_suggestion", "citizen_photo_hint", "photo_authenticity"]:
        shown = db.scalar(
            select(func.count())
            .select_from(MLPrediction)
            .where(MLPrediction.kind == kind, MLPrediction.created_at >= thirty_days_ago)
        ) or 0
        agreed = db.scalar(
            select(func.count())
            .select_from(MLFeedback)
            .join(MLPrediction, MLFeedback.prediction_id == MLPrediction.id)
            .where(MLPrediction.kind == kind, MLFeedback.feedback_choice == "right", MLFeedback.created_at >= thirty_days_ago)
        ) or 0
        not_right_feat = db.scalar(
            select(func.count())
            .select_from(MLFeedback)
            .join(MLPrediction, MLFeedback.prediction_id == MLPrediction.id)
            .where(MLPrediction.kind == kind, MLFeedback.feedback_choice == "wrong", MLFeedback.created_at >= thirty_days_ago)
        ) or 0
        feature_stats[kind] = {
            "shown": shown,
            "agreed": agreed,
            "not_right": not_right_feat,
        }

    return {
        "master_enabled": settings.ml_enabled,
        "features": {
            "photo_check": {
                "name": "Photo check",
                "status": get_status(settings.photo_check_enabled, models_exist),
            },
            "duplicate_match": {
                "name": "Possible duplicates",
                "status": "Working" if settings.duplicate_match_enabled else "Turned off",
            },
            "priority_suggestion": {
                "name": "Suggested priority",
                "status": "Working" if settings.priority_suggestion_enabled else "Turned off",
            },
            "citizen_photo_hint": {
                "name": "Photo hint for residents",
                "status": get_status(settings.citizen_photo_hint_enabled, models_exist),
            },
            "photo_authenticity": {
                "name": "Check photos for edits",
                "status": "Working" if getattr(settings, "photo_authenticity_enabled", True) else "Turned off",
            },
        },
        "stats_30_days": {
            "suggestions_made": total_preds,
            "looks_right_count": looks_right,
            "not_right_count": not_right,
        },
        "feature_stats": feature_stats,
    }
