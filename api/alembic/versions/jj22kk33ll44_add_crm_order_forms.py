"""Add crm_order_forms table

Revision ID: jj22kk33ll44
Revises: ii11jj22kk33
Create Date: 2026-02-28
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "jj22kk33ll44"
down_revision = "ii11jj22kk33"
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
        "crm_order_forms",
        sa.Column("id", sa.String(length=18), primary_key=True),
        sa.Column(
            "business_unit_id",
            sa.String(length=18),
            sa.ForeignKey("business_units.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "opportunity_id",
            sa.String(length=18),
            sa.ForeignKey("crm_opportunities.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "account_id",
            sa.String(length=18),
            sa.ForeignKey("crm_accounts.id", ondelete="RESTRICT"),
            nullable=True,
        ),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("status", sa.String(length=40), nullable=False, server_default="Draft"),
        sa.Column("effective_start_date", sa.Date(), nullable=True),
        sa.Column("effective_end_date", sa.Date(), nullable=True),
        sa.Column("total_amount", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="BRL"),
        sa.Column("signed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("contract_generated", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("notes", sa.Text(), nullable=False, server_default=""),
        sa.Column(
            "owner_id",
            sa.String(length=18),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("owner_name", sa.String(length=200), nullable=True, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_crm_order_forms_business_unit_id", "crm_order_forms", ["business_unit_id"])
    op.create_index("ix_crm_order_forms_opportunity_id", "crm_order_forms", ["opportunity_id"])
    op.create_index("ix_crm_order_forms_account_id", "crm_order_forms", ["account_id"])
    op.create_index("ix_crm_order_forms_owner_id", "crm_order_forms", ["owner_id"])
    op.create_index("ix_crm_order_forms_status", "crm_order_forms", ["status"])

    _enable_rls("crm_order_forms")


def downgrade() -> None:
    op.drop_index("ix_crm_order_forms_status", table_name="crm_order_forms")
    op.drop_index("ix_crm_order_forms_owner_id", table_name="crm_order_forms")
    op.drop_index("ix_crm_order_forms_account_id", table_name="crm_order_forms")
    op.drop_index("ix_crm_order_forms_opportunity_id", table_name="crm_order_forms")
    op.drop_index("ix_crm_order_forms_business_unit_id", table_name="crm_order_forms")
    op.drop_table("crm_order_forms")
