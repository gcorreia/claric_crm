"""add last_login_at to users

Revision ID: cc33dd44ee55
Revises: bb22cc33dd44
Create Date: 2026-02-17
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "cc33dd44ee55"
down_revision = "bb22cc33dd44"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "last_login_at")