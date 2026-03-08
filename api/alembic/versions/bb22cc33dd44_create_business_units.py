from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "bb22cc33dd44"
down_revision = "aa11bb22cc33"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "business_units",
        sa.Column("id", sa.String(length=18), primary_key=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("address", sa.String(length=500), nullable=False, server_default=sa.text("''")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_business_units_name", "business_units", ["name"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_business_units_name", table_name="business_units")
    op.drop_table("business_units")