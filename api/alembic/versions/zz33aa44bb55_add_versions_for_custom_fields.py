"""Add optimistic-lock versions for custom field sessions/definitions.

Revision ID: zz33aa44bb55
Revises: yy11zz22aa33
Create Date: 2026-02-27
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "zz33aa44bb55"
down_revision = "yy11zz22aa33"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "crm_custom_field_sessions",
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column(
        "crm_custom_field_definitions",
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
    )

    op.alter_column("crm_custom_field_sessions", "version", server_default=None)
    op.alter_column("crm_custom_field_definitions", "version", server_default=None)


def downgrade() -> None:
    op.drop_column("crm_custom_field_definitions", "version")
    op.drop_column("crm_custom_field_sessions", "version")
