"""Pass 10 additions: SLA clocks, settings table, incident clustering, and photo authenticity signals.

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-19
"""

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade():
    # 1. Add SLA clock fields to categories
    op.add_column("categories", sa.Column("first_response_hours", sa.Integer(), nullable=False, server_default="24"))
    op.add_column("categories", sa.Column("fix_hours", sa.Integer(), nullable=False, server_default="48"))
    op.add_column("categories", sa.Column("escalate_after_hours", sa.Integer(), nullable=False, server_default="24"))

    # 2. Add SLA and cluster fields to complaints
    op.add_column("complaints", sa.Column("first_response_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("complaints", sa.Column("first_response_due_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("complaints", sa.Column("cluster_id", sa.String(36), nullable=True, index=True))

    # 3. Create settings table for business settings layer
    op.create_table(
        "system_settings",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("key", sa.String(80), nullable=False, unique=True, index=True),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("description", sa.String(255), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_by_id", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
    )

    # 4. Create incident_clusters table
    op.create_table(
        "incident_clusters",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("category", sa.String(32), nullable=False, index=True),
        sa.Column("center_latitude", sa.Float(), nullable=False),
        sa.Column("center_longitude", sa.Float(), nullable=False),
        sa.Column("center_address", sa.String(240), nullable=True),
        sa.Column("first_reported_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("state", sa.String(20), nullable=False, server_default="suggested"),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    # 5. Create incident_cluster_members table
    op.create_table(
        "incident_cluster_members",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("cluster_id", sa.String(36), sa.ForeignKey("incident_clusters.id"), nullable=False, index=True),
        sa.Column("report_id", sa.String(36), sa.ForeignKey("complaints.id"), nullable=False, index=True),
        sa.Column("added_by", sa.String(20), nullable=False, server_default="auto"),
        sa.Column("score", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("cluster_id", "report_id", name="uq_cluster_member"),
    )

    # 6. Create photo_signals table for authenticity and edits check
    op.create_table(
        "photo_signals",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("evidence_id", sa.String(36), sa.ForeignKey("evidence.id"), nullable=False, unique=True, index=True),
        sa.Column("complaint_id", sa.String(36), sa.ForeignKey("complaints.id"), nullable=False, index=True),
        sa.Column("has_c2pa", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("software_tag", sa.String(120), nullable=True),
        sa.Column("has_camera_metadata", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("camera_make", sa.String(80), nullable=True),
        sa.Column("camera_model", sa.String(80), nullable=True),
        sa.Column("capture_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("time_flag", sa.String(50), nullable=True),
        sa.Column("distance_meters", sa.Float(), nullable=True),
        sa.Column("place_flag", sa.String(50), nullable=True),
        sa.Column("dimensions", sa.String(30), nullable=True),
        sa.Column("dimension_flag", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("authenticity_level", sa.String(30), nullable=False, server_default="none"),
        sa.Column("reasons_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade():
    op.drop_table("photo_signals")
    op.drop_table("incident_cluster_members")
    op.drop_table("incident_clusters")
    op.drop_table("system_settings")
    op.drop_column("complaints", "cluster_id")
    op.drop_column("complaints", "first_response_due_at")
    op.drop_column("complaints", "first_response_at")
    op.drop_column("categories", "escalate_after_hours")
    op.drop_column("categories", "fix_hours")
    op.drop_column("categories", "first_response_hours")
