"""Add crm_quote_items table

Revision ID: ll44mm55nn66
Revises: kk33ll44mm55
Create Date: 2026-03-01
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "ll44mm55nn66"
down_revision = "kk33ll44mm55"
branch_labels = None
depends_on = None


def _enable_rls(table: str) -> None:
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY;")
    op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY;")
    op.execute(
        f"""
        CREATE POLICY {table}_tenant_isolation
        ON {table}
        USING (business_unit_id = current_setting('app.tenant_id', true));
        """
    )


def upgrade() -> None:
    op.create_table(
        "crm_quote_items",
        sa.Column("id", sa.String(length=18), primary_key=True),
        sa.Column(
            "business_unit_id",
            sa.String(length=18),
            sa.ForeignKey("business_units.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "quote_id",
            sa.String(length=18),
            sa.ForeignKey("crm_quotes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "product_id",
            sa.String(length=18),
            sa.ForeignKey("crm_products.id", ondelete="RESTRICT"),
            nullable=True,
        ),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("quantity", sa.Numeric(14, 4), nullable=False, server_default="1"),
        sa.Column("unit_price", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("discount_percent", sa.Numeric(7, 4), nullable=False, server_default="0"),
        sa.Column("discount_amount", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("line_total", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_crm_quote_items_business_unit_id", "crm_quote_items", ["business_unit_id"])
    op.create_index("ix_crm_quote_items_quote_id", "crm_quote_items", ["quote_id"])
    op.create_index("ix_crm_quote_items_product_id", "crm_quote_items", ["product_id"])

    _enable_rls("crm_quote_items")


def downgrade() -> None:
    op.drop_index("ix_crm_quote_items_product_id", table_name="crm_quote_items")
    op.drop_index("ix_crm_quote_items_quote_id", table_name="crm_quote_items")
    op.drop_index("ix_crm_quote_items_business_unit_id", table_name="crm_quote_items")
    op.drop_table("crm_quote_items")
