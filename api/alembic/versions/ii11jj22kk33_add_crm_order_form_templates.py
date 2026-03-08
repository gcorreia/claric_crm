"""Add crm_order_form_templates table

Revision ID: ii11jj22kk33
Revises: hh00ii11jj22
Create Date: 2026-02-28
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op


revision = "ii11jj22kk33"
down_revision = "hh00ii11jj22"
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
        "crm_order_form_templates",
        sa.Column("id", sa.String(length=18), primary_key=True),
        sa.Column(
            "business_unit_id",
            sa.String(length=18),
            sa.ForeignKey("business_units.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("template_name", sa.String(length=120), nullable=False, server_default="Template padrao"),
        sa.Column(
            "file_name_pattern",
            sa.String(length=200),
            nullable=False,
            server_default="order-form-{opportunity_id}",
        ),
        sa.Column("locale", sa.String(length=16), nullable=False, server_default="pt-BR"),
        sa.Column("paper_size", sa.String(length=16), nullable=False, server_default="A4"),
        sa.Column("orientation", sa.String(length=16), nullable=False, server_default="portrait"),
        sa.Column("primary_color", sa.String(length=20), nullable=False, server_default="#166534"),
        sa.Column("include_signature_block", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("header_text", sa.String(length=500), nullable=False, server_default=""),
        sa.Column("footer_text", sa.String(length=500), nullable=False, server_default=""),
        sa.Column("body_template", sa.Text(), nullable=False, server_default=""),
        sa.Column("terms_template", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("business_unit_id", name="uq_crm_order_form_templates_bu"),
    )
    op.create_index("ix_crm_order_form_templates_business_unit_id", "crm_order_form_templates", ["business_unit_id"])

    _enable_rls("crm_order_form_templates")


def downgrade() -> None:
    op.drop_index("ix_crm_order_form_templates_business_unit_id", table_name="crm_order_form_templates")
    op.drop_table("crm_order_form_templates")
