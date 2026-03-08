"""profiles and permissions (RBAC)

Revision ID: ee55ff66gg77
Revises: dd44ee55ff66
Create Date: 2026-02-17
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "ee55ff66gg77"
down_revision = "dd44ee55ff66"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "profiles",
        sa.Column("id", sa.String(length=18), primary_key=True),
        sa.Column("business_unit_id", sa.String(length=18), sa.ForeignKey("business_units.id", ondelete="CASCADE"), nullable=True),
        sa.Column("key", sa.String(length=60), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("kind", sa.String(length=30), nullable=False, server_default="CUSTOM"),
        sa.Column("is_locked", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("business_unit_id", "key", name="uq_profiles_bu_key"),
    )
    op.create_index("ix_profiles_business_unit_id", "profiles", ["business_unit_id"])

    op.create_table(
        "profile_permissions",
        sa.Column("id", sa.String(length=18), primary_key=True),
        sa.Column("profile_id", sa.String(length=18), sa.ForeignKey("profiles.id", ondelete="CASCADE"), nullable=False),
        sa.Column("app", sa.String(length=60), nullable=False),
        sa.Column("resource", sa.String(length=60), nullable=False),
        sa.Column("action", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("profile_id", "app", "resource", "action", name="uq_profile_permissions_profile_app_resource_action"),
    )
    op.create_index("ix_profile_permissions_profile_id", "profile_permissions", ["profile_id"])

    op.add_column("business_unit_users", sa.Column("profile_id", sa.String(length=18), nullable=True))
    op.create_index("ix_business_unit_users_profile_id", "business_unit_users", ["profile_id"])
    op.create_foreign_key(
        "fk_business_unit_users_profile_id",
        "business_unit_users",
        "profiles",
        ["profile_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_business_unit_users_profile_id", "business_unit_users", type_="foreignkey")
    op.drop_index("ix_business_unit_users_profile_id", table_name="business_unit_users")
    op.drop_column("business_unit_users", "profile_id")

    op.drop_index("ix_profile_permissions_profile_id", table_name="profile_permissions")
    op.drop_table("profile_permissions")

    op.drop_index("ix_profiles_business_unit_id", table_name="profiles")
    op.drop_table("profiles")
