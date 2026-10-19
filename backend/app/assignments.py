import hashlib
from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.config import get_settings
from app.evidence import clean_image
from app.models import Assignment, Complaint, ComplaintStatus, Evidence, Role, StatusEvent, Team, User, new_id
from app.notifications import create_notification
from app.security import CurrentUser, Database, get_visible_complaint
from app.storage import get_storage

router = APIRouter(tags=["Work Assignments"])


class AssignWorkIn(BaseModel):
    field_worker_id: str
    notes: str | None = None


class AssignmentProgressIn(BaseModel):
    action: Literal["start", "update", "resolve"]
    note: str = Field(min_length=5, max_length=1000)


class AssignmentOut(BaseModel):
    id: str
    complaint_id: str
    tracking_id: str
    title: str
    description: str
    category: str
    status: str
    latitude: float
    longitude: float
    location_text: str
    location_source: str
    assigned_by_name: str
    assigned_to_name: str
    team_name: str | None
    assignment_status: str
    notes: str | None
    assigned_at: str
    completed_at: str | None
    evidence_count: int


@router.get("/field-workers")
def list_available_field_workers(user: CurrentUser, db: Database):
    """List active field workers available for assignment in the officer's jurisdiction."""
    if user.role not in (Role.GRO, Role.SUPERVISOR, Role.ADMIN):
        raise HTTPException(403, "Staff authorization required")

    workers = list(
        db.scalars(
            select(User)
            .where(
                User.role == Role.FIELD_OFFICER,
                User.jurisdiction_id == user.jurisdiction_id,
                User.active == True,
                User.status == "active",
            )
            .order_by(User.name.asc())
        )
    )

    result = []
    for w in workers:
        team_name = None
        if w.team_id:
            team = db.get(Team, w.team_id)
            if team:
                team_name = team.name

        active_tasks = db.scalar(
            select(func.count())
            .select_from(Assignment)
            .where(Assignment.assigned_to_id == w.id, Assignment.status.in_(["assigned", "in_progress"]))
        ) or 0

        result.append({
            "id": w.id,
            "name": w.name,
            "email": w.email,
            "team_id": w.team_id,
            "team_name": team_name,
            "active_tasks_count": active_tasks,
        })
    return result


@router.post("/complaints/{tracking_id}/assign")
def assign_complaint_to_worker(
    tracking_id: str,
    data: AssignWorkIn,
    user: CurrentUser,
    db: Database,
):
    """Officer assigns a complaint to a field worker."""
    if user.role not in (Role.GRO, Role.ADMIN):
        raise HTTPException(403, "Only officers and administrators can assign work orders")

    complaint = get_visible_complaint(db, tracking_id, user)
    worker = db.get(User, data.field_worker_id)
    if not worker or worker.role != Role.FIELD_OFFICER:
        raise HTTPException(404, "Field worker not found")

    if worker.jurisdiction_id != complaint.jurisdiction_id:
        raise HTTPException(400, "Field worker belongs to a different jurisdiction")

    # Invalidate existing open assignments for this complaint
    existing_assignments = list(
        db.scalars(
            select(Assignment).where(
                Assignment.complaint_id == complaint.id,
                Assignment.status.in_(["assigned", "in_progress"]),
            )
        )
    )
    for ea in existing_assignments:
        ea.status = "cancelled"

    assignment = Assignment(
        id=new_id(),
        complaint_id=complaint.id,
        assigned_by_id=user.id,
        assigned_to_id=worker.id,
        team_id=worker.team_id,
        status="assigned",
        notes=data.notes.strip() if data.notes else None,
        assigned_at=datetime.now(UTC),
    )
    db.add(assignment)

    # Automatically move complaint from submitted to under_review if not already
    if complaint.status == ComplaintStatus.SUBMITTED:
        complaint.status = ComplaintStatus.UNDER_REVIEW
        complaint.updated_at = datetime.now(UTC)
        complaint.version += 1

    # Add audit event
    db.add(
        StatusEvent(
            id=new_id(),
            complaint_id=complaint.id,
            actor_id=user.id,
            status=complaint.status,
            note=f"Assigned to {worker.name} for site inspection and work.",
            created_at=datetime.now(UTC),
        )
    )

    # In-app notification for resident
    create_notification(
        db=db,
        user_id=complaint.citizen_id,
        title=f"Worker assigned to {complaint.tracking_id}",
        body=f"A field worker has been assigned to {complaint.tracking_id}.",
        complaint_id=complaint.tracking_id,
        link=f"/citizen/reports/{complaint.tracking_id}",
    )
    # In-app notification for field worker
    create_notification(
        db=db,
        user_id=worker.id,
        title=f"New job: {complaint.tracking_id}",
        body=f"New job: {complaint.tracking_id}.",
        complaint_id=complaint.tracking_id,
        link=f"/field?id={complaint.tracking_id}",
    )

    db.commit()

    return {
        "message": f"Assigned to {worker.name}",
        "assignment_id": assignment.id,
        "assigned_to": worker.name,
        "status": assignment.status,
    }


@router.get("/field/assignments")
def get_field_assignments(user: CurrentUser, db: Database) -> list[AssignmentOut]:
    """Field worker views their assigned tasks."""
    if user.role not in (Role.FIELD_OFFICER, Role.GRO, Role.SUPERVISOR, Role.ADMIN):
        raise HTTPException(403, "Access restricted to field workers and supervisors")

    query = (
        select(Assignment, Complaint, User, Team)
        .join(Complaint, Assignment.complaint_id == Complaint.id)
        .join(User, Assignment.assigned_by_id == User.id)
        .outerjoin(Team, Assignment.team_id == Team.id)
    )

    if user.role == Role.FIELD_OFFICER:
        query = query.where(Assignment.assigned_to_id == user.id)
    else:
        query = query.where(Complaint.jurisdiction_id == user.jurisdiction_id)

    query = query.order_by(Assignment.assigned_at.desc())
    rows = db.execute(query).all()

    result = []
    for assignment, complaint, assigner, team in rows:
        assigned_to_user = db.get(User, assignment.assigned_to_id)
        ev_count = db.scalar(
            select(func.count()).select_from(Evidence).where(Evidence.complaint_id == complaint.id)
        ) or 0

        result.append(
            AssignmentOut(
                id=assignment.id,
                complaint_id=complaint.id,
                tracking_id=complaint.tracking_id,
                title=complaint.title,
                description=complaint.description,
                category=complaint.category,
                status=complaint.status,
                latitude=complaint.latitude,
                longitude=complaint.longitude,
                location_text=complaint.location_text,
                location_source=complaint.location_source,
                assigned_by_name=assigner.name,
                assigned_to_name=assigned_to_user.name if assigned_to_user else "Field worker",
                team_name=team.name if team else None,
                assignment_status=assignment.status,
                notes=assignment.notes,
                assigned_at=assignment.assigned_at.isoformat() if assignment.assigned_at else "",
                completed_at=assignment.completed_at.isoformat() if assignment.completed_at else None,
                evidence_count=ev_count,
            )
        )

    return result


@router.post("/field/assignments/{assignment_id}/progress")
def update_assignment_progress(
    assignment_id: str,
    data: AssignmentProgressIn,
    user: CurrentUser,
    db: Database,
):
    """Field worker updates work status ('start', 'update', 'resolve')."""
    assignment = db.get(Assignment, assignment_id)
    if not assignment:
        raise HTTPException(404, "Assignment not found")

    if user.role != Role.ADMIN and assignment.assigned_to_id != user.id:
        raise HTTPException(403, "You can only update tasks assigned to you")

    complaint = db.get(Complaint, assignment.complaint_id)
    if not complaint:
        raise HTTPException(404, "Associated complaint not found")

    now = datetime.now(UTC)

    if data.action == "start":
        assignment.status = "in_progress"
        complaint.status = ComplaintStatus.IN_PROGRESS
        complaint.version += 1
        complaint.updated_at = now
        db.add(
            StatusEvent(
                id=new_id(),
                complaint_id=complaint.id,
                actor_id=user.id,
                status=ComplaintStatus.IN_PROGRESS,
                note=data.note.strip(),
                created_at=now,
            )
        )
    elif data.action == "update":
        complaint.updated_at = now
        db.add(
            StatusEvent(
                id=new_id(),
                complaint_id=complaint.id,
                actor_id=user.id,
                status=complaint.status,
                note=f"[Field note] {data.note.strip()}",
                created_at=now,
            )
        )
    elif data.action == "resolve":
        assignment.status = "completed"
        assignment.completed_at = now
        complaint.status = ComplaintStatus.RESOLVED
        complaint.version += 1
        complaint.updated_at = now
        db.add(
            StatusEvent(
                id=new_id(),
                complaint_id=complaint.id,
                actor_id=user.id,
                status=ComplaintStatus.RESOLVED,
                note=data.note.strip(),
                created_at=now,
            )
        )

    db.commit()

    return {
        "message": f"Assignment updated ({data.action})",
        "assignment_status": assignment.status,
        "complaint_status": complaint.status,
    }


@router.post("/field/tasks/{report_id}/progress")
def submit_field_task_progress(
    report_id: str,
    user: CurrentUser,
    db: Database,
    status: Literal["started", "note", "fixed"] = Form(...),
    note: str | None = Form(default=None),
    before_photo: UploadFile | None = File(default=None),
    after_photo: UploadFile | None = File(default=None),
    storage=Depends(get_storage),
):
    """Field worker updates work with before and after photos."""
    if user.role not in (Role.FIELD_OFFICER, Role.ADMIN):
        raise HTTPException(403, "Field worker authorization required")

    assignment = db.scalar(
        select(Assignment).where(
            (Assignment.id == report_id)
            | (Assignment.complaint_id == report_id)
        )
    )
    if not assignment:
        complaint = db.scalar(select(Complaint).where(Complaint.tracking_id == report_id))
        if complaint:
            assignment = db.scalar(select(Assignment).where(Assignment.complaint_id == complaint.id))

    if not assignment:
        raise HTTPException(404, "Work order or assignment not found")

    complaint = db.get(Complaint, assignment.complaint_id)
    if not complaint:
        raise HTTPException(404, "Associated complaint not found")

    if user.role != Role.ADMIN and assignment.assigned_to_id != user.id:
        raise HTTPException(403, "You can only update tasks assigned to you")

    now = datetime.now(UTC)

    def save_photo(upload: UploadFile, phase: str):
        raw = upload.file.read(get_settings().max_image_bytes + 1)
        if len(raw) > get_settings().max_image_bytes:
            raise HTTPException(413, f"{phase.title()} photo must be 8 MiB or smaller")
        data = clean_image(raw)
        digest = hashlib.sha256(data).hexdigest()
        existing = db.scalar(
            select(Evidence).where(Evidence.complaint_id == complaint.id, Evidence.sha256 == digest)
        )
        if existing:
            existing.phase = phase
            existing.taken_at = now
            return existing

        ev = Evidence(
            id=new_id(),
            complaint_id=complaint.id,
            sha256=digest,
            media_type="image/jpeg",
            size_bytes=len(data),
            phase=phase,
            taken_at=now,
        )
        ev.object_key = f"complaints/{complaint.id}/{ev.id}.jpg"
        storage.put(ev.object_key, data, "image/jpeg")
        db.add(ev)
        return ev

    # Rule: marking Fixed needs at least one after photo
    existing_after = db.scalar(
        select(func.count())
        .select_from(Evidence)
        .where(Evidence.complaint_id == complaint.id, Evidence.phase == "after")
    ) or 0

    has_after_upload = after_photo is not None and getattr(after_photo, "filename", None)
    if status == "fixed" and not has_after_upload and existing_after == 0:
        raise HTTPException(422, "Please attach at least one after photo to mark this job as fixed.")

    if before_photo and getattr(before_photo, "filename", None):
        save_photo(before_photo, "before")

    if after_photo and getattr(after_photo, "filename", None):
        save_photo(after_photo, "after")

    plain_note = (note or "").strip()

    if status == "started":
        assignment.status = "in_progress"
        complaint.status = ComplaintStatus.IN_PROGRESS
        complaint.version += 1
        complaint.updated_at = now
        db.add(
            StatusEvent(
                id=new_id(),
                complaint_id=complaint.id,
                actor_id=user.id,
                status=ComplaintStatus.IN_PROGRESS,
                note=plain_note or "Work started on site.",
                created_at=now,
            )
        )
        # Notify officer & resident
        create_notification(
            db=db,
            user_id=assignment.assigned_by_id,
            title=f"Work started: {complaint.tracking_id}",
            body=f"{user.name} started work on {complaint.tracking_id}.",
            complaint_id=complaint.tracking_id,
            link=f"/officer?id={complaint.tracking_id}",
        )
        create_notification(
            db=db,
            user_id=complaint.citizen_id,
            title=f"Work started: {complaint.tracking_id}",
            body=f"Work has started on {complaint.tracking_id}.",
            complaint_id=complaint.tracking_id,
        )
    elif status == "fixed":
        assignment.status = "completed"
        assignment.completed_at = now
        complaint.status = ComplaintStatus.RESOLVED
        complaint.version += 1
        complaint.updated_at = now
        db.add(
            StatusEvent(
                id=new_id(),
                complaint_id=complaint.id,
                actor_id=user.id,
                status=ComplaintStatus.RESOLVED,
                note=plain_note or "Repair completed on site.",
                created_at=now,
            )
        )
        # Notify officer & resident
        create_notification(
            db=db,
            user_id=assignment.assigned_by_id,
            title=f"Job finished: {complaint.tracking_id}",
            body=f"{user.name} finished {complaint.tracking_id}. Have a look.",
            complaint_id=complaint.tracking_id,
            link=f"/officer?id={complaint.tracking_id}",
        )
        create_notification(
            db=db,
            user_id=complaint.citizen_id,
            title=f"Report fixed: {complaint.tracking_id}",
            body=f"Your report {complaint.tracking_id} is fixed. You can reopen it if it is not.",
            complaint_id=complaint.tracking_id,
        )
    elif status == "note":
        complaint.updated_at = now
        db.add(
            StatusEvent(
                id=new_id(),
                complaint_id=complaint.id,
                actor_id=user.id,
                status=complaint.status,
                note=f"[Field note] {plain_note or 'Field worker added an update.'}",
                created_at=now,
            )
        )
        if assignment.assigned_by_id:
            create_notification(
                db=db,
                user_id=assignment.assigned_by_id,
                title=f"Note on {complaint.tracking_id}",
                body=f"The field worker left a note on {complaint.tracking_id}.",
                complaint_id=complaint.tracking_id,
                link=f"/officer?id={complaint.tracking_id}",
            )

    db.commit()

    return {
        "message": f"Job updated ({status})",
        "assignment_status": assignment.status,
        "complaint_status": complaint.status,
    }

