"""Rework crm_leads core fields

Revision ID: cc44dd55ee66
Revises: bb33cc44dd55
Create Date: 2026-02-27
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "cc44dd55ee66"
down_revision = "bb33cc44dd55"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("crm_leads") as batch:
        batch.add_column(sa.Column("account_id", sa.String(length=18), nullable=True))
        batch.add_column(sa.Column("email", sa.String(length=120), nullable=False, server_default=""))
        batch.add_column(sa.Column("phone", sa.String(length=60), nullable=False, server_default=""))
        batch.add_column(sa.Column("owner_id", sa.String(length=18), nullable=True))
        batch.add_column(sa.Column("owner_name", sa.String(length=200), nullable=True, server_default=""))

        batch.create_index("ix_crm_leads_account_id", ["account_id"])
        batch.create_index("ix_crm_leads_owner_id", ["owner_id"])

        batch.create_foreign_key(
            "fk_crm_leads_account_id_crm_accounts",
            "crm_accounts",
            ["account_id"],
            ["id"],
            ondelete="RESTRICT",
        )
        batch.create_foreign_key(
            "fk_crm_leads_owner_id_users",
            "users",
            ["owner_id"],
            ["id"],
            ondelete="RESTRICT",
        )

    # Try to map lead.company to account.name within the same BU.
    op.execute(
        """
        UPDATE crm_leads l
        SET account_id = a.id
        FROM crm_accounts a
        WHERE l.account_id IS NULL
          AND l.business_unit_id = a.business_unit_id
          AND NULLIF(btrim(l.company), '') IS NOT NULL
          AND lower(btrim(a.name)) = lower(btrim(l.company))
        """
    )

    # Fallback: first account in each BU.
    op.execute(
        """
        WITH first_accounts AS (
            SELECT business_unit_id, min(id) AS id
            FROM crm_accounts
            GROUP BY business_unit_id
        )
        UPDATE crm_leads l
        SET account_id = fa.id
        FROM first_accounts fa
        WHERE l.account_id IS NULL
          AND l.business_unit_id = fa.business_unit_id
        """
    )

    # Keep invariant: account_id is required for lead.
    op.execute("DELETE FROM crm_leads WHERE account_id IS NULL")

    # Map textual owner to a user by name/email when possible.
    op.execute(
        """
        UPDATE crm_leads l
        SET owner_id = u.id
        FROM users u
        WHERE l.owner_id IS NULL
          AND NULLIF(btrim(l.owner), '') IS NOT NULL
          AND (
            lower(btrim(u.name)) = lower(btrim(l.owner))
            OR lower(btrim(u.email)) = lower(btrim(l.owner))
          )
        """
    )

    # Fallback owner: any existing user (best-effort).
    op.execute(
        """
        UPDATE crm_leads
        SET owner_id = COALESCE(owner_id, (SELECT id FROM users ORDER BY id LIMIT 1))
        WHERE owner_id IS NULL
        """
    )
    op.execute(
        """
        UPDATE crm_leads l
        SET owner_name = COALESCE(NULLIF(l.owner_name, ''), COALESCE(u.name, u.email, ''))
        FROM users u
        WHERE l.owner_id = u.id
        """
    )

    # Keep invariant: owner_id is required.
    op.execute("DELETE FROM crm_leads WHERE owner_id IS NULL")

    # Normalize score to integer.
    op.execute(
        """
        UPDATE crm_leads
        SET score = '0'
        WHERE score IS NULL
           OR btrim(score) = ''
           OR score !~ '^-?[0-9]+$'
        """
    )
    op.execute("ALTER TABLE crm_leads ALTER COLUMN score DROP DEFAULT")
    op.execute("ALTER TABLE crm_leads ALTER COLUMN score TYPE INTEGER USING score::integer")
    op.execute("ALTER TABLE crm_leads ALTER COLUMN score SET DEFAULT 0")
    op.execute("ALTER TABLE crm_leads ALTER COLUMN score SET NOT NULL")

    with op.batch_alter_table("crm_leads") as batch:
        batch.alter_column("account_id", existing_type=sa.String(length=18), nullable=False)
        batch.alter_column("owner_id", existing_type=sa.String(length=18), nullable=False)
        batch.drop_column("company")
        batch.drop_column("owner")


def downgrade() -> None:
    with op.batch_alter_table("crm_leads") as batch:
        batch.add_column(sa.Column("company", sa.String(length=200), nullable=False, server_default=""))
        batch.add_column(sa.Column("owner", sa.String(length=120), nullable=False, server_default=""))

    op.execute(
        """
        UPDATE crm_leads l
        SET company = COALESCE(a.name, '')
        FROM crm_accounts a
        WHERE l.account_id = a.id
        """
    )
    op.execute(
        """
        UPDATE crm_leads l
        SET owner = COALESCE(NULLIF(l.owner_name, ''), COALESCE(u.name, u.email, ''))
        FROM users u
        WHERE l.owner_id = u.id
        """
    )

    op.execute("ALTER TABLE crm_leads ALTER COLUMN score TYPE VARCHAR(20) USING score::varchar")
    op.execute("ALTER TABLE crm_leads ALTER COLUMN score SET DEFAULT ''")

    with op.batch_alter_table("crm_leads") as batch:
        batch.drop_constraint("fk_crm_leads_owner_id_users", type_="foreignkey")
        batch.drop_constraint("fk_crm_leads_account_id_crm_accounts", type_="foreignkey")
        batch.drop_index("ix_crm_leads_owner_id")
        batch.drop_index("ix_crm_leads_account_id")

        batch.drop_column("owner_name")
        batch.drop_column("owner_id")
        batch.drop_column("phone")
        batch.drop_column("email")
        batch.drop_column("account_id")
