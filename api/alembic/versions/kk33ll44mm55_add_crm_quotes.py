"""Add crm_quotes table

Revision ID: kk33ll44mm55
Revises: jj22kk33ll44
Create Date: 2026-03-01
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "kk33ll44mm55"
down_revision = "jj22kk33ll44"
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
        "crm_quotes",
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
        sa.Column("valid_until", sa.Date(), nullable=True),
        sa.Column("total_amount", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("discount_amount", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("final_amount", sa.Numeric(14, 2), nullable=False, server_default="0"),
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
    op.create_index("ix_crm_quotes_business_unit_id", "crm_quotes", ["business_unit_id"])
    op.create_index("ix_crm_quotes_opportunity_id", "crm_quotes", ["opportunity_id"])
    op.create_index("ix_crm_quotes_account_id", "crm_quotes", ["account_id"])
    op.create_index("ix_crm_quotes_owner_id", "crm_quotes", ["owner_id"])
    op.create_index("ix_crm_quotes_status", "crm_quotes", ["status"])

    _enable_rls("crm_quotes")


def downgrade() -> None:
    op.drop_index("ix_crm_quotes_status", table_name="crm_quotes")
    op.drop_index("ix_crm_quotes_owner_id", table_name="crm_quotes")
    op.drop_index("ix_crm_quotes_account_id", table_name="crm_quotes")
    op.drop_index("ix_crm_quotes_opportunity_id", table_name="crm_quotes")
    op.drop_index("ix_crm_quotes_business_unit_id", table_name="crm_quotes")
    op.drop_table("crm_quotes")
