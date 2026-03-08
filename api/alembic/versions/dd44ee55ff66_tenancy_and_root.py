"""tenancy and root roles

Revision ID: dd44ee55ff66
Revises: cc33dd44ee55
Create Date: 2026-02-17
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "dd44ee55ff66"
down_revision = "cc33dd44ee55"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("is_root", sa.Boolean(), nullable=False, server_default=sa.text("false")))

    op.add_column("business_units", sa.Column("admin_root_user_id", sa.String(length=18), nullable=True))
    op.create_foreign_key(
        "fk_business_units_admin_root_user_id",
        "business_units",
        "users",
        ["admin_root_user_id"],
        ["id"],
        ondelete="RESTRICT",
    )

    op.create_table(
        "business_unit_users",
        sa.Column("id", sa.String(length=18), primary_key=True),
        sa.Column("business_unit_id", sa.String(length=18), sa.ForeignKey("business_units.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(length=18), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role", sa.String(length=50), nullable=False, server_default="BU_MEMBER"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("business_unit_id", "user_id", name="uq_business_unit_users_bu_user"),
    )
    op.create_index("ix_business_unit_users_business_unit_id", "business_unit_users", ["business_unit_id"])
    op.create_index("ix_business_unit_users_user_id", "business_unit_users", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_business_unit_users_user_id", table_name="business_unit_users")
    op.drop_index("ix_business_unit_users_business_unit_id", table_name="business_unit_users")
    op.drop_table("business_unit_users")

    op.drop_constraint("fk_business_units_admin_root_user_id", "business_units", type_="foreignkey")
    op.drop_column("business_units", "admin_root_user_id")

    op.drop_column("users", "is_root")
