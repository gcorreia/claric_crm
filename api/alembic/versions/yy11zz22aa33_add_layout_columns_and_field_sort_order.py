"""Add layout_columns to sessions and sort_order to field definitions.

Revision ID: yy11zz22aa33
Revises: xx66aa77bb88
Create Date: 2026-02-27
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "yy11zz22aa33"
down_revision = "xx66aa77bb88"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "crm_custom_field_sessions",
        sa.Column("layout_columns", sa.Integer(), nullable=False, server_default="2"),
    )
    op.create_check_constraint(
        "ck_cfs_layout_columns",
        "crm_custom_field_sessions",
        "layout_columns IN (2, 3)",
    )

    op.add_column(
        "crm_custom_field_definitions",
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index("ix_cfdef_session_sort_order", "crm_custom_field_definitions", ["session_id", "sort_order"])


def downgrade() -> None:
    op.drop_index("ix_cfdef_session_sort_order", table_name="crm_custom_field_definitions")
    op.drop_column("crm_custom_field_definitions", "sort_order")

    op.drop_constraint("ck_cfs_layout_columns", "crm_custom_field_sessions", type_="check")
    op.drop_column("crm_custom_field_sessions", "layout_columns")
