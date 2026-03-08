"""Add custom_object_id to crm_custom_field_definitions and align constraints/indexes.

Revision ID: vv33xx44yy55
Revises: uu22vv33ww44
Create Date: 2026-02-25
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "vv33xx44yy55"
down_revision = "uu22vv33ww44"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add nullable column + FK
    op.add_column(
        "crm_custom_field_definitions",
        sa.Column(
            "custom_object_id",
            sa.String(length=18),
            sa.ForeignKey("crm_custom_object_definitions.id", ondelete="RESTRICT"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_cfdef_custom_object_id",
        "crm_custom_field_definitions",
        ["custom_object_id"],
    )

    # entity_type becomes nullable (core vs custom object)
    op.alter_column(
        "crm_custom_field_definitions",
        "entity_type",
        existing_type=sa.String(length=50),
        nullable=True,
    )

    # Drop old uniqueness (core-only world)
    op.drop_constraint(
        "uq_cfdef_bu_entity_key",
        "crm_custom_field_definitions",
        type_="unique",
    )

    # XOR target constraint
    op.create_check_constraint(
        "ck_cfdef_target_xor",
        "crm_custom_field_definitions",
        "(entity_type IS NOT NULL AND custom_object_id IS NULL) OR "
        "(entity_type IS NULL AND custom_object_id IS NOT NULL)",
    )

    # Partial unique indexes (match model)
    op.create_index(
        "uq_cfdef_bu_core_key",
        "crm_custom_field_definitions",
        ["business_unit_id", "entity_type", "key"],
        unique=True,
        postgresql_where=sa.text("custom_object_id IS NULL"),
    )
    op.create_index(
        "uq_cfdef_bu_customobj_key",
        "crm_custom_field_definitions",
        ["business_unit_id", "custom_object_id", "key"],
        unique=True,
        postgresql_where=sa.text("custom_object_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("uq_cfdef_bu_customobj_key", table_name="crm_custom_field_definitions")
    op.drop_index("uq_cfdef_bu_core_key", table_name="crm_custom_field_definitions")
    op.drop_constraint("ck_cfdef_target_xor", "crm_custom_field_definitions", type_="check")

    op.create_unique_constraint(
        "uq_cfdef_bu_entity_key",
        "crm_custom_field_definitions",
        ["business_unit_id", "entity_type", "key"],
    )

    op.alter_column(
        "crm_custom_field_definitions",
        "entity_type",
        existing_type=sa.String(length=50),
        nullable=False,
    )

    op.drop_index("ix_cfdef_custom_object_id", table_name="crm_custom_field_definitions")
    op.drop_column("crm_custom_field_definitions", "custom_object_id")