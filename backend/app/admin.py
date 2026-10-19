import json
import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, or_, select

from app.config import get_settings
from app.models import (
    Assignment,
    AuditLog,
    AuthSession,
    Complaint,
    RefreshToken,
    Role,
    SystemSetting,
    Team,
    User,
    UserToken,
    new_id,
)
from app.security import CurrentUser, Database, token_digest

router = APIRouter(prefix="/admin", tags=["Admin Control Centre"])


def require_admin(user: CurrentUser) -> User:
    if user.role != Role.ADMIN:
        raise HTTPException(403, "Admin authorization required")
    return user


AdminUser = Annotated[User, Depends(require_admin)]


# --- Schemas ---

class AdminOverviewOut(BaseModel):
    open_reports: int
    overdue_reports: int
    active_staff: int
    invites_waiting: int
    needs_attention: list[dict]


class StaffUserOut(BaseModel):
    id: str
    name: str
    email: str
    phone: str | None
    role: str
    team_id: str | None
    team_name: str | None
    status: str
    email_verified: bool
    last_active_at: str | None
    open_reports: int = 0
    created_at: str


class StaffInviteIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    phone: str | None = None
    role: Literal["gro", "field_officer", "supervisor", "admin"]
    team_id: str | None = None
    send_invite: bool = True


class StaffUpdateIn(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    phone: str | None = None
    team_id: str | None = None


class RoleChangeIn(BaseModel):
    role: Literal["citizen", "gro", "field_officer", "supervisor", "admin"]


class StatusChangeIn(BaseModel):
    status: Literal["active", "disabled"]


class TeamOut(BaseModel):
    id: str
    name: str
    description: str | None
    jurisdiction_id: str
    member_count: int
    created_at: str


class TeamCreateIn(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    description: str | None = None


class AuditLogOut(BaseModel):
    id: str
    actor_id: str
    actor_name: str
    action: str
    target_type: str
    target_id: str
    details: str
    created_at: str


def record_audit(
    db: Database,
    actor: User,
    action: str,
    target_type: str,
    target_id: str,
    details: dict,
):
    entry = AuditLog(
        id=new_id(),
        actor_id=actor.id,
        actor_name=actor.name,
        action=action,
        target_type=target_type,
        target_id=target_id,
        details=json.dumps(details),
        created_at=datetime.now(UTC),
    )
    db.add(entry)


# --- Overview ---

@router.get("/overview")
def get_admin_overview(admin: AdminUser, db: Database) -> AdminOverviewOut:
    now = datetime.now(UTC)

    open_reports = db.scalar(
        select(func.count())
        .select_from(Complaint)
        .where(Complaint.status.in_(["submitted", "under_review", "in_progress"]))
    ) or 0

    # Overdue reports: older than 7 days and still open
    seven_days_ago = now - timedelta(days=7)
    overdue_reports = db.scalar(
        select(func.count())
        .select_from(Complaint)
        .where(
            Complaint.status.in_(["submitted", "under_review", "in_progress"]),
            Complaint.received_at < seven_days_ago,
        )
    ) or 0

    active_staff = db.scalar(
        select(func.count())
        .select_from(User)
        .where(User.role != Role.CITIZEN, User.active == True, User.status == "active")
    ) or 0

    invites_waiting = db.scalar(
        select(func.count())
        .select_from(User)
        .where(User.status == "invited")
    ) or 0

    # Needs attention list
    needs_attention = []

    # 1. Oldest overdue complaints
    overdue_complaints = list(
        db.scalars(
            select(Complaint)
            .where(
                Complaint.status.in_(["submitted", "under_review", "in_progress"]),
                Complaint.received_at < seven_days_ago,
            )
            .order_by(Complaint.received_at.asc())
            .limit(4)
        )
    )
    for c in overdue_complaints:
        days_old = (now - c.received_at.replace(tzinfo=UTC)).days if c.received_at.tzinfo is None else (now - c.received_at).days
        needs_attention.append({
            "type": "overdue_report",
            "title": f"Report {c.tracking_id} is overdue",
            "subtitle": f"{c.title} ({days_old} days open)",
            "link": f"/officer",
        })

    # 2. Unassigned open complaints
    assigned_ids = select(Assignment.complaint_id).where(Assignment.status.in_(["assigned", "in_progress"]))
    unassigned = list(
        db.scalars(
            select(Complaint)
            .where(
                Complaint.status.in_(["submitted", "under_review"]),
                Complaint.id.not_in(assigned_ids),
            )
            .order_by(Complaint.received_at.asc())
            .limit(3)
        )
    )
    for c in unassigned:
        needs_attention.append({
            "type": "unassigned_report",
            "title": f"Report {c.tracking_id} has no field worker assigned",
            "subtitle": f"{c.title}",
            "link": f"/officer",
        })

    # 3. Invites expiring within 24 hours
    one_day_ahead = now + timedelta(hours=24)
    expiring_tokens = list(
        db.scalars(
            select(UserToken)
            .where(
                UserToken.token_type == "staff_invite",
                UserToken.used_at.is_(None),
                UserToken.expires_at <= one_day_ahead,
                UserToken.expires_at > now,
            )
            .limit(3)
        )
    )
    for tok in expiring_tokens:
        u = db.get(User, tok.user_id)
        if u and u.status == "invited":
            hours_left = max(1, int((tok.expires_at.replace(tzinfo=UTC) if tok.expires_at.tzinfo is None else tok.expires_at - now).total_seconds() / 3600))
            needs_attention.append({
                "type": "expiring_invite",
                "title": f"Staff invite for {u.name} expires in {hours_left}h",
                "subtitle": f"Email: {u.email}",
                "link": f"/admin",
            })

    return AdminOverviewOut(
        open_reports=open_reports,
        overdue_reports=overdue_reports,
        active_staff=active_staff,
        invites_waiting=invites_waiting,
        needs_attention=needs_attention,
    )


# --- People Management ---

@router.get("/users")
def list_staff_users(
    admin: AdminUser,
    db: Database,
    search: str | None = None,
    role: str | None = None,
    status: str | None = None,
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    query = select(User)
    if search:
        s = f"%{search.strip().lower()}%"
        query = query.where(or_(func.lower(User.name).like(s), func.lower(User.email).like(s)))
    if role:
        query = query.where(User.role == role)
    if status:
        query = query.where(User.status == status)

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    users = list(db.scalars(query.order_by(User.name.asc()).offset(offset).limit(limit)))

    items = []
    for u in users:
        team_name = None
        if u.team_id:
            t = db.get(Team, u.team_id)
            if t:
                team_name = t.name
        
        open_reports = 0
        if u.role == Role.FIELD_OFFICER:
            open_reports = db.scalar(
                select(func.count())
                .select_from(Assignment)
                .join(Complaint, Assignment.complaint_id == Complaint.id)
                .where(
                    Assignment.assigned_to_id == u.id,
                    Assignment.status.in_(["assigned", "in_progress"]),
                    Complaint.status.in_(["under_review", "in_progress"]),
                )
            ) or 0
        elif u.role == Role.GRO:
            open_reports = db.scalar(
                select(func.count())
                .select_from(Complaint)
                .where(
                    Complaint.jurisdiction_id == u.jurisdiction_id,
                    Complaint.status.in_(["submitted", "under_review"]),
                )
            ) or 0

        items.append(
            StaffUserOut(
                id=u.id,
                name=u.name,
                email=u.email,
                phone=u.phone,
                role=u.role,
                team_id=u.team_id,
                team_name=team_name,
                status=u.status,
                email_verified=u.email_verified,
                last_active_at=u.last_active_at.isoformat() if u.last_active_at else None,
                open_reports=open_reports,
                created_at=u.created_at.isoformat() if u.created_at else "",
            )
        )
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.post("/users/invite", status_code=201)
def invite_staff_member(data: StaffInviteIn, admin: AdminUser, db: Database):
    """Register staff member in 'invited' state with a 72-hour one-time activation link."""
    clean_email = data.email.strip().lower()
    existing = db.scalar(select(User).where(User.email == clean_email))
    if existing:
        raise HTTPException(400, "A user with this email address already exists")

    if data.team_id:
        team = db.get(Team, data.team_id)
        if not team:
            raise HTTPException(404, "Specified team not found")

    settings = get_settings()
    user_id = new_id()
    raw_token = secrets.token_urlsafe(32)
    digest = token_digest(raw_token)
    expires = datetime.now(UTC) + timedelta(hours=72)

    # Temporary placeholder password hash until staff sets their password
    placeholder_hash = f"invited_pending_{secrets.token_hex(16)}"

    new_user = User(
        id=user_id,
        email=clean_email,
        name=data.name.strip(),
        phone=data.phone.strip() if data.phone else None,
        role=data.role,
        team_id=data.team_id,
        status="invited",
        active=True,
        email_verified=False,
        jurisdiction_id=settings.jurisdiction_id,
        password_hash=placeholder_hash,
        created_at=datetime.now(UTC),
    )
    db.add(new_user)
    db.flush()

    user_token = UserToken(
        id=new_id(),
        user_id=new_user.id,
        token_hash=digest,
        token_type="staff_invite",
        expires_at=expires,
        created_at=datetime.now(UTC),
    )
    db.add(user_token)

    record_audit(
        db,
        admin,
        "invite_staff",
        "user",
        new_user.id,
        {"email": clean_email, "role": data.role, "team_id": data.team_id},
    )

    db.commit()

    invite_url = f"{settings.frontend_url}/accept-invite?token={raw_token}"

    # Queue email sending in Celery / console
    try:
        from app.worker.tasks import send_email_task
        send_email_task.delay(
            to_email=clean_email,
            subject="You have been invited to join GrievanceGrid",
            body=(
                f"Hello {new_user.name},\n\n"
                f"An administrator has invited you to join GrievanceGrid as a {data.role}.\n\n"
                f"Click the link below to set your password and activate your account (valid for 72 hours):\n"
                f"{invite_url}\n\n"
                f"If you did not expect this invitation, you can ignore this email."
            ),
        )
    except Exception:
        pass  # If celery broker is down, admin sees the link directly in UI

    return {
        "message": f"Invitation sent to {clean_email}",
        "user_id": new_user.id,
        "invite_url": invite_url,
        "invite_token": raw_token,
        "expires_at": expires.isoformat(),
    }


@router.post("/users/{user_id}/reinvite")
def reinvite_staff_member(user_id: str, admin: AdminUser, db: Database):
    """Re-issue a fresh 72-hour invite link for an invited user."""
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    if user.status != "invited":
        raise HTTPException(400, "Can only resend invitations to users in 'invited' status")

    raw_token = secrets.token_urlsafe(32)
    digest = token_digest(raw_token)
    expires = datetime.now(UTC) + timedelta(hours=72)

    # Invalidate previous invite tokens
    prev_tokens = list(
        db.scalars(
            select(UserToken).where(
                UserToken.user_id == user.id,
                UserToken.token_type == "staff_invite",
                UserToken.used_at.is_(None),
            )
        )
    )
    for pt in prev_tokens:
        pt.used_at = datetime.now(UTC)

    user_token = UserToken(
        id=new_id(),
        user_id=user.id,
        token_hash=digest,
        token_type="staff_invite",
        expires_at=expires,
        created_at=datetime.now(UTC),
    )
    db.add(user_token)

    record_audit(db, admin, "reinvite_staff", "user", user.id, {"email": user.email})
    db.commit()

    settings = get_settings()
    invite_url = f"{settings.frontend_url}/accept-invite?token={raw_token}"

    try:
        from app.worker.tasks import send_email_task
        send_email_task.delay(
            to_email=user.email,
            subject="GrievanceGrid invitation reminder",
            body=(
                f"Hello {user.name},\n\n"
                f"Your invitation to GrievanceGrid has been refreshed.\n"
                f"Click the link below to activate your account:\n{invite_url}\n"
            ),
        )
    except Exception:
        pass

    return {
        "message": "Fresh invitation link generated",
        "invite_url": invite_url,
        "expires_at": expires.isoformat(),
    }


@router.put("/users/{user_id}")
def update_staff_member(user_id: str, data: StaffUpdateIn, admin: AdminUser, db: Database):
    """Update profile details or team assignment."""
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")

    changes = {}
    if data.name is not None:
        user.name = data.name.strip()
        changes["name"] = user.name
    if data.phone is not None:
        user.phone = data.phone.strip() or None
        changes["phone"] = user.phone
    if data.team_id is not None:
        if data.team_id == "":
            user.team_id = None
        else:
            team = db.get(Team, data.team_id)
            if not team:
                raise HTTPException(404, "Specified team not found")
            user.team_id = data.team_id
        changes["team_id"] = user.team_id

    record_audit(db, admin, "update_user", "user", user.id, changes)
    db.commit()
    db.refresh(user)

    team_name = None
    if user.team_id:
        t = db.get(Team, user.team_id)
        if t:
            team_name = t.name

    return StaffUserOut(
        id=user.id,
        name=user.name,
        email=user.email,
        phone=user.phone,
        role=user.role,
        team_id=user.team_id,
        team_name=team_name,
        status=user.status,
        email_verified=user.email_verified,
        last_active_at=user.last_active_at.isoformat() if user.last_active_at else None,
        created_at=user.created_at.isoformat() if user.created_at else "",
    )


@router.post("/users/{user_id}/role")
def change_user_role(user_id: str, data: RoleChangeIn, admin: AdminUser, db: Database):
    """Change a staff member's role with self-demotion protection."""
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")

    if user.id == admin.id and data.role != Role.ADMIN:
        raise HTTPException(400, "You cannot demote yourself from the Administrator role.")

    if user.role == Role.ADMIN and data.role != Role.ADMIN:
        active_admins = db.scalar(
            select(func.count())
            .select_from(User)
            .where(User.role == Role.ADMIN, User.active == True, User.status == "active")
        ) or 0
        if active_admins <= 1:
            raise HTTPException(400, "Cannot demote the only remaining active Administrator.")

    prev_role = user.role
    user.role = data.role
    record_audit(db, admin, "change_role", "user", user.id, {"from": prev_role, "to": data.role})
    db.commit()

    return {"message": f"Role updated to {data.role}", "role": data.role}


@router.post("/users/{user_id}/status")
def change_user_status(user_id: str, data: StatusChangeIn, admin: AdminUser, db: Database):
    """Enable or disable a user account. Disabling signs them out everywhere immediately."""
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")

    if user.id == admin.id and data.status == "disabled":
        raise HTTPException(400, "You cannot disable your own Administrator account.")

    if user.role == Role.ADMIN and data.status == "disabled":
        active_admins = db.scalar(
            select(func.count())
            .select_from(User)
            .where(User.role == Role.ADMIN, User.active == True, User.status == "active")
        ) or 0
        if active_admins <= 1:
            raise HTTPException(400, "Cannot disable the only remaining active Administrator.")

    user.status = data.status
    user.active = data.status == "active"

    if data.status == "disabled":
        # Sign out everywhere immediately: delete AuthSessions and revoke RefreshTokens
        db.query(AuthSession).filter(AuthSession.user_id == user.id).delete()
        db.query(RefreshToken).filter(RefreshToken.user_id == user.id).update({"revoked": True})

    record_audit(db, admin, "change_status", "user", user.id, {"status": data.status})
    db.commit()

    return {"message": f"User status changed to {data.status}", "status": data.status}


@router.post("/users/{user_id}/reset-password-link")
def create_reset_password_link(user_id: str, admin: AdminUser, db: Database):
    """Generate a single-use 30-minute password reset link for a staff member."""
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")

    raw_token = secrets.token_urlsafe(32)
    digest = token_digest(raw_token)
    expires = datetime.now(UTC) + timedelta(minutes=30)

    user_token = UserToken(
        id=new_id(),
        user_id=user.id,
        token_hash=digest,
        token_type="password_reset",
        expires_at=expires,
        created_at=datetime.now(UTC),
    )
    db.add(user_token)
    record_audit(db, admin, "create_password_reset_link", "user", user.id, {"email": user.email})
    db.commit()

    settings = get_settings()
    reset_url = f"{settings.frontend_url}/reset-password?token={raw_token}"
    return {
        "message": f"Password reset link generated for {user.name}",
        "reset_url": reset_url,
        "expires_at": expires.isoformat(),
    }


@router.post("/users/{user_id}/sign-out-everywhere")
def sign_out_user_everywhere(user_id: str, admin: AdminUser, db: Database):
    """Revoke all active sessions and refresh tokens for this user."""
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")

    db.query(AuthSession).filter(AuthSession.user_id == user.id).delete()
    db.query(RefreshToken).filter(RefreshToken.user_id == user.id).update({"revoked": True})
    record_audit(db, admin, "sign_out_everywhere", "user", user.id, {})
    db.commit()

    return {"message": f"All active sessions for {user.name} have been revoked."}


# --- Teams Management ---

@router.get("/teams")
def list_teams(admin: AdminUser, db: Database) -> list[TeamOut]:
    teams = list(db.scalars(select(Team).order_by(Team.name.asc())))
    result = []
    for t in teams:
        count = db.scalar(
            select(func.count()).select_from(User).where(User.team_id == t.id)
        ) or 0
        result.append(
            TeamOut(
                id=t.id,
                name=t.name,
                description=t.description,
                jurisdiction_id=t.jurisdiction_id,
                member_count=count,
                created_at=t.created_at.isoformat() if t.created_at else "",
            )
        )
    return result


@router.post("/teams", status_code=201)
def create_team(data: TeamCreateIn, admin: AdminUser, db: Database) -> TeamOut:
    settings = get_settings()
    existing = db.scalar(select(Team).where(Team.name == data.name.strip()))
    if existing:
        raise HTTPException(400, "A team with this name already exists")

    team = Team(
        id=new_id(),
        name=data.name.strip(),
        description=data.description.strip() if data.description else None,
        jurisdiction_id=settings.jurisdiction_id,
        created_at=datetime.now(UTC),
    )
    db.add(team)
    record_audit(db, admin, "create_team", "team", team.id, {"name": team.name})
    db.commit()
    db.refresh(team)

    return TeamOut(
        id=team.id,
        name=team.name,
        description=team.description,
        jurisdiction_id=team.jurisdiction_id,
        member_count=0,
        created_at=team.created_at.isoformat(),
    )


# --- Audit Log ---

@router.get("/audit-log")
def list_audit_logs(
    admin: AdminUser,
    db: Database,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    query = select(AuditLog).order_by(AuditLog.created_at.desc())
    total = db.scalar(select(func.count()).select_from(AuditLog)) or 0
    logs = list(db.scalars(query.offset(offset).limit(limit)))

    items = [
        AuditLogOut(
            id=log.id,
            actor_id=log.actor_id,
            actor_name=log.actor_name,
            action=log.action,
            target_type=log.target_type,
            target_id=log.target_id,
            details=log.details,
            created_at=log.created_at.isoformat() if log.created_at else "",
        )
        for log in logs
    ]
    return {"items": items, "total": total, "limit": limit, "offset": offset}


# --- System Settings ---

DEFAULT_SYSTEM_SETTINGS: dict[str, Any] = {
    "area_name": "Kochi",
    "emergency_number": "112",
    "default_target_hours": 48,
    "warn_before_due_hours": 24,
    "email_sender_name": "Kochi Municipal Corporation",
    "email_report_updates": True,
    "email_new_jobs": True,
    "email_invites": True,
    "photo_check_enabled": True,
    "duplicate_match_enabled": True,
    "priority_suggestion_enabled": True,
    "citizen_photo_hint_enabled": True,
    "photo_authenticity_enabled": True,
    "senior_alert_popup_enabled": True,
}


def get_all_settings(db: Database) -> dict[str, Any]:
    rows = list(db.scalars(select(SystemSetting)))
    result = dict(DEFAULT_SYSTEM_SETTINGS)
    for r in rows:
        try:
            result[r.key] = json.loads(r.value)
        except Exception:
            result[r.key] = r.value
    return result


@router.get("/settings")
def get_admin_settings(admin: AdminUser, db: Database) -> dict[str, Any]:
    """Fetch current system business settings with fallbacks."""
    return get_all_settings(db)


@router.put("/settings")
def update_admin_settings(data: dict[str, Any], admin: AdminUser, db: Database) -> dict[str, Any]:
    """Update system business settings and record audit trail."""
    now = datetime.now(UTC)
    updated_keys = []

    for key, val in data.items():
        if key not in DEFAULT_SYSTEM_SETTINGS:
            continue

        # Validation
        if key in ("area_name", "email_sender_name"):
            val_str = str(val).strip()
            if len(val_str) < 2 or len(val_str) > 100:
                raise HTTPException(400, f"{key} must be between 2 and 100 characters")
            val = val_str
        elif key == "emergency_number":
            val_str = str(val).strip()
            if len(val_str) < 2 or len(val_str) > 20:
                raise HTTPException(400, "Emergency number must be between 2 and 20 characters")
            val = val_str
        elif key in ("default_target_hours", "warn_before_due_hours"):
            try:
                val = int(val)
                if val < 1 or val > 720:
                    raise ValueError
            except (ValueError, TypeError):
                raise HTTPException(400, f"{key} must be a number between 1 and 720 hours")
        elif isinstance(DEFAULT_SYSTEM_SETTINGS[key], bool):
            val = bool(val)

        serialized = json.dumps(val)
        existing = db.get(SystemSetting, key)
        if existing:
            if existing.value != serialized:
                existing.value = serialized
                existing.updated_at = now
                existing.updated_by_id = admin.id
                updated_keys.append(key)
        else:
            db.add(
                SystemSetting(
                    key=key,
                    value=serialized,
                    updated_at=now,
                    updated_by_id=admin.id,
                )
            )
            updated_keys.append(key)

    if updated_keys:
        record_audit(db, admin, "update_settings", "system_settings", "settings", {"keys": updated_keys})
        db.commit()

    return get_all_settings(db)
