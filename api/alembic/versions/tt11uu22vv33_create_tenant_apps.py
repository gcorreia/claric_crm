"""create tenant_apps

Revision ID: tt11uu22vv33
Revises: ii00jj11kk22
Create Date: 2026-02-21
"""

from alembic import op
import sqlalchemy as sa

revision = "tt11uu22vv33"
down_revision = "ii00jj11kk22"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tenant_apps",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("business_unit_id", sa.String(length=18), sa.ForeignKey("business_units.id"), nullable=False, index=True),
        sa.Column("app_key", sa.String(length=64), nullable=False, index=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("business_unit_id", "app_key", name="uq_tenant_apps_bu_app"),
    )


def downgrade() -> None:
    op.drop_table("tenant_apps")