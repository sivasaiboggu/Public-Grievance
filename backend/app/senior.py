from datetime import UTC, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func, or_, select

from app.models import Assignment, CategoryRecord, Complaint, ComplaintStatus, Evidence, Role, StatusEvent, Team, User
from app.schemas import ComplaintOut, ComplaintPage
from app.security import CurrentUser, Database

router = APIRouter(prefix="/senior", tags=["Senior Authority Views"])


def require_senior_or_admin(user: CurrentUser) -> User:
    if user.role not in (Role.SUPERVISOR, Role.ADMIN):
        raise HTTPException(403, "Senior authority or admin access required")
    return user


class SeniorPersonOut(BaseModel):
    id: str
    name: str
    email: str
    role: str
    role_code: str
    team_name: str | None
    open_count: int
    fixed_count: int
    overdue_count: int
    avg_fix_hours: float | None
    last_active: str | None


class SeniorPersonDetail(SeniorPersonOut):
    reports: list[ComplaintOut]


@router.get("/people")
def list_officers_and_field_workers(
    user: CurrentUser,
    db: Database,
    period: Literal["7d", "30d", "90d"] = Query(default="30d"),
    search: str | None = Query(default=None),
) -> list[SeniorPersonOut]:
    require_senior_or_admin(user)

    now = datetime.now(UTC)
    days_map = {"7d": 7, "30d": 30, "90d": 90}
    days = days_map.get(period, 30)
    period_start = now - timedelta(days=days)
    seven_days_ago = now - timedelta(days=7)

    # Fetch GRO and FIELD_OFFICER in this jurisdiction
    query = (
        select(User, Team)
        .outerjoin(Team, User.team_id == Team.id)
        .where(
            User.jurisdiction_id == user.jurisdiction_id,
            User.role.in_([Role.GRO, Role.FIELD_OFFICER]),
            User.active == True,
        )
    )

    if search and search.strip():
        q = f"%{search.strip().lower()}%"
        query = query.where(
            or_(
                func.lower(User.name).like(q),
                func.lower(User.email).like(q),
                func.lower(Team.name).like(q),
            )
        )

    users_with_teams = db.execute(query.order_by(User.name.asc())).all()

    result = []
    for u, team in users_with_teams:
        if u.role == Role.FIELD_OFFICER:
            # Stats for field worker based on Assignment table
            open_count = db.scalar(
                select(func.count())
                .select_from(Assignment)
                .join(Complaint, Assignment.complaint_id == Complaint.id)
                .where(
                    Assignment.assigned_to_id == u.id,
                    Assignment.status.in_(["assigned", "in_progress"]),
                    Complaint.status.in_(["under_review", "in_progress"]),
                )
            ) or 0

            fixed_count = db.scalar(
                select(func.count())
                .select_from(Assignment)
                .join(Complaint, Assignment.complaint_id == Complaint.id)
                .where(
                    Assignment.assigned_to_id == u.id,
                    Complaint.status == ComplaintStatus.RESOLVED,
                    Complaint.updated_at >= period_start,
                )
            ) or 0

            overdue_count = db.scalar(
                select(func.count())
                .select_from(Assignment)
                .join(Complaint, Assignment.complaint_id == Complaint.id)
                .where(
                    Assignment.assigned_to_id == u.id,
                    Assignment.status.in_(["assigned", "in_progress"]),
                    Complaint.received_at < seven_days_ago,
                )
            ) or 0

            # Average time to fix
            resolved_assignments = db.execute(
                select(Complaint.received_at, Complaint.updated_at)
                .select_from(Assignment)
                .join(Complaint, Assignment.complaint_id == Complaint.id)
                .where(
                    Assignment.assigned_to_id == u.id,
                    Complaint.status == ComplaintStatus.RESOLVED,
                    Complaint.updated_at >= period_start,
                )
            ).all()

            avg_hours = None
            if resolved_assignments:
                total_h = sum(
                    (
                        (up.replace(tzinfo=UTC) if up.tzinfo is None else up)
                        - (rec.replace(tzinfo=UTC) if rec.tzinfo is None else rec)
                    ).total_seconds()
                    / 3600
                    for rec, up in resolved_assignments
                )
                avg_hours = round(total_h / len(resolved_assignments), 1)

        else:
            # Officer (GRO)
            open_count = db.scalar(
                select(func.count())
                .select_from(Complaint)
                .where(
                    Complaint.jurisdiction_id == user.jurisdiction_id,
                    Complaint.status.in_(["submitted", "under_review"]),
                )
            ) or 0

            fixed_count = db.scalar(
                select(func.count())
                .select_from(Complaint)
                .where(
                    Complaint.jurisdiction_id == user.jurisdiction_id,
                    Complaint.status == ComplaintStatus.RESOLVED,
                    Complaint.updated_at >= period_start,
                )
            ) or 0

            overdue_count = db.scalar(
                select(func.count())
                .select_from(Complaint)
                .where(
                    Complaint.jurisdiction_id == user.jurisdiction_id,
                    Complaint.status.in_(["submitted", "under_review", "in_progress"]),
                    Complaint.received_at < seven_days_ago,
                )
            ) or 0

            resolved_reports = db.execute(
                select(Complaint.received_at, Complaint.updated_at).where(
                    Complaint.jurisdiction_id == user.jurisdiction_id,
                    Complaint.status == ComplaintStatus.RESOLVED,
                    Complaint.updated_at >= period_start,
                )
            ).all()

            avg_hours = None
            if resolved_reports:
                total_h = sum(
                    (
                        (up.replace(tzinfo=UTC) if up.tzinfo is None else up)
                        - (rec.replace(tzinfo=UTC) if rec.tzinfo is None else rec)
                    ).total_seconds()
                    / 3600
                    for rec, up in resolved_reports
                )
                avg_hours = round(total_h / len(resolved_reports), 1)

        # Last active timestamp from StatusEvent
        last_event_time = db.scalar(
            select(func.max(StatusEvent.created_at)).where(StatusEvent.actor_id == u.id)
        )

        result.append(
            SeniorPersonOut(
                id=u.id,
                name=u.name,
                email=u.email,
                role="Officer" if u.role == Role.GRO else "Field worker",
                role_code=u.role,
                team_name=team.name if team else ("Roads & Pavements" if u.role == Role.GRO else None),
                open_count=open_count,
                fixed_count=fixed_count,
                overdue_count=overdue_count,
                avg_fix_hours=avg_hours,
                last_active=last_event_time.isoformat() if last_event_time else None,
            )
        )

    return result


@router.get("/people/{person_id}")
def get_person_detail(
    person_id: str,
    user: CurrentUser,
    db: Database,
    period: Literal["7d", "30d", "90d"] = Query(default="30d"),
) -> SeniorPersonDetail:
    require_senior_or_admin(user)

    target_user = db.get(User, person_id)
    if not target_user or target_user.jurisdiction_id != user.jurisdiction_id:
        raise HTTPException(404, "Person not found")

    team = db.get(Team, target_user.team_id) if target_user.team_id else None

    # Fetch their reports (assigned if field worker, or all jurisdiction if officer)
    if target_user.role == Role.FIELD_OFFICER:
        complaint_ids = list(
            db.scalars(
                select(Assignment.complaint_id).where(Assignment.assigned_to_id == target_user.id)
            )
        )
        reports = list(
            db.scalars(
                select(Complaint)
                .where(Complaint.id.in_(complaint_ids))
                .order_by(
                    # Open reports first
                    Complaint.status.in_(["submitted", "under_review", "in_progress"]).desc(),
                    Complaint.received_at.desc(),
                )
                .limit(50)
            )
        )
    else:
        reports = list(
            db.scalars(
                select(Complaint)
                .where(Complaint.jurisdiction_id == user.jurisdiction_id)
                .order_by(
                    Complaint.status.in_(["submitted", "under_review", "in_progress"]).desc(),
                    Complaint.received_at.desc(),
                )
                .limit(50)
            )
        )

    # Basic stats
    people_list = list_officers_and_field_workers(user, db, period=period)
    match_stat = next((p for p in people_list if p.id == person_id), None)

    return SeniorPersonDetail(
        id=target_user.id,
        name=target_user.name,
        email=target_user.email,
        role="Officer" if target_user.role == Role.GRO else "Field worker",
        role_code=target_user.role,
        team_name=team.name if team else None,
        open_count=match_stat.open_count if match_stat else 0,
        fixed_count=match_stat.fixed_count if match_stat else 0,
        overdue_count=match_stat.overdue_count if match_stat else 0,
        avg_fix_hours=match_stat.avg_fix_hours if match_stat else None,
        last_active=match_stat.last_active if match_stat else None,
        reports=[ComplaintOut.model_validate(r) for r in reports],
    )


@router.get("/reports", response_model=ComplaintPage)
def list_senior_reports(
    user: CurrentUser,
    db: Database,
    status: str | None = Query(default=None),
    category: str | None = Query(default=None),
    team: str | None = Query(default=None),
    person: str | None = Query(default=None),
    overdue: bool | None = Query(default=None),
    search: str | None = Query(default=None),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=25, ge=1, le=100),
):
    require_senior_or_admin(user)

    query = select(Complaint).where(Complaint.jurisdiction_id == user.jurisdiction_id)

    if status and status.strip():
        query = query.where(Complaint.status == status.strip())

    if category and category.strip():
        query = query.where(Complaint.category == category.strip())

    if search and search.strip():
        q = f"%{search.strip().lower()}%"
        query = query.where(
            or_(
                func.lower(Complaint.title).like(q),
                func.lower(Complaint.tracking_id).like(q),
                func.lower(Complaint.location_text).like(q),
            )
        )

    if overdue:
        seven_days_ago = datetime.now(UTC) - timedelta(days=7)
        query = query.where(
            Complaint.status.in_(["submitted", "under_review", "in_progress"]),
            Complaint.received_at < seven_days_ago,
        )

    if person and person.strip():
        # Assigned to this person
        assigned_comp_ids = select(Assignment.complaint_id).where(
            Assignment.assigned_to_id == person.strip()
        )
        query = query.where(Complaint.id.in_(assigned_comp_ids))

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    items = list(
        db.scalars(
            query.order_by(Complaint.received_at.desc(), Complaint.id).offset(offset).limit(limit)
        )
    )

    return ComplaintPage(
        items=[ComplaintOut.model_validate(c) for c in items],
        total=total,
        offset=offset,
        limit=limit,
    )


@router.post("/reports/{complaint_id}/remind-officer")
def remind_officer_about_report(
    complaint_id: str,
    user: CurrentUser,
    db: Database,
):
    """
    Triggered by senior authority clicking 'Remind the officer'.
    Creates high-priority notification for GRO officers and dispatches real-time SSE alert.
    """
    require_senior_or_admin(user)

    comp = db.get(Complaint, complaint_id)
    if not comp:
        raise HTTPException(404, "Complaint not found")

    officers = list(
        db.scalars(
            select(User).where(
                User.jurisdiction_id == comp.jurisdiction_id,
                User.role == Role.GRO,
                User.active == True,
            )
        )
    )

    now = datetime.now(UTC)
    title = f"Senior reminder: Action required on {comp.tracking_id}"
    body = f"Senior Authority {user.name} sent a reminder regarding overdue report {comp.tracking_id} ({comp.title})."

    from app.notifications import create_notification
    from app.events import dispatch_event

    for o in officers:
        create_notification(
            db=db,
            user_id=o.id,
            title=title,
            body=body,
            complaint_id=comp.id,
            link="/officer",
        )

    # Add a status event in report history
    timeline_event = StatusEvent(
        complaint_id=comp.id,
        user_id=user.id,
        status=comp.status,
        note=f"Senior Authority {user.name} sent a reminder to officers to review this report.",
        created_at=now,
    )
    db.add(timeline_event)
    db.commit()

    dispatch_event(
        event_type="report.updated",
        data={
            "report_id": comp.id,
            "tracking_id": comp.tracking_id,
            "action": "senior_reminder",
            "message": f"Senior reminder sent for {comp.tracking_id}",
        },
        role="officer",
    )

    return {
        "status": "success",
        "message": f"Reminder sent to {len(officers)} officer(s) for report {comp.tracking_id}.",
    }

