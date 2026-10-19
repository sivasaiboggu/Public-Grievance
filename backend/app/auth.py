import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError

from app.config import get_settings
from app.models import AuthSession, RefreshToken, Role, User, UserToken
from app.schemas import (
    AcceptInviteRequest,
    ChangePasswordRequest,
    ForgotPasswordRequest,
    Login,
    RefreshRequest,
    Register,
    ResetPasswordRequest,
    SessionOut,
    TokenOut,
    UserProfileUpdate,
    UserOut,
    VerifyEmailRequest,
)
from app.security import (
    Credentials,
    CurrentUser,
    Database,
    dummy_hash,
    new_session,
    password_hasher,
    token_digest,
)
from app.worker.tasks import send_email

router = APIRouter(prefix="/auth", tags=["Authentication"])
settings = get_settings()


def create_refresh_token(db: Database, user: User, device_info: str | None = None, family_id: str | None = None) -> tuple[str, RefreshToken]:
    raw_token = secrets.token_urlsafe(64)
    hashed = hashlib.sha256(raw_token.encode()).hexdigest()
    expires = datetime.now(UTC) + timedelta(days=7)
    fam_id = family_id or secrets.token_hex(16)
    
    rt = RefreshToken(
        user_id=user.id,
        token_hash=hashed,
        family_id=fam_id,
        device_info=device_info[:200] if device_info else "Browser / Mobile Client",
        revoked=False,
        expires_at=expires,
    )
    db.add(rt)
    db.commit()
    return raw_token, rt


def set_refresh_cookie(response: Response, raw_token: str):
    response.set_cookie(
        key="refresh_token",
        value=raw_token,
        max_age=7 * 24 * 3600,
        httponly=True,
        samesite="lax",
        secure=False,  # Set to True in production with HTTPS
        path="/",
    )


def clear_refresh_cookie(response: Response):
    response.delete_cookie(key="refresh_token", path="/")


@router.post("/register", response_model=UserOut, status_code=201)
def register(data: Register, db: Database):
    user = User(
        email=str(data.email).lower(),
        name=data.name,
        password_hash=password_hasher.hash(data.password),
        role=Role.CITIZEN,
        jurisdiction_id=settings.jurisdiction_id,
        status="active",
        email_verified=False,
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "An account with this email already exists") from None

    # Generate email verification token (valid 24h)
    raw_verify_token = secrets.token_urlsafe(32)
    verify_token = UserToken(
        user_id=user.id,
        token_hash=hashlib.sha256(raw_verify_token.encode()).hexdigest(),
        token_type="verification",
        expires_at=datetime.now(UTC) + timedelta(hours=24),
    )
    db.add(verify_token)
    db.commit()

    # Dispatch email
    verify_link = f"{settings.frontend_url}/verify-email?token={raw_verify_token}"
    body = (
        f"Hello {user.name},\n\n"
        f"Thank you for registering on GrievanceGrid.\n\n"
        f"Please verify your email address by clicking the link below:\n"
        f"{verify_link}\n\n"
        f"This link will expire in 24 hours.\n\n"
        f"{settings.jurisdiction_name} Team"
    )
    try:
        send_email(user.email, "Verify your GrievanceGrid account", body)
    except Exception:
        pass

    return user


@router.post("/login", response_model=TokenOut)
def login(data: Login, request: Request, response: Response, db: Database):
    user = db.scalar(select(User).where(User.email == str(data.email).lower()))
    valid = password_hasher.verify(data.password, user.password_hash if user else dummy_hash)
    if user is None or not valid or not user.active or getattr(user, "status", "active") == "disabled":
        raise HTTPException(401, "Email or password is incorrect")

    # Update last active
    user.last_active_at = datetime.now(UTC)
    token, expires = new_session(db, user)

    # Issue rotating refresh token
    user_agent = request.headers.get("user-agent", "Unknown Device")
    raw_refresh_token, _ = create_refresh_token(db, user, device_info=user_agent)
    set_refresh_cookie(response, raw_refresh_token)

    return TokenOut(
        access_token=token,
        expires_at=expires,
        user=UserOut.model_validate(user),
        refresh_token=raw_refresh_token,
    )


@router.post("/refresh", response_model=TokenOut)
def refresh_session(
    request: Request,
    response: Response,
    db: Database,
    body: RefreshRequest | None = None,
    refresh_token_cookie: Annotated[str | None, Cookie(alias="refresh_token")] = None,
):
    raw_token = (body.refresh_token if body and body.refresh_token else None) or refresh_token_cookie
    if not raw_token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No refresh token provided")

    hashed = hashlib.sha256(raw_token.encode()).hexdigest()
    rt = db.scalar(select(RefreshToken).where(RefreshToken.token_hash == hashed))

    if rt is None:
        clear_refresh_cookie(response)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired or invalid")

    # REUSE DETECTION: If an already-revoked refresh token is presented, revoke its entire family!
    if rt.revoked:
        db.execute(
            update(RefreshToken)
            .where(RefreshToken.family_id == rt.family_id)
            .values(revoked=True)
        )
        db.commit()
        clear_refresh_cookie(response)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session compromised; please sign in again")

    # Check expiration
    now = datetime.now(UTC)
    rt_expires = rt.expires_at.replace(tzinfo=UTC) if rt.expires_at.tzinfo is None else rt.expires_at
    if rt_expires < now:
        rt.revoked = True
        db.commit()
        clear_refresh_cookie(response)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired, please sign in again")

    user = db.get(User, rt.user_id)
    if not user or not user.active or getattr(user, "status", "active") == "disabled":
        clear_refresh_cookie(response)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Account is inactive or disabled")

    # Rotate refresh token: revoke current, issue new one in same family
    rt.revoked = True
    user_agent = request.headers.get("user-agent", "Unknown Device")
    new_raw_refresh, _ = create_refresh_token(db, user, device_info=user_agent, family_id=rt.family_id)
    new_access_token, expires = new_session(db, user)
    set_refresh_cookie(response, new_raw_refresh)

    return TokenOut(
        access_token=new_access_token,
        expires_at=expires,
        user=UserOut.model_validate(user),
        refresh_token=new_raw_refresh,
    )


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return user


@router.patch("/me", response_model=UserOut)
def update_profile(data: UserProfileUpdate, user: CurrentUser, db: Database):
    if data.name is not None:
        user.name = data.name.strip()
    if data.phone is not None:
        user.phone = data.phone.strip()
    db.commit()
    db.refresh(user)
    return user


@router.post("/change-password")
def change_password(data: ChangePasswordRequest, user: CurrentUser, response: Response, db: Database):
    if not password_hasher.verify(data.current_password, user.password_hash):
        raise HTTPException(400, "Current password does not match")

    user.password_hash = password_hasher.hash(data.new_password)
    # Revoke all other refresh tokens for this user
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user.id)
        .values(revoked=True)
    )
    # Revoke existing auth sessions
    db.execute(
        update(AuthSession)
        .where(AuthSession.user_id == user.id)
        .values(expires_at=datetime.now(UTC))
    )
    db.commit()

    # Create fresh session for this user
    token, expires = new_session(db, user)
    new_raw_refresh, _ = create_refresh_token(db, user, device_info="Password changed")
    set_refresh_cookie(response, new_raw_refresh)

    return {"message": "Password changed successfully", "access_token": token}


@router.post("/forgot-password")
def forgot_password(data: ForgotPasswordRequest, db: Database):
    user = db.scalar(select(User).where(User.email == str(data.email).lower()))
    if user and user.active:
        raw_token = secrets.token_urlsafe(32)
        hashed = hashlib.sha256(raw_token.encode()).hexdigest()
        expires = datetime.now(UTC) + timedelta(minutes=30)
        
        token_record = UserToken(
            user_id=user.id,
            token_hash=hashed,
            token_type="password_reset",
            expires_at=expires,
        )
        db.add(token_record)
        db.commit()

        reset_link = f"{settings.frontend_url}/reset-password?token={raw_token}"
        body = (
            f"Hello {user.name},\n\n"
            f"A password reset request was received for your GrievanceGrid account.\n\n"
            f"Click the link below to set a new password:\n{reset_link}\n\n"
            f"This link will expire in 30 minutes.\n"
            f"If you did not request this, please ignore this email.\n\n"
            f"{settings.jurisdiction_name} Team"
        )
        try:
            send_email(user.email, "Reset your GrievanceGrid password", body)
        except Exception:
            pass

    # Generic message avoids account enumeration
    return {"message": "If an account exists with that email, a password reset link has been sent."}


@router.post("/reset-password")
def reset_password(data: ResetPasswordRequest, db: Database):
    hashed = hashlib.sha256(data.token.encode()).hexdigest()
    record = db.scalar(
        select(UserToken).where(
            UserToken.token_hash == hashed,
            UserToken.token_type == "password_reset",
            UserToken.used_at.is_(None),
        )
    )
    now = datetime.now(UTC)
    if not record:
        raise HTTPException(400, "Reset link is invalid or has already been used")

    rec_expires = record.expires_at.replace(tzinfo=UTC) if record.expires_at.tzinfo is None else record.expires_at
    if rec_expires < now:
        raise HTTPException(400, "Reset link has expired")

    user = db.get(User, record.user_id)
    if not user:
        raise HTTPException(400, "User not found")

    user.password_hash = password_hasher.hash(data.new_password)
    record.used_at = now
    
    # Revoke all existing sessions and refresh tokens
    db.execute(
        update(RefreshToken).where(RefreshToken.user_id == user.id).values(revoked=True)
    )
    db.commit()

    return {"message": "Password updated successfully. You can now sign in with your new password."}


@router.post("/accept-invite")
def accept_invite(data: AcceptInviteRequest, db: Database):
    hashed = hashlib.sha256(data.token.encode()).hexdigest()
    record = db.scalar(
        select(UserToken).where(
            UserToken.token_hash == hashed,
            UserToken.token_type == "staff_invite",
            UserToken.used_at.is_(None),
        )
    )
    now = datetime.now(UTC)
    if not record:
        raise HTTPException(400, "Invitation link is invalid or has already been used")

    rec_expires = record.expires_at.replace(tzinfo=UTC) if record.expires_at.tzinfo is None else record.expires_at
    if rec_expires < now:
        raise HTTPException(400, "Invitation link has expired")

    user = db.get(User, record.user_id)
    if not user:
        raise HTTPException(400, "User not found")

    user.password_hash = password_hasher.hash(data.new_password)
    user.active = True
    user.status = "active"
    user.email_verified = True
    record.used_at = now
    token, expires = new_session(db, user)
    db.commit()

    return {
        "message": "Account activated successfully.",
        "access_token": token,
        "token_type": "bearer",
        "expires_at": expires.isoformat(),
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "jurisdiction_id": user.jurisdiction_id,
        },
    }


@router.post("/verify-email")
def verify_email(data: VerifyEmailRequest, db: Database):
    hashed = hashlib.sha256(data.token.encode()).hexdigest()
    record = db.scalar(
        select(UserToken).where(
            UserToken.token_hash == hashed,
            UserToken.token_type == "verification",
            UserToken.used_at.is_(None),
        )
    )
    now = datetime.now(UTC)
    if not record:
        raise HTTPException(400, "Verification link is invalid or has already been used")

    rec_expires = record.expires_at.replace(tzinfo=UTC) if record.expires_at.tzinfo is None else record.expires_at
    if rec_expires < now:
        raise HTTPException(400, "Verification link has expired")

    user = db.get(User, record.user_id)
    if user:
        user.email_verified = True
    record.used_at = now
    db.commit()

    return {"message": "Email verified successfully. You can now report problems."}


@router.post("/resend-verification")
def resend_verification(user: CurrentUser, db: Database):
    if user.email_verified:
        return {"message": "Email is already verified"}

    raw_token = secrets.token_urlsafe(32)
    verify_token = UserToken(
        user_id=user.id,
        token_hash=hashlib.sha256(raw_token.encode()).hexdigest(),
        token_type="verification",
        expires_at=datetime.now(UTC) + timedelta(hours=24),
    )
    db.add(verify_token)
    db.commit()

    verify_link = f"{settings.frontend_url}/verify-email?token={raw_token}"
    body = (
        f"Hello {user.name},\n\n"
        f"Please verify your email address by clicking the link below:\n{verify_link}\n\n"
        f"{settings.jurisdiction_name} Team"
    )
    try:
        send_email(user.email, "Verify your GrievanceGrid account", body)
    except Exception:
        pass

    return {"message": "Verification link sent to your email."}


@router.get("/sessions", response_model=list[SessionOut])
def list_sessions(user: CurrentUser, db: Database):
    now = datetime.now(UTC)
    tokens = db.scalars(
        select(RefreshToken).where(
            RefreshToken.user_id == user.id,
            RefreshToken.revoked == False,
            RefreshToken.expires_at > now,
        ).order_by(RefreshToken.created_at.desc())
    ).all()

    return [
        SessionOut(
            id=t.id,
            device_info=t.device_info,
            created_at=t.created_at,
            expires_at=t.expires_at,
            is_current=False,
        )
        for t in tokens
    ]


@router.post("/sessions/revoke-all")
def revoke_all_sessions(user: CurrentUser, response: Response, db: Database):
    db.execute(
        update(RefreshToken).where(RefreshToken.user_id == user.id).values(revoked=True)
    )
    db.execute(
        update(AuthSession).where(AuthSession.user_id == user.id).values(expires_at=datetime.now(UTC))
    )
    db.commit()
    clear_refresh_cookie(response)
    return {"message": "All sessions signed out"}


@router.post("/logout", status_code=204)
def logout(user: CurrentUser, credentials: Credentials, response: Response, db: Database):
    clear_refresh_cookie(response)
    if credentials:
        session = db.get(AuthSession, token_digest(credentials.credentials))
        if session:
            db.delete(session)
            db.commit()
    return Response(status_code=204)
