"""Drop notes column from crm_quotes.

Revision ID: mm55nn66oo77
Revises: ll44mm55nn66
Create Date: 2026-03-01
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "mm55nn66oo77"
down_revision = "ll44mm55nn66"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("crm_quotes") as batch:
        batch.drop_column("notes")


def downgrade() -> None:
    with op.batch_alter_table("crm_quotes") as batch:
        batch.add_column(sa.Column("notes", sa.Text(), nullable=False, server_default=""))
