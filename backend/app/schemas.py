from datetime import UTC, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models import Category, ComplaintStatus


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, allow_inf_nan=False)


class Register(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)

    @field_validator("name", "email", mode="before")
    @classmethod
    def trim_identity(cls, value):
        return value.strip() if isinstance(value, str) else value


class Login(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    email: str
    role: str
    jurisdiction_id: str
    phone: str | None = None
    status: str = "active"
    email_verified: bool = False
    team_id: str | None = None
    last_active_at: datetime | None = None


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_at: datetime
    user: UserOut
    refresh_token: str | None = None


class RefreshRequest(BaseModel):
    refresh_token: str | None = None


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=12, max_length=128)


class AcceptInviteRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=12, max_length=128)
    name: str | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=12, max_length=128)


class VerifyEmailRequest(BaseModel):
    token: str


class SessionOut(BaseModel):
    id: str
    device_info: str | None = None
    created_at: datetime
    expires_at: datetime
    is_current: bool = False


class UserProfileUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    phone: str | None = Field(default=None, max_length=30)



class ComplaintCreate(Input):
    client_request_id: UUID
    title: str = Field(min_length=5, max_length=160)
    description: str = Field(min_length=20, max_length=5000)
    category: Category
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    location_text: str = Field(min_length=5, max_length=240)
    location_source: Literal["manual", "device"] = "manual"
    image_note: str | None = Field(default=None, max_length=500)


class StatusUpdate(Input):
    status: ComplaintStatus
    note: str = Field(min_length=10, max_length=2000)
    expected_version: int = Field(ge=1)


class Timestamped(BaseModel):
    @field_validator("*", mode="after")
    @classmethod
    def utc_dates(cls, value):
        if isinstance(value, datetime) and value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value


class EvidenceOut(Timestamped):
    model_config = ConfigDict(from_attributes=True)
    id: str
    media_type: str
    size_bytes: int
    uploaded_at: datetime
    phase: str = "report"
    taken_at: datetime | None = None
    signed_url: str | None = None


class EventOut(Timestamped):
    model_config = ConfigDict(from_attributes=True)
    id: str
    status: str
    note: str
    created_at: datetime


class ComplaintOut(Timestamped):
    model_config = ConfigDict(from_attributes=True)
    id: str
    tracking_id: str
    title: str
    description: str
    category: str
    latitude: float
    longitude: float
    location_text: str
    location_source: str
    area_name: str | None = None
    image_note: str | None = None
    jurisdiction_id: str
    status: str
    version: int
    received_at: datetime
    updated_at: datetime
    analysis_state: Literal["disabled"] = "disabled"
    cluster_id: str | None = None
    cluster_count: int | None = None


class ComplaintDetail(ComplaintOut):
    events: list[EventOut]
    evidence: list[EvidenceOut]
    assigned_worker_id: str | None = None
    assigned_worker_name: str | None = None
    assigned_team_name: str | None = None


class ComplaintPage(BaseModel):
    items: list[ComplaintOut]
    total: int
    offset: int
    limit: int
