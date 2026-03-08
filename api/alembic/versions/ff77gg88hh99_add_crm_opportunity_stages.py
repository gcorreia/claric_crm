"""Add crm_opportunity_stages table

Revision ID: ff77gg88hh99
Revises: ee66ff77gg88
Create Date: 2026-02-27
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "ff77gg88hh99"
down_revision = "ee66ff77gg88"
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
        "crm_opportunity_stages",
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
        sa.UniqueConstraint("business_unit_id", "value", name="uq_crm_opportunity_stages_bu_value"),
    )
    op.create_index("ix_crm_opportunity_stages_business_unit_id", "crm_opportunity_stages", ["business_unit_id"])
    op.create_index("ix_crm_opportunity_stages_is_active", "crm_opportunity_stages", ["is_active"])
    op.create_index("ix_crm_opportunity_stages_sort_order", "crm_opportunity_stages", ["sort_order"])

    # Seed default stage values for existing business units.
    op.execute(
        """
        WITH defaults(value, sort_order) AS (
          VALUES
            ('Prospect', 0),
            ('Qualification', 1),
            ('Proposal', 2),
            ('Negotiation', 3),
            ('Closed Won', 4),
            ('Closed Lost', 5)
        )
        INSERT INTO crm_opportunity_stages (id, business_unit_id, value, sort_order, is_active)
        SELECT
          'OST' || substr(md5(bu.id || ':' || d.value), 1, 15),
          bu.id,
          d.value,
          d.sort_order,
          true
        FROM business_units bu
        CROSS JOIN defaults d
        ON CONFLICT (business_unit_id, value) DO NOTHING
        """
    )

    _enable_rls("crm_opportunity_stages")


def downgrade() -> None:
    op.drop_index("ix_crm_opportunity_stages_sort_order", table_name="crm_opportunity_stages")
    op.drop_index("ix_crm_opportunity_stages_is_active", table_name="crm_opportunity_stages")
    op.drop_index("ix_crm_opportunity_stages_business_unit_id", table_name="crm_opportunity_stages")
    op.drop_table("crm_opportunity_stages")
