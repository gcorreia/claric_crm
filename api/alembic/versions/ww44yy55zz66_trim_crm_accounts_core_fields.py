# crm/api/alembic/versions/ww44yy55zz66_trim_crm_accounts_core_fields.py

"""Trim crm_accounts core fields and add owner_id/owner_name.

Revision ID: ww44yy55zz66
Revises: vv33xx44yy55
Create Date: 2026-02-25
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "ww44yy55zz66"
down_revision = "vv33xx44yy55"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("crm_accounts") as batch:
        batch.add_column(
            sa.Column(
                "owner_id",
                sa.String(length=18),
                sa.ForeignKey("users.id", ondelete="SET NULL"),
                nullable=True,
            )
        )
        batch.add_column(sa.Column("owner_name", sa.String(length=200), nullable=True, server_default=""))
        batch.create_index("ix_crm_accounts_owner_id", ["owner_id"])

        batch.drop_column("document")
        batch.drop_column("website")
        batch.drop_column("industry")
        batch.drop_column("notes")


def downgrade() -> None:
    with op.batch_alter_table("crm_accounts") as batch:
        batch.add_column(sa.Column("document", sa.String(length=32), nullable=False, server_default=""))
        batch.add_column(sa.Column("website", sa.String(length=255), nullable=False, server_default=""))
        batch.add_column(sa.Column("industry", sa.String(length=120), nullable=False, server_default=""))
        batch.add_column(sa.Column("notes", sa.String(length=2000), nullable=False, server_default=""))

        batch.drop_index("ix_crm_accounts_owner_id")
        batch.drop_column("owner_name")
        batch.drop_column("owner_id")