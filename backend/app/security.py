import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_db
from app.models import AuthSession, Role, User

password_hasher = PasswordHash.recommended()
dummy_hash = password_hasher.hash("not-a-real-account-password")
bearer = HTTPBearer(auto_error=False)
Database = Annotated[Session, Depends(get_db)]
Credentials = Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def new_session(db: Session, user: User) -> tuple[str, datetime]:
    token = secrets.token_urlsafe(48)
    expires = datetime.now(UTC) + timedelta(hours=get_settings().session_hours)
    db.add(AuthSession(token_hash=token_digest(token), user_id=user.id, expires_at=expires))
    db.commit()
    return token, expires


def current_user(credentials: Credentials, db: Database) -> User:
    if credentials is None:
        raise HTTPException(401, "Sign in to continue", headers={"WWW-Authenticate": "Bearer"})
    session = db.get(AuthSession, token_digest(credentials.credentials))
    if session is None:
        raise HTTPException(401, "Session expired or invalid")
    expires = session.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    user = db.get(User, session.user_id)
    if expires <= datetime.now(UTC) or user is None or not user.active or getattr(user, "status", "active") == "disabled":
        raise HTTPException(401, "Session expired or account disabled")
    return user



CurrentUser = Annotated[User, Depends(current_user)]


def can_review(user: User) -> bool:
    return user.role == Role.GRO


def get_visible_complaint(db: Session, tracking_id: str, user: User):
    from app.models import Complaint

    query = select(Complaint).where(Complaint.tracking_id == tracking_id)
    if user.role == Role.CITIZEN:
        query = query.where(Complaint.citizen_id == user.id)
    elif user.role in (Role.GRO, Role.FIELD_OFFICER, Role.SUPERVISOR, Role.ADMIN):
        query = query.where(Complaint.jurisdiction_id == user.jurisdiction_id)
    else:
        raise HTTPException(403, "This role has no complaint-review access in this milestone")
    complaint = db.scalar(query)
    if complaint is None:
        raise HTTPException(404, "Complaint not found")
    return complaint
