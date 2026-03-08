"""crm custom objects (definitions + records)

Revision ID: hh99ii00jj11
Revises: gg88hh99ii00
Create Date: 2026-02-18
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "hh99ii00jj11"
down_revision = "gg88hh99ii00"
branch_labels = None
depends_on = None


def _enable_rls(table: str) -> None:
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;")
    op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY;")
    op.execute(
        f"""
        CREATE POLICY {table}_tenant_isolation
        ON {table}
        USING (business_unit_id = current_setting('app.tenant_id', true));
        """
    )


def upgrade() -> None:
    op.create_table(
        "crm_custom_object_definitions",
        sa.Column("id", sa.String(length=18), primary_key=True),
        sa.Column(
            "business_unit_id",
            sa.String(length=18),
            sa.ForeignKey("business_units.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("label", sa.String(length=120), nullable=False),
        sa.Column("plural_label", sa.String(length=140), nullable=False, server_default=""),
        sa.Column("parent_entity_type", sa.String(length=50), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("business_unit_id", "key", name="uq_cobjdef_bu_key"),
    )
    op.create_index(
        "ix_crm_custom_object_definitions_business_unit_id",
        "crm_custom_object_definitions",
        ["business_unit_id"],
    )
    _enable_rls("crm_custom_object_definitions")

    op.create_table(
        "crm_custom_object_records",
        sa.Column("id", sa.String(length=18), primary_key=True),
        sa.Column(
            "business_unit_id",
            sa.String(length=18),
            sa.ForeignKey("business_units.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "object_id",
            sa.String(length=18),
            sa.ForeignKey("crm_custom_object_definitions.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=200), nullable=False, server_default=""),
        sa.Column("parent_id", sa.String(length=18), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_crm_custom_object_records_business_unit_id", "crm_custom_object_records", ["business_unit_id"])
    op.create_index("ix_crm_custom_object_records_object_id", "crm_custom_object_records", ["object_id"])
    op.create_index(
        "ix_crm_custom_object_records_bu_object_parent",
        "crm_custom_object_records",
        ["business_unit_id", "object_id", "parent_id"],
    )
    _enable_rls("crm_custom_object_records")


def downgrade() -> None:
    op.drop_index("ix_crm_custom_object_records_bu_object_parent", table_name="crm_custom_object_records")
    op.drop_index("ix_crm_custom_object_records_object_id", table_name="crm_custom_object_records")
    op.drop_index("ix_crm_custom_object_records_business_unit_id", table_name="crm_custom_object_records")
    op.drop_table("crm_custom_object_records")

    op.drop_index("ix_crm_custom_object_definitions_business_unit_id", table_name="crm_custom_object_definitions")
    op.drop_table("crm_custom_object_definitions")
