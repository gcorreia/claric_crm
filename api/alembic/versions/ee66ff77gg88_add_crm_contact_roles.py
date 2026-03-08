"""Add crm_contact_roles table

Revision ID: ee66ff77gg88
Revises: dd55ee66ff77
Create Date: 2026-02-27
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "ee66ff77gg88"
down_revision = "dd55ee66ff77"
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
        "crm_contact_roles",
        sa.Column("id", sa.String(length=18), primary_key=True),
        sa.Column(
            "business_unit_id",
            sa.String(length=18),
            sa.ForeignKey("business_units.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("value", sa.String(length=60), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("business_unit_id", "value", name="uq_crm_contact_roles_bu_value"),
    )
    op.create_index("ix_crm_contact_roles_business_unit_id", "crm_contact_roles", ["business_unit_id"])
    op.create_index("ix_crm_contact_roles_is_active", "crm_contact_roles", ["is_active"])
    op.create_index("ix_crm_contact_roles_sort_order", "crm_contact_roles", ["sort_order"])
    _enable_rls("crm_contact_roles")


def downgrade() -> None:
    op.drop_index("ix_crm_contact_roles_sort_order", table_name="crm_contact_roles")
    op.drop_index("ix_crm_contact_roles_is_active", table_name="crm_contact_roles")
    op.drop_index("ix_crm_contact_roles_business_unit_id", table_name="crm_contact_roles")
    op.drop_table("crm_contact_roles")
