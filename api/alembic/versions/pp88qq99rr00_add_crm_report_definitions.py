"""Add crm_report_definitions table

Revision ID: pp88qq99rr00
Revises: oo77pp88qq99
Create Date: 2026-03-01
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op


revision = "pp88qq99rr00"
down_revision = "oo77pp88qq99"
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
        "crm_report_definitions",
        sa.Column("id", sa.String(length=18), primary_key=True),
        sa.Column(
            "business_unit_id",
            sa.String(length=18),
            sa.ForeignKey("business_units.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("report_type", sa.String(length=40), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("config", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column(
            "owner_id",
            sa.String(length=18),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("owner_name", sa.String(length=200), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_crm_report_definitions_business_unit_id", "crm_report_definitions", ["business_unit_id"])
    op.create_index("ix_crm_report_definitions_report_type", "crm_report_definitions", ["report_type"])
    op.create_index("ix_crm_report_definitions_owner_id", "crm_report_definitions", ["owner_id"])
    op.create_index(
        "ix_crm_report_definitions_bu_type",
        "crm_report_definitions",
        ["business_unit_id", "report_type"],
    )

    _enable_rls("crm_report_definitions")


def downgrade() -> None:
    op.drop_index("ix_crm_report_definitions_bu_type", table_name="crm_report_definitions")
    op.drop_index("ix_crm_report_definitions_owner_id", table_name="crm_report_definitions")
    op.drop_index("ix_crm_report_definitions_report_type", table_name="crm_report_definitions")
    op.drop_index("ix_crm_report_definitions_business_unit_id", table_name="crm_report_definitions")
    op.drop_table("crm_report_definitions")
