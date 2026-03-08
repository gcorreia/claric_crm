"""Add crm_price_lists and crm_price_list_items tables

Revision ID: hh00ii11jj22
Revises: gg99hh00ii11
Create Date: 2026-02-28
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "hh00ii11jj22"
down_revision = "gg99hh00ii11"
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
        "crm_price_lists",
        sa.Column("id", sa.String(length=18), primary_key=True),
        sa.Column(
            "business_unit_id",
            sa.String(length=18),
            sa.ForeignKey("business_units.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("business_unit_id", "name", name="uq_crm_price_lists_bu_name"),
    )
    op.create_index("ix_crm_price_lists_business_unit_id", "crm_price_lists", ["business_unit_id"])
    op.create_index("ix_crm_price_lists_is_active", "crm_price_lists", ["is_active"])

    op.create_table(
        "crm_price_list_items",
        sa.Column("id", sa.String(length=18), primary_key=True),
        sa.Column(
            "business_unit_id",
            sa.String(length=18),
            sa.ForeignKey("business_units.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "price_list_id",
            sa.String(length=18),
            sa.ForeignKey("crm_price_lists.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "product_id",
            sa.String(length=18),
            sa.ForeignKey("crm_products.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("unit_price", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(length=3), nullable=False, server_default="BRL"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("business_unit_id", "price_list_id", "product_id", name="uq_crm_price_list_items_bu_list_product"),
    )
    op.create_index("ix_crm_price_list_items_business_unit_id", "crm_price_list_items", ["business_unit_id"])
    op.create_index("ix_crm_price_list_items_price_list_id", "crm_price_list_items", ["price_list_id"])
    op.create_index("ix_crm_price_list_items_product_id", "crm_price_list_items", ["product_id"])

    # Backfill from legacy structure: one row per (product + list-name).
    op.execute(
        """
        INSERT INTO crm_price_lists (id, business_unit_id, name, is_active)
        SELECT
          'PLS' || substr(md5(src.business_unit_id || ':' || lower(src.name)), 1, 15),
          src.business_unit_id,
          src.name,
          bool_or(src.is_active)
        FROM crm_product_price_lists src
        GROUP BY src.business_unit_id, src.name
        ON CONFLICT (business_unit_id, name) DO NOTHING
        """
    )
    op.execute(
        """
        INSERT INTO crm_price_list_items (id, business_unit_id, price_list_id, product_id, unit_price, currency)
        SELECT
          'PLI' || substr(md5(src.business_unit_id || ':' || lower(src.name) || ':' || src.product_id), 1, 15),
          src.business_unit_id,
          'PLS' || substr(md5(src.business_unit_id || ':' || lower(src.name)), 1, 15),
          src.product_id,
          src.unit_price,
          src.currency
        FROM crm_product_price_lists src
        ON CONFLICT (business_unit_id, price_list_id, product_id)
        DO UPDATE SET
          unit_price = EXCLUDED.unit_price,
          currency = EXCLUDED.currency,
          updated_at = now()
        """
    )

    _enable_rls("crm_price_lists")
    _enable_rls("crm_price_list_items")


def downgrade() -> None:
    op.drop_index("ix_crm_price_list_items_product_id", table_name="crm_price_list_items")
    op.drop_index("ix_crm_price_list_items_price_list_id", table_name="crm_price_list_items")
    op.drop_index("ix_crm_price_list_items_business_unit_id", table_name="crm_price_list_items")
    op.drop_table("crm_price_list_items")

    op.drop_index("ix_crm_price_lists_is_active", table_name="crm_price_lists")
    op.drop_index("ix_crm_price_lists_business_unit_id", table_name="crm_price_lists")
    op.drop_table("crm_price_lists")
