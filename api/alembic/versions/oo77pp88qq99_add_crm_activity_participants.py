"""Add crm_activity_participants table

Revision ID: oo77pp88qq99
Revises: nn66oo77pp88
Create Date: 2026-03-01
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "oo77pp88qq99"
down_revision = "nn66oo77pp88"
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
        "crm_activity_participants",
        sa.Column("id", sa.String(length=18), primary_key=True),
        sa.Column(
            "business_unit_id",
            sa.String(length=18),
            sa.ForeignKey("business_units.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "activity_id",
            sa.String(length=18),
            sa.ForeignKey("crm_activities.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "contact_id",
            sa.String(length=18),
            sa.ForeignKey("crm_contacts.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("activity_id", "contact_id", name="uq_crm_activity_participants_activity_contact"),
    )
    op.create_index("ix_crm_activity_participants_business_unit_id", "crm_activity_participants", ["business_unit_id"])
    op.create_index("ix_crm_activity_participants_activity_id", "crm_activity_participants", ["activity_id"])
    op.create_index("ix_crm_activity_participants_contact_id", "crm_activity_participants", ["contact_id"])
    op.create_index(
        "ix_crm_activity_participants_bu_activity",
        "crm_activity_participants",
        ["business_unit_id", "activity_id"],
    )
    op.create_index(
        "ix_crm_activity_participants_bu_contact",
        "crm_activity_participants",
        ["business_unit_id", "contact_id"],
    )

    _enable_rls("crm_activity_participants")


def downgrade() -> None:
    op.drop_index("ix_crm_activity_participants_bu_contact", table_name="crm_activity_participants")
    op.drop_index("ix_crm_activity_participants_bu_activity", table_name="crm_activity_participants")
    op.drop_index("ix_crm_activity_participants_contact_id", table_name="crm_activity_participants")
    op.drop_index("ix_crm_activity_participants_activity_id", table_name="crm_activity_participants")
    op.drop_index("ix_crm_activity_participants_business_unit_id", table_name="crm_activity_participants")
    op.drop_table("crm_activity_participants")
