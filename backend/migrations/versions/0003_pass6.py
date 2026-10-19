"""Pass 6 additions: complaints.area_name, evidence.phase, evidence.taken_at, categories.photo_rule."""

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade():
    # 1. Add area_name to complaints
    op.add_column("complaints", sa.Column("area_name", sa.String(100), nullable=True))

    # 2. Add phase and taken_at to evidence
    op.add_column("evidence", sa.Column("phase", sa.String(20), nullable=False, server_default="report"))
    op.add_column("evidence", sa.Column("taken_at", sa.DateTime(timezone=True), nullable=True))

    # 3. Add photo_rule to categories
    op.add_column("categories", sa.Column("photo_rule", sa.String(20), nullable=False, server_default="recommended"))


def downgrade():
    op.drop_column("categories", "photo_rule")
    op.drop_column("evidence", "taken_at")
    op.drop_column("evidence", "phase")
    op.drop_column("complaints", "area_name")
