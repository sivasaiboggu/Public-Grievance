import uuid
from datetime import UTC, datetime
from enum import StrEnum

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


def new_id() -> str:
    return str(uuid.uuid4())


def now_utc() -> datetime:
    return datetime.now(UTC)


class Role(StrEnum):
    CITIZEN = "citizen"
    GRO = "gro"
    SUPERVISOR = "supervisor"
    FIELD_OFFICER = "field_officer"
    APPELLATE_OFFICER = "appellate_officer"
    ADMIN = "admin"


class Category(StrEnum):
    ROAD_DAMAGE = "road_damage"
    GARBAGE = "garbage"
    WATERLOGGING = "waterlogging"
    MANHOLE = "manhole"


CATEGORY_LABELS = {
    Category.ROAD_DAMAGE: "Potholes / visible road damage",
    Category.GARBAGE: "Garbage dumping / accumulation",
    Category.WATERLOGGING: "Road waterlogging",
    Category.MANHOLE: "Missing / broken manhole cover",
}


class ComplaintStatus(StrEnum):
    SUBMITTED = "submitted"
    UNDER_REVIEW = "under_review"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"
    REJECTED = "rejected"


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(32), default=Role.CITIZEN)
    jurisdiction_id: Mapped[str] = mapped_column(String(80))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="active")  # active, invited, disabled
    email_verified: Mapped[bool] = mapped_column(Boolean, default=True)
    last_active_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    team_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class AuthSession(Base):
    __tablename__ = "auth_sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Complaint(Base):
    __tablename__ = "complaints"
    __table_args__ = (
        UniqueConstraint("citizen_id", "client_request_id", name="uq_complaint_retry"),
        CheckConstraint("latitude >= -90 AND latitude <= 90", name="ck_latitude"),
        CheckConstraint("longitude >= -180 AND longitude <= 180", name="ck_longitude"),
        Index("ix_complaint_queue", "jurisdiction_id", "status", "received_at"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    tracking_id: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    citizen_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    client_request_id: Mapped[str] = mapped_column(String(36))
    request_hash: Mapped[str] = mapped_column(String(64))
    jurisdiction_id: Mapped[str] = mapped_column(String(80))
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(32))
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    location_text: Mapped[str] = mapped_column(String(240))
    location_source: Mapped[str] = mapped_column(String(20), default="manual")
    area_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    image_note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default=ComplaintStatus.SUBMITTED)
    version: Mapped[int] = mapped_column(Integer, default=1)
    priority_level: Mapped[str | None] = mapped_column(String(20), default="medium")
    priority_reason: Mapped[str | None] = mapped_column(String(255), nullable=True)
    embedding_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    first_response_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    first_response_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cluster_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)


class StatusEvent(Base):
    __tablename__ = "status_events"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    complaint_id: Mapped[str] = mapped_column(ForeignKey("complaints.id"), index=True)
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(String(32))
    note: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class Evidence(Base):
    __tablename__ = "evidence"
    __table_args__ = (UniqueConstraint("complaint_id", "sha256", name="uq_evidence_hash"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    complaint_id: Mapped[str] = mapped_column(ForeignKey("complaints.id"), index=True)
    object_key: Mapped[str] = mapped_column(String(200), unique=True)
    sha256: Mapped[str] = mapped_column(String(64))
    dhash: Mapped[str | None] = mapped_column(String(32), nullable=True)
    media_type: Mapped[str] = mapped_column(String(40))
    size_bytes: Mapped[int] = mapped_column(Integer)
    thumbnail_key: Mapped[str | None] = mapped_column(String(200), nullable=True)
    display_key: Mapped[str | None] = mapped_column(String(200), nullable=True)
    phase: Mapped[str] = mapped_column(String(20), default="report")  # report, before, after
    taken_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    processed: Mapped[bool] = mapped_column(Boolean, default=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class CategoryRecord(Base):
    __tablename__ = "categories"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    label: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(Text)
    target_hours: Mapped[int] = mapped_column(Integer, default=168)
    first_response_hours: Mapped[int] = mapped_column(Integer, default=24)
    fix_hours: Mapped[int] = mapped_column(Integer, default=48)
    escalate_after_hours: Mapped[int] = mapped_column(Integer, default=24)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    pass_to_senior_hours: Mapped[int | None] = mapped_column(Integer, nullable=True)
    warn_before_due_hours: Mapped[int | None] = mapped_column(Integer, nullable=True)
    icon: Mapped[str] = mapped_column(String(40), default="AlertTriangle")
    photo_rule: Mapped[str] = mapped_column(String(20), default="recommended")  # required, recommended, optional
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    default_team_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class Team(Base):
    __tablename__ = "teams"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    jurisdiction_id: Mapped[str] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class Assignment(Base):
    __tablename__ = "assignments"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    complaint_id: Mapped[str] = mapped_column(ForeignKey("complaints.id"), index=True)
    assigned_by_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    assigned_to_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    team_id: Mapped[str | None] = mapped_column(ForeignKey("teams.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="assigned")  # assigned, in_progress, completed, cancelled
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AuditLog(Base):
    __tablename__ = "audit_log"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    actor_name: Mapped[str] = mapped_column(String(120))
    action: Mapped[str] = mapped_column(String(60))
    target_type: Mapped[str] = mapped_column(String(40))
    target_id: Mapped[str] = mapped_column(String(36))
    details: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class UserToken(Base):
    __tablename__ = "user_tokens"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    token_type: Mapped[str] = mapped_column(String(30))  # verification, password_reset, staff_invite
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    family_id: Mapped[str] = mapped_column(String(36), index=True)
    device_info: Mapped[str | None] = mapped_column(String(200), nullable=True)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    title: Mapped[str] = mapped_column(String(160))
    body: Mapped[str] = mapped_column(Text)
    link: Mapped[str | None] = mapped_column(String(200), nullable=True)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class MLPrediction(Base):
    __tablename__ = "ml_predictions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    kind: Mapped[str] = mapped_column(String(40), index=True)  # photo_check, duplicate_match, priority
    report_id: Mapped[str] = mapped_column(ForeignKey("complaints.id"), index=True)
    photo_id: Mapped[str | None] = mapped_column(ForeignKey("evidence.id"), nullable=True, index=True)
    model_name: Mapped[str] = mapped_column(String(80))
    model_version: Mapped[str] = mapped_column(String(80))
    output_json: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class MLFeedback(Base):
    __tablename__ = "ml_feedback"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    prediction_id: Mapped[str] = mapped_column(ForeignKey("ml_predictions.id"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    feedback_choice: Mapped[str] = mapped_column(String(20))  # right, wrong
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class IncidentLink(Base):
    __tablename__ = "incident_links"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    report_id_1: Mapped[str] = mapped_column(ForeignKey("complaints.id"), index=True)
    report_id_2: Mapped[str] = mapped_column(ForeignKey("complaints.id"), index=True)
    decision: Mapped[str] = mapped_column(String(40))  # same_problem, different_problem, recurrence
    reviewer_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class EscalationEvent(Base):
    __tablename__ = "escalation_events"
    __table_args__ = (
        UniqueConstraint("report_id", "level", name="uq_escalation_event_level"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    report_id: Mapped[str] = mapped_column(ForeignKey("complaints.id"), index=True)
    level: Mapped[str] = mapped_column(String(40))  # due_soon, overdue, passed_to_senior, needs_senior_attention
    silent: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SystemSetting(Base):
    __tablename__ = "system_settings"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    key: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    value: Mapped[str] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_by_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)


class IncidentCluster(Base):
    __tablename__ = "incident_clusters"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    category: Mapped[str] = mapped_column(String(32), index=True)
    center_latitude: Mapped[float] = mapped_column(Float)
    center_longitude: Mapped[float] = mapped_column(Float)
    center_address: Mapped[str | None] = mapped_column(String(240), nullable=True)
    first_reported_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    state: Mapped[str] = mapped_column(String(20), default="suggested")  # suggested, confirmed, closed
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class IncidentClusterMember(Base):
    __tablename__ = "incident_cluster_members"
    __table_args__ = (
        UniqueConstraint("cluster_id", "report_id", name="uq_cluster_member"),
    )
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    cluster_id: Mapped[str] = mapped_column(ForeignKey("incident_clusters.id"), index=True)
    report_id: Mapped[str] = mapped_column(ForeignKey("complaints.id"), index=True)
    added_by: Mapped[str] = mapped_column(String(20), default="auto")  # auto, officer
    score: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class PhotoSignal(Base):
    __tablename__ = "photo_signals"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    evidence_id: Mapped[str] = mapped_column(ForeignKey("evidence.id"), unique=True, index=True)
    complaint_id: Mapped[str] = mapped_column(ForeignKey("complaints.id"), index=True)
    has_c2pa: Mapped[bool] = mapped_column(Boolean, default=False)
    software_tag: Mapped[str | None] = mapped_column(String(120), nullable=True)
    has_camera_metadata: Mapped[bool] = mapped_column(Boolean, default=False)
    camera_make: Mapped[str | None] = mapped_column(String(80), nullable=True)
    camera_model: Mapped[str | None] = mapped_column(String(80), nullable=True)
    capture_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    time_flag: Mapped[str | None] = mapped_column(String(50), nullable=True)
    distance_meters: Mapped[float | None] = mapped_column(Float, nullable=True)
    place_flag: Mapped[str | None] = mapped_column(String(50), nullable=True)
    dimensions: Mapped[str | None] = mapped_column(String(30), nullable=True)
    dimension_flag: Mapped[bool] = mapped_column(Boolean, default=False)
    authenticity_level: Mapped[str] = mapped_column(String(30), default="none")  # none, look_closer
    reasons_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)



