"""Pass 8 additions: ML suggestions, incident linking, and escalation events.

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-18
"""

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade():
    # 1. Add fields to complaints
    op.add_column("complaints", sa.Column("priority_level", sa.String(20), nullable=True, server_default="medium"))
    op.add_column("complaints", sa.Column("priority_reason", sa.String(255), nullable=True))
    op.add_column("complaints", sa.Column("embedding_json", sa.Text(), nullable=True))

    # 2. Add dhash to evidence
    op.add_column("evidence", sa.Column("dhash", sa.String(32), nullable=True))

    # 3. Add sort_order and escalation thresholds to categories
    op.add_column("categories", sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("categories", sa.Column("pass_to_senior_hours", sa.Integer(), nullable=True))
    op.add_column("categories", sa.Column("warn_before_due_hours", sa.Integer(), nullable=True))

    # 4. Create ml_predictions table
    op.create_table(
        "ml_predictions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("kind", sa.String(40), nullable=False, index=True),
        sa.Column("report_id", sa.String(36), sa.ForeignKey("complaints.id"), nullable=False, index=True),
        sa.Column("photo_id", sa.String(36), sa.ForeignKey("evidence.id"), nullable=True, index=True),
        sa.Column("model_name", sa.String(80), nullable=False),
        sa.Column("model_version", sa.String(80), nullable=False),
        sa.Column("output_json", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    # 5. Create ml_feedback table
    op.create_table(
        "ml_feedback",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("prediction_id", sa.String(36), sa.ForeignKey("ml_predictions.id"), nullable=False, index=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("feedback_choice", sa.String(20), nullable=False),
        sa.Column("note", sa.String(255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    # 6. Create incident_links table
    op.create_table(
        "incident_links",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("report_id_1", sa.String(36), sa.ForeignKey("complaints.id"), nullable=False, index=True),
        sa.Column("report_id_2", sa.String(36), sa.ForeignKey("complaints.id"), nullable=False, index=True),
        sa.Column("decision", sa.String(40), nullable=False),
        sa.Column("reviewer_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    # 7. Create escalation_events table
    op.create_table(
        "escalation_events",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("report_id", sa.String(36), sa.ForeignKey("complaints.id"), nullable=False, index=True),
        sa.Column("level", sa.String(40), nullable=False),
        sa.Column("silent", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("report_id", "level", name="uq_escalation_event_level"),
    )


def downgrade():
    op.drop_table("escalation_events")
    op.drop_table("incident_links")
    op.drop_table("ml_feedback")
    op.drop_table("ml_predictions")
    op.drop_column("categories", "warn_before_due_hours")
    op.drop_column("categories", "pass_to_senior_hours")
    op.drop_column("categories", "sort_order")
    op.drop_column("evidence", "dhash")
    op.drop_column("complaints", "embedding_json")
    op.drop_column("complaints", "priority_reason")
    op.drop_column("complaints", "priority_level")
