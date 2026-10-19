import hashlib
import json
import secrets
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError

from app.config import get_settings
from app.models import Assignment, Complaint, ComplaintStatus, Evidence, Role, StatusEvent, Team, User, now_utc
from app.notifications import create_notification
from app.schemas import ComplaintCreate, ComplaintDetail, ComplaintPage, StatusUpdate
from app.security import CurrentUser, Database, can_review, get_visible_complaint

router = APIRouter(prefix="/complaints", tags=["Complaints"])

TRANSITIONS = {
    "submitted": {"under_review"},
    "under_review": {"in_progress", "resolved", "rejected"},
    "in_progress": {"under_review", "resolved"},
    "resolved": {"under_review"},
    "rejected": {"under_review"},
}


def extract_area_name(location_text: str) -> str:
    known_areas = [
        "Fort Kochi", "Mattancherry", "Marine Drive", "Edappally",
        "Kaloor", "Panampilly Nagar", "Vyttila", "Palarivattom",
        "Kakkanad", "Ernakulam South", "Ernakulam North", "Thrikkakara"
    ]
    for area in known_areas:
        if area.lower() in location_text.lower():
            return area
    parts = location_text.split(",")
    if parts and parts[0].strip():
        first = parts[0].strip()
        if len(first) <= 40:
            return first
    return "Central Ward"


def complaint_detail(db, complaint):
    import time
    from app.evidence import make_evidence_signature
    from app.schemas import ComplaintOut, EvidenceOut

    expires = int(time.time()) + 300  # 5 minutes
    evidence_items = []
    for ev in db.scalars(
        select(Evidence)
        .where(Evidence.complaint_id == complaint.id)
        .order_by(Evidence.uploaded_at, Evidence.id)
    ):
        sig = make_evidence_signature(complaint.tracking_id, ev.id, expires)
        signed_url = f"/api/v1/complaints/{complaint.tracking_id}/evidence/{ev.id}?expires={expires}&sig={sig}"
        evidence_items.append(
            EvidenceOut(
                id=ev.id,
                media_type=ev.media_type,
                size_bytes=ev.size_bytes,
                uploaded_at=ev.uploaded_at,
                phase=getattr(ev, "phase", "report") or "report",
                taken_at=getattr(ev, "taken_at", None),
                signed_url=signed_url,
            )
        )

    # Check current active assignment
    active_assign = db.scalar(
        select(Assignment)
        .where(Assignment.complaint_id == complaint.id, Assignment.status.in_(["assigned", "in_progress"]))
        .order_by(Assignment.assigned_at.desc())
        .limit(1)
    )
    assigned_worker_id = None
    assigned_worker_name = None
    assigned_team_name = None
    if active_assign:
        worker = db.get(User, active_assign.assigned_to_id)
        if worker:
            assigned_worker_id = worker.id
            assigned_worker_name = worker.name
            if worker.team_id:
                team = db.get(Team, worker.team_id)
                assigned_team_name = team.name if team else None

    # Attach cluster_count
    try:
        from app.models import IncidentClusterMember
        member_rec = db.scalar(select(IncidentClusterMember).where(IncidentClusterMember.report_id == complaint.id))
        if member_rec:
            complaint.cluster_count = db.scalar(
                select(func.count(IncidentClusterMember.id)).where(IncidentClusterMember.cluster_id == member_rec.cluster_id)
            ) or 1
        else:
            complaint.cluster_count = 1
    except Exception:
        complaint.cluster_count = 1

    return ComplaintDetail(
        **ComplaintOut.model_validate(complaint).model_dump(),
        events=list(
            db.scalars(
                select(StatusEvent)
                .where(StatusEvent.complaint_id == complaint.id)
                .order_by(StatusEvent.created_at, StatusEvent.id)
            )
        ),
        evidence=evidence_items,
        assigned_worker_id=assigned_worker_id,
        assigned_worker_name=assigned_worker_name,
        assigned_team_name=assigned_team_name,
    )


@router.post("", response_model=ComplaintDetail, status_code=201)
def submit(data: ComplaintCreate, user: CurrentUser, db: Database):
    if user.role != Role.CITIZEN:
        raise HTTPException(403, "Only citizen accounts can submit complaints")
    payload = data.model_dump(mode="json")
    request_hash = hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
    request_id = str(data.client_request_id)

    def existing_retry():
        existing = db.scalar(
            select(Complaint).where(
                Complaint.citizen_id == user.id, Complaint.client_request_id == request_id
            )
        )
        if existing and existing.request_hash != request_hash:
            raise HTTPException(409, "Retry ID already used with different complaint details")
        return existing

    existing = existing_retry()
    if existing:
        return complaint_detail(db, existing)
    complaint = Complaint(
        **{k: v for k, v in payload.items() if k != "client_request_id"},
        client_request_id=request_id,
        request_hash=request_hash,
        citizen_id=user.id,
        jurisdiction_id=get_settings().jurisdiction_id,
        tracking_id=f"GG-{now_utc():%Y}-{secrets.token_hex(6).upper()}",
        area_name=extract_area_name(data.location_text),
    )
    db.add(complaint)
    try:
        db.flush()
        db.add(
            StatusEvent(
                complaint_id=complaint.id,
                actor_id=user.id,
                status="submitted",
                note="Complaint received. Awaiting officer review.",
            )
        )
        # In-app notification for resident
        create_notification(
            db=db,
            user_id=user.id,
            title=f"Report {complaint.tracking_id} received",
            body=f"Your report {complaint.tracking_id} was received.",
            complaint_id=complaint.tracking_id,
            link=f"/citizen/reports/{complaint.tracking_id}",
        )
        # In-app notification for GRO staff in this jurisdiction
        officers = db.scalars(
            select(User).where(User.jurisdiction_id == complaint.jurisdiction_id, User.role == Role.GRO, User.active == True)
        ).all()
        for off in officers:
            create_notification(
                db=db,
                user_id=off.id,
                title=f"New report: {complaint.tracking_id}",
                body=f"New report in your area: {complaint.tracking_id}.",
                complaint_id=complaint.tracking_id,
                link=f"/officer?id={complaint.tracking_id}",
            )
        db.commit()

        # Incremental analysis: cluster assignment, duplicate matching, priority recommendation
        try:
            from app.ml.cluster_engine import assign_report_to_cluster
            assign_report_to_cluster(db, complaint)
        except Exception:
            pass

        if get_settings().analysis_state == "enabled":
            try:
                from app.worker.tasks import match_incidents, compute_priority
                match_incidents.delay(complaint.id)
                compute_priority.delay(complaint.id)
            except Exception:
                pass
    except IntegrityError:
        db.rollback()
        existing = existing_retry()
        if existing:
            return complaint_detail(db, existing)
        raise HTTPException(409, "Registration conflict; retry the same request") from None
    return complaint_detail(db, complaint)


@router.get("", response_model=ComplaintPage)
def list_complaints(
    user: CurrentUser,
    db: Database,
    status: ComplaintStatus | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 25,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    query = select(Complaint)
    if user.role == Role.CITIZEN:
        query = query.where(Complaint.citizen_id == user.id)
    elif can_review(user):
        query = query.where(Complaint.jurisdiction_id == user.jurisdiction_id)
    else:
        raise HTTPException(403, "This role has no queue access in this milestone")
    if status is not None:
        query = query.where(Complaint.status == status)
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    items = list(
        db.scalars(
            query.order_by(Complaint.received_at.desc(), Complaint.id).offset(offset).limit(limit)
        )
    )
    item_ids = [c.id for c in items]
    if item_ids:
        try:
            from app.models import IncidentClusterMember
            member_rows = db.execute(
                select(IncidentClusterMember.report_id, IncidentClusterMember.cluster_id)
                .where(IncidentClusterMember.report_id.in_(item_ids))
            ).all()
            cl_ids = [r[1] for r in member_rows if r[1]]
            if cl_ids:
                counts_by_cl = dict(
                    db.execute(
                        select(IncidentClusterMember.cluster_id, func.count(IncidentClusterMember.id))
                        .where(IncidentClusterMember.cluster_id.in_(cl_ids))
                        .group_by(IncidentClusterMember.cluster_id)
                    ).all()
                )
                report_cl_map = {r[0]: counts_by_cl.get(r[1], 1) for r in member_rows}
                for c in items:
                    c.cluster_count = report_cl_map.get(c.id, 1)
        except Exception:
            pass

    return ComplaintPage(items=items, total=total, offset=offset, limit=limit)


@router.get("/{tracking_id}", response_model=ComplaintDetail)
def get_complaint(tracking_id: str, user: CurrentUser, db: Database):
    return complaint_detail(db, get_visible_complaint(db, tracking_id, user))


@router.post("/{tracking_id}/status", response_model=ComplaintDetail)
def set_status(tracking_id: str, data: StatusUpdate, user: CurrentUser, db: Database):
    if not can_review(user):
        raise HTTPException(403, "Only the jurisdiction's GRO can change complaint status")
    complaint = get_visible_complaint(db, tracking_id, user)
    if complaint.version != data.expected_version:
        raise HTTPException(409, "Complaint changed. Refresh before updating")
    if data.status not in TRANSITIONS[complaint.status]:
        raise HTTPException(422, "Status transition is not allowed")
    result = db.execute(
        update(Complaint)
        .where(
            Complaint.id == complaint.id,
            Complaint.version == data.expected_version,
        )
        .values(status=data.status, version=data.expected_version + 1, updated_at=now_utc())
        .execution_options(synchronize_session=False)
    )
    if result.rowcount != 1:
        db.rollback()
        raise HTTPException(409, "Complaint changed. Refresh before updating")
    db.add(
        StatusEvent(complaint_id=complaint.id, actor_id=user.id, status=data.status, note=data.note)
    )
    # Notify resident of status update
    status_msg = {
        "under_review": f"Your report {complaint.tracking_id} is being reviewed.",
        "in_progress": f"Work has started on {complaint.tracking_id}.",
        "resolved": f"Your report {complaint.tracking_id} is fixed. You can reopen it if it is not.",
        "rejected": f"Your report {complaint.tracking_id} was not accepted.",
    }.get(data.status, f"Update on {complaint.tracking_id}.")

    create_notification(
        db=db,
        user_id=complaint.citizen_id,
        title=f"Update on {complaint.tracking_id}",
        body=status_msg,
        complaint_id=complaint.tracking_id,
        link=f"/citizen/reports/{complaint.tracking_id}",
    )
    db.commit()
    db.refresh(complaint)
    return complaint_detail(db, complaint)
