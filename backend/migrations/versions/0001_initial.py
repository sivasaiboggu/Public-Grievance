"""Initial manual workflow, including a PostgreSQL spatial index."""

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "users",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("email", sa.String(254), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", sa.String(32), nullable=False),
        sa.Column("jurisdiction_id", sa.String(80), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_table(
        "auth_sessions",
        sa.Column("token_hash", sa.String(64), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_auth_sessions_user_id", "auth_sessions", ["user_id"])
    op.create_table(
        "complaints",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("tracking_id", sa.String(32), nullable=False),
        sa.Column("citizen_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("client_request_id", sa.String(36), nullable=False),
        sa.Column("request_hash", sa.String(64), nullable=False),
        sa.Column("jurisdiction_id", sa.String(80), nullable=False),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("category", sa.String(32), nullable=False),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("location_text", sa.String(240), nullable=False),
        sa.Column("location_source", sa.String(20), nullable=False),
        sa.Column("image_note", sa.String(500), nullable=True),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("received_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("citizen_id", "client_request_id", name="uq_complaint_retry"),
        sa.CheckConstraint("latitude >= -90 AND latitude <= 90", name="ck_latitude"),
        sa.CheckConstraint("longitude >= -180 AND longitude <= 180", name="ck_longitude"),
    )
    op.create_index("ix_complaints_tracking_id", "complaints", ["tracking_id"], unique=True)
    op.create_index("ix_complaints_citizen_id", "complaints", ["citizen_id"])
    op.create_index(
        "ix_complaint_queue", "complaints", ["jurisdiction_id", "status", "received_at"]
    )
    op.create_table(
        "status_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("complaint_id", sa.String(36), sa.ForeignKey("complaints.id"), nullable=False),
        sa.Column("actor_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("note", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_status_events_complaint_id", "status_events", ["complaint_id"])
    op.create_table(
        "evidence",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("complaint_id", sa.String(36), sa.ForeignKey("complaints.id"), nullable=False),
        sa.Column("object_key", sa.String(200), nullable=False, unique=True),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("media_type", sa.String(40), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("complaint_id", "sha256", name="uq_evidence_hash"),
    )
    op.create_index("ix_evidence_complaint_id", "evidence", ["complaint_id"])
    if op.get_bind().dialect.name == "postgresql":
        op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
        op.execute("""ALTER TABLE complaints ADD COLUMN location geography(Point,4326)
            GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(longitude,latitude),4326)::geography) STORED""")
        op.execute("CREATE INDEX ix_complaints_location ON complaints USING gist(location)")


def downgrade():
    # Deliberately explicit: never run this against real citizen records without a backup.
    for table in ("evidence", "status_events", "complaints", "auth_sessions", "users"):
        op.drop_table(table)
