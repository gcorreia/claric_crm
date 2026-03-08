"""Add folder to crm_dashboard_definitions

Revision ID: ss11tt22uu33
Revises: rr00ss11tt22
Create Date: 2026-03-02
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "ss11tt22uu33"
down_revision = "rr00ss11tt22"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "crm_dashboard_definitions",
        sa.Column("folder", sa.String(length=20), nullable=False, server_default="private"),
    )
    op.create_index("ix_crm_dashboard_definitions_folder", "crm_dashboard_definitions", ["folder"])
    op.create_index(
        "ix_crm_dashboard_definitions_bu_folder",
        "crm_dashboard_definitions",
        ["business_unit_id", "folder"],
    )


def downgrade() -> None:
    op.drop_index("ix_crm_dashboard_definitions_bu_folder", table_name="crm_dashboard_definitions")
    op.drop_index("ix_crm_dashboard_definitions_folder", table_name="crm_dashboard_definitions")
    op.drop_column("crm_dashboard_definitions", "folder")
