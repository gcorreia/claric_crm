"""crm leads/contacts/opportunities

Revision ID: gg88hh99ii00
Revises: ff66gg77hh88
Create Date: 2026-02-18
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "gg88hh99ii00"
down_revision = "ff66gg77hh88"
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
        "crm_leads",
        sa.Column("id", sa.String(length=18), primary_key=True),
        sa.Column(
            "business_unit_id",
            sa.String(length=18),
            sa.ForeignKey("business_units.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("company", sa.String(length=200), nullable=False, server_default=""),
        sa.Column("status", sa.String(length=60), nullable=False, server_default="Novo"),
        sa.Column("source", sa.String(length=60), nullable=False, server_default=""),
        sa.Column("score", sa.String(length=20), nullable=False, server_default=""),
        sa.Column("owner", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_crm_leads_business_unit_id", "crm_leads", ["business_unit_id"])
    _enable_rls("crm_leads")

    op.create_table(
        "crm_contacts",
        sa.Column("id", sa.String(length=18), primary_key=True),
        sa.Column(
            "business_unit_id",
            sa.String(length=18),
            sa.ForeignKey("business_units.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "account_id",
            sa.String(length=18),
            sa.ForeignKey("crm_accounts.id", ondelete="RESTRICT"),
            nullable=True,
        ),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("phone", sa.String(length=60), nullable=False, server_default=""),
        sa.Column("title", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("owner", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_crm_contacts_business_unit_id", "crm_contacts", ["business_unit_id"])
    op.create_index("ix_crm_contacts_account_id", "crm_contacts", ["account_id"])
    _enable_rls("crm_contacts")

    op.create_table(
        "crm_opportunities",
        sa.Column("id", sa.String(length=18), primary_key=True),
        sa.Column(
            "business_unit_id",
            sa.String(length=18),
            sa.ForeignKey("business_units.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "account_id",
            sa.String(length=18),
            sa.ForeignKey("crm_accounts.id", ondelete="RESTRICT"),
            nullable=True,
        ),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("stage", sa.String(length=60), nullable=False, server_default="Prospect"),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("close_date", sa.Date(), nullable=True),
        sa.Column("owner", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_crm_opportunities_business_unit_id", "crm_opportunities", ["business_unit_id"])
    op.create_index("ix_crm_opportunities_account_id", "crm_opportunities", ["account_id"])
    _enable_rls("crm_opportunities")


def downgrade() -> None:
    op.drop_index("ix_crm_opportunities_account_id", table_name="crm_opportunities")
    op.drop_index("ix_crm_opportunities_business_unit_id", table_name="crm_opportunities")
    op.drop_table("crm_opportunities")

    op.drop_index("ix_crm_contacts_account_id", table_name="crm_contacts")
    op.drop_index("ix_crm_contacts_business_unit_id", table_name="crm_contacts")
    op.drop_table("crm_contacts")

    op.drop_index("ix_crm_leads_business_unit_id", table_name="crm_leads")
    op.drop_table("crm_leads")
