"""Add owner to contacts core

Revision ID: bb33cc44dd55
Revises: aa22bb33cc44
Create Date: 2026-02-27 15:14:22

"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "bb33cc44dd55"
down_revision = "aa22bb33cc44"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("crm_contacts", sa.Column("owner_id", sa.String(length=18), nullable=True))
    op.add_column("crm_contacts", sa.Column("owner_name", sa.String(length=200), nullable=True, server_default=""))

    op.create_index(op.f("ix_crm_contacts_owner_id"), "crm_contacts", ["owner_id"], unique=False)
    op.create_foreign_key(
        "fk_crm_contacts_owner_id_users",
        "crm_contacts",
        "users",
        ["owner_id"],
        ["id"],
        ondelete="RESTRICT",
    )

    # Backfill owner_id for existing rows with any existing user (best-effort).
    op.execute(
        """
        UPDATE crm_contacts
        SET owner_id = COALESCE(owner_id, (SELECT id FROM users ORDER BY id LIMIT 1))
        WHERE owner_id IS NULL
        """
    )
    op.execute(
        """
        UPDATE crm_contacts c
        SET owner_name = COALESCE(NULLIF(c.owner_name, ''), COALESCE(u.name, u.email, ''))
        FROM users u
        WHERE c.owner_id = u.id
        """
    )

    op.alter_column("crm_contacts", "owner_id", nullable=False)


def downgrade() -> None:
    op.alter_column("crm_contacts", "owner_id", nullable=True)
    op.drop_constraint("fk_crm_contacts_owner_id_users", "crm_contacts", type_="foreignkey")
    op.drop_index(op.f("ix_crm_contacts_owner_id"), table_name="crm_contacts")
    op.drop_column("crm_contacts", "owner_name")
    op.drop_column("crm_contacts", "owner_id")
