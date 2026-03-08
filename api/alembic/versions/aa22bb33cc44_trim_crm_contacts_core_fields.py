# crm/api/alembic/versions/aa22bb33cc44_trim_crm_contacts_core_fields.py

"""Trim crm_contacts core fields for B2B puro.

Revision ID: aa22bb33cc44
Revises: zz33aa44bb55
Create Date: 2026-02-27
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "aa22bb33cc44"
down_revision = "zz33aa44bb55"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Why: B2B puro exige conta; elimina registros inválidos antes de tornar NOT NULL.
    op.execute("DELETE FROM crm_contacts WHERE account_id IS NULL;")

    with op.batch_alter_table("crm_contacts") as batch:
        batch.add_column(sa.Column("external_id", sa.String(length=32), nullable=False, server_default=""))
        batch.add_column(sa.Column("contact_role", sa.String(length=60), nullable=False, server_default=""))

        batch.alter_column("account_id", existing_type=sa.String(length=18), nullable=False)

        batch.create_unique_constraint("uq_crm_contacts_bu_external_id", ["business_unit_id", "external_id"])
        batch.create_index("ix_crm_contacts_external_id", ["external_id"])
        batch.create_index("ix_crm_contacts_contact_role", ["contact_role"])

        batch.drop_column("email")
        batch.drop_column("phone")
        batch.drop_column("title")
        batch.drop_column("owner")


def downgrade() -> None:
    with op.batch_alter_table("crm_contacts") as batch:
        batch.add_column(sa.Column("owner", sa.String(length=120), nullable=False, server_default=""))
        batch.add_column(sa.Column("title", sa.String(length=120), nullable=False, server_default=""))
        batch.add_column(sa.Column("phone", sa.String(length=60), nullable=False, server_default=""))
        batch.add_column(sa.Column("email", sa.String(length=255), nullable=False, server_default=""))

        batch.drop_index("ix_crm_contacts_contact_role")
        batch.drop_index("ix_crm_contacts_external_id")
        batch.drop_constraint("uq_crm_contacts_bu_external_id", type_="unique")

        batch.alter_column("account_id", existing_type=sa.String(length=18), nullable=True)

        batch.drop_column("contact_role")
        batch.drop_column("external_id")
