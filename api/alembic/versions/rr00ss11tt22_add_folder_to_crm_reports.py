"""Add folder to crm_report_definitions

Revision ID: rr00ss11tt22
Revises: qq99rr00ss11
Create Date: 2026-03-01
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "rr00ss11tt22"
down_revision = "qq99rr00ss11"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "crm_report_definitions",
        sa.Column("folder", sa.String(length=20), nullable=False, server_default="private"),
    )
    op.create_index("ix_crm_report_definitions_folder", "crm_report_definitions", ["folder"])
    op.create_index(
        "ix_crm_report_definitions_bu_folder",
        "crm_report_definitions",
        ["business_unit_id", "folder"],
    )


def downgrade() -> None:
    op.drop_index("ix_crm_report_definitions_bu_folder", table_name="crm_report_definitions")
    op.drop_index("ix_crm_report_definitions_folder", table_name="crm_report_definitions")
    op.drop_column("crm_report_definitions", "folder")
