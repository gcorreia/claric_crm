"""Rework crm_opportunities owner core fields

Revision ID: dd55ee66ff77
Revises: cc44dd55ee66
Create Date: 2026-02-27
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "dd55ee66ff77"
down_revision = "cc44dd55ee66"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("crm_opportunities") as batch:
        batch.add_column(sa.Column("owner_id", sa.String(length=18), nullable=True))
        batch.add_column(sa.Column("owner_name", sa.String(length=200), nullable=True, server_default=""))
        batch.create_index("ix_crm_opportunities_owner_id", ["owner_id"])
        batch.create_foreign_key(
            "fk_crm_opportunities_owner_id_users",
            "users",
            ["owner_id"],
            ["id"],
            ondelete="RESTRICT",
        )

    # Map textual owner to a user by name/email when possible.
    op.execute(
        """
        UPDATE crm_opportunities o
        SET owner_id = u.id
        FROM users u
        WHERE o.owner_id IS NULL
          AND NULLIF(btrim(o.owner), '') IS NOT NULL
          AND (
            lower(btrim(u.name)) = lower(btrim(o.owner))
            OR lower(btrim(u.email)) = lower(btrim(o.owner))
          )
        """
    )

    # Fallback owner: any existing user (best-effort).
    op.execute(
        """
        UPDATE crm_opportunities
        SET owner_id = COALESCE(owner_id, (SELECT id FROM users ORDER BY id LIMIT 1))
        WHERE owner_id IS NULL
        """
    )
    op.execute(
        """
        UPDATE crm_opportunities o
        SET owner_name = COALESCE(NULLIF(o.owner_name, ''), COALESCE(u.name, u.email, ''))
        FROM users u
        WHERE o.owner_id = u.id
        """
    )

    # Keep invariant: owner_id is required.
    op.execute("DELETE FROM crm_opportunities WHERE owner_id IS NULL")

    with op.batch_alter_table("crm_opportunities") as batch:
        batch.alter_column("owner_id", existing_type=sa.String(length=18), nullable=False)
        batch.drop_column("owner")


def downgrade() -> None:
    with op.batch_alter_table("crm_opportunities") as batch:
        batch.add_column(sa.Column("owner", sa.String(length=120), nullable=False, server_default=""))

    op.execute(
        """
        UPDATE crm_opportunities o
        SET owner = COALESCE(NULLIF(o.owner_name, ''), COALESCE(u.name, u.email, ''))
        FROM users u
        WHERE o.owner_id = u.id
        """
    )

    with op.batch_alter_table("crm_opportunities") as batch:
        batch.alter_column("owner_id", existing_type=sa.String(length=18), nullable=True)
        batch.drop_constraint("fk_crm_opportunities_owner_id_users", type_="foreignkey")
        batch.drop_index("ix_crm_opportunities_owner_id")
        batch.drop_column("owner_name")
        batch.drop_column("owner_id")
