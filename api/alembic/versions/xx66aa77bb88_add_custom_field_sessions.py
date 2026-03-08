"""Add crm_custom_field_sessions and require session_id on field definitions.

Revision ID: xx66aa77bb88
Revises: ww44yy55zz66
Create Date: 2026-02-26
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "xx66aa77bb88"
down_revision = "ww44yy55zz66"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "crm_custom_field_sessions",
        sa.Column("id", sa.String(length=18), primary_key=True),
        sa.Column(
            "business_unit_id",
            sa.String(length=18),
            sa.ForeignKey("business_units.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("entity_type", sa.String(length=50), nullable=True),
        sa.Column(
            "custom_object_id",
            sa.String(length=18),
            sa.ForeignKey("crm_custom_object_definitions.id", ondelete="RESTRICT"),
            nullable=True,
        ),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("label", sa.String(length=120), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )

    op.create_check_constraint(
        "ck_cfs_target_xor",
        "crm_custom_field_sessions",
        "(entity_type IS NOT NULL AND custom_object_id IS NULL) OR "
        "(entity_type IS NULL AND custom_object_id IS NOT NULL)",
    )

    op.create_index(
        "ix_cfs_business_unit_id",
        "crm_custom_field_sessions",
        ["business_unit_id"],
    )
    op.create_index(
        "ix_cfs_entity_type",
        "crm_custom_field_sessions",
        ["entity_type"],
    )
    op.create_index(
        "ix_cfs_custom_object_id",
        "crm_custom_field_sessions",
        ["custom_object_id"],
    )

    op.create_index(
        "uq_cfs_bu_core_key",
        "crm_custom_field_sessions",
        ["business_unit_id", "entity_type", "key"],
        unique=True,
        postgresql_where=sa.text("custom_object_id IS NULL"),
    )
    op.create_index(
        "uq_cfs_bu_customobj_key",
        "crm_custom_field_sessions",
        ["business_unit_id", "custom_object_id", "key"],
        unique=True,
        postgresql_where=sa.text("custom_object_id IS NOT NULL"),
    )

    op.add_column(
        "crm_custom_field_definitions",
        sa.Column(
            "session_id",
            sa.String(length=18),
            sa.ForeignKey("crm_custom_field_sessions.id", ondelete="RESTRICT"),
            nullable=False,
        ),
    )
    op.create_index("ix_cfdef_session_id", "crm_custom_field_definitions", ["session_id"])


def downgrade() -> None:
    op.drop_index("ix_cfdef_session_id", table_name="crm_custom_field_definitions")
    op.drop_column("crm_custom_field_definitions", "session_id")

    op.drop_index("uq_cfs_bu_customobj_key", table_name="crm_custom_field_sessions")
    op.drop_index("uq_cfs_bu_core_key", table_name="crm_custom_field_sessions")
    op.drop_index("ix_cfs_custom_object_id", table_name="crm_custom_field_sessions")
    op.drop_index("ix_cfs_entity_type", table_name="crm_custom_field_sessions")
    op.drop_index("ix_cfs_business_unit_id", table_name="crm_custom_field_sessions")
    op.drop_constraint("ck_cfs_target_xor", "crm_custom_field_sessions", type_="check")
    op.drop_table("crm_custom_field_sessions")
