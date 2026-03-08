"""Add crm_products and crm_product_price_lists tables

Revision ID: gg99hh00ii11
Revises: ff77gg88hh99
Create Date: 2026-02-27
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "gg99hh00ii11"
down_revision = "ff77gg88hh99"
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
        "crm_products",
        sa.Column("id", sa.String(length=18), primary_key=True),
        sa.Column(
            "business_unit_id",
            sa.String(length=18),
            sa.ForeignKey("business_units.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("product_code", sa.String(length=60), nullable=False, server_default=""),
        sa.Column("description", sa.String(length=2000), nullable=False, server_default=""),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("business_unit_id", "name", name="uq_crm_products_bu_name"),
    )
    op.create_index("ix_crm_products_business_unit_id", "crm_products", ["business_unit_id"])
    op.create_index("ix_crm_products_is_active", "crm_products", ["is_active"])
    _enable_rls("crm_products")

    op.create_table(
        "crm_product_price_lists",
        sa.Column("id", sa.String(length=18), primary_key=True),
        sa.Column(
            "business_unit_id",
            sa.String(length=18),
            sa.ForeignKey("business_units.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "product_id",
            sa.String(length=18),
            sa.ForeignKey("crm_products.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("unit_price", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="BRL"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint(
            "business_unit_id",
            "product_id",
            "name",
            name="uq_crm_product_price_lists_bu_product_name",
        ),
    )
    op.create_index("ix_crm_product_price_lists_business_unit_id", "crm_product_price_lists", ["business_unit_id"])
    op.create_index("ix_crm_product_price_lists_product_id", "crm_product_price_lists", ["product_id"])
    op.create_index("ix_crm_product_price_lists_is_active", "crm_product_price_lists", ["is_active"])
    _enable_rls("crm_product_price_lists")


def downgrade() -> None:
    op.drop_index("ix_crm_product_price_lists_is_active", table_name="crm_product_price_lists")
    op.drop_index("ix_crm_product_price_lists_product_id", table_name="crm_product_price_lists")
    op.drop_index("ix_crm_product_price_lists_business_unit_id", table_name="crm_product_price_lists")
    op.drop_table("crm_product_price_lists")

    op.drop_index("ix_crm_products_is_active", table_name="crm_products")
    op.drop_index("ix_crm_products_business_unit_id", table_name="crm_products")
    op.drop_table("crm_products")
