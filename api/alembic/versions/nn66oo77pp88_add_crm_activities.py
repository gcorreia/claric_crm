"""Add crm_activities table

Revision ID: nn66oo77pp88
Revises: mm55nn66oo77
Create Date: 2026-03-01
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "nn66oo77pp88"
down_revision = "mm55nn66oo77"
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
        "crm_activities",
        sa.Column("id", sa.String(length=18), primary_key=True),
        sa.Column(
            "business_unit_id",
            sa.String(length=18),
            sa.ForeignKey("business_units.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("type", sa.String(length=20), nullable=False, server_default="task"),
        sa.Column("subject", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="Open"),
        sa.Column("priority", sa.String(length=20), nullable=False, server_default="Normal"),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("what_type", sa.String(length=30), nullable=True),
        sa.Column("what_id", sa.String(length=18), nullable=True),
        sa.Column("who_type", sa.String(length=30), nullable=True),
        sa.Column("who_id", sa.String(length=18), nullable=True),
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

    op.create_index("ix_crm_activities_business_unit_id", "crm_activities", ["business_unit_id"])
    op.create_index("ix_crm_activities_owner_id", "crm_activities", ["owner_id"])
    op.create_index("ix_crm_activities_status", "crm_activities", ["status"])
    op.create_index("ix_crm_activities_what_type", "crm_activities", ["what_type"])
    op.create_index("ix_crm_activities_what_id", "crm_activities", ["what_id"])
    op.create_index("ix_crm_activities_who_type", "crm_activities", ["who_type"])
    op.create_index("ix_crm_activities_who_id", "crm_activities", ["who_id"])
    op.create_index("ix_crm_activities_due_date", "crm_activities", ["due_date"])
    op.create_index("ix_crm_activities_completed_at", "crm_activities", ["completed_at"])
    op.create_index("ix_crm_activities_bu_what", "crm_activities", ["business_unit_id", "what_type", "what_id"])
    op.create_index("ix_crm_activities_bu_who", "crm_activities", ["business_unit_id", "who_type", "who_id"])
    op.create_index("ix_crm_activities_bu_status", "crm_activities", ["business_unit_id", "status"])

    _enable_rls("crm_activities")


def downgrade() -> None:
    op.drop_index("ix_crm_activities_bu_status", table_name="crm_activities")
    op.drop_index("ix_crm_activities_bu_who", table_name="crm_activities")
    op.drop_index("ix_crm_activities_bu_what", table_name="crm_activities")
    op.drop_index("ix_crm_activities_completed_at", table_name="crm_activities")
    op.drop_index("ix_crm_activities_due_date", table_name="crm_activities")
    op.drop_index("ix_crm_activities_who_id", table_name="crm_activities")
    op.drop_index("ix_crm_activities_who_type", table_name="crm_activities")
    op.drop_index("ix_crm_activities_what_id", table_name="crm_activities")
    op.drop_index("ix_crm_activities_what_type", table_name="crm_activities")
    op.drop_index("ix_crm_activities_status", table_name="crm_activities")
    op.drop_index("ix_crm_activities_owner_id", table_name="crm_activities")
    op.drop_index("ix_crm_activities_business_unit_id", table_name="crm_activities")
    op.drop_table("crm_activities")
