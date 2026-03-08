"""crm accounts + typed EAV custom fields

Revision ID: ff66gg77hh88
Revises: ee55ff66gg77
Create Date: 2026-02-18
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "ff66gg77hh88"
down_revision = "ee55ff66gg77"
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
        "crm_accounts",
        sa.Column("id", sa.String(length=18), primary_key=True),
        sa.Column(
            "business_unit_id",
            sa.String(length=18),
            sa.ForeignKey("business_units.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("document", sa.String(length=32), nullable=False, server_default=""),
        sa.Column("website", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("industry", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("notes", sa.String(length=2000), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    )
    op.create_index("ix_crm_accounts_business_unit_id", "crm_accounts", ["business_unit_id"])

    op.create_table(
        "crm_custom_field_definitions",
        sa.Column("id", sa.String(length=18), primary_key=True),
        sa.Column(
            "business_unit_id",
            sa.String(length=18),
            sa.ForeignKey("business_units.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("entity_type", sa.String(length=50), nullable=False),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("label", sa.String(length=120), nullable=False),
        sa.Column("type", sa.String(length=30), nullable=False),
        sa.Column("required", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("options", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("validations", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("default_value", postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint("business_unit_id", "entity_type", "key", name="uq_cfdef_bu_entity_key"),
    )
    op.create_index("ix_cfdef_bu", "crm_custom_field_definitions", ["business_unit_id"])
    op.create_index("ix_cfdef_entity", "crm_custom_field_definitions", ["entity_type"])

    op.create_table(
        "crm_custom_field_values",
        sa.Column("id", sa.String(length=18), primary_key=True),
        sa.Column(
            "business_unit_id",
            sa.String(length=18),
            sa.ForeignKey("business_units.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("entity_type", sa.String(length=50), nullable=False),
        sa.Column("entity_id", sa.String(length=18), nullable=False),
        sa.Column(
            "field_id",
            sa.String(length=18),
            sa.ForeignKey("crm_custom_field_definitions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("value_text", sa.Text(), nullable=True),
        sa.Column("value_number", sa.Numeric(18, 6), nullable=True),
        sa.Column("value_bool", sa.Boolean(), nullable=True),
        sa.Column("value_date", sa.Date(), nullable=True),
        sa.Column("value_ts", sa.DateTime(timezone=True), nullable=True),
        sa.Column("value_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.UniqueConstraint(
            "business_unit_id",
            "entity_type",
            "entity_id",
            "field_id",
            name="uq_cfval_one_value_per_field",
        ),
    )
    op.create_index("ix_cfval_bu", "crm_custom_field_values", ["business_unit_id"])
    op.create_index("ix_cfval_entity", "crm_custom_field_values", ["entity_type"])
    op.create_index("ix_cfval_entity_id", "crm_custom_field_values", ["entity_id"])
    op.create_index("ix_cfval_field", "crm_custom_field_values", ["field_id"])
    op.create_index("ix_cfval_lookup_text", "crm_custom_field_values", ["business_unit_id", "field_id", "value_text"])
    op.create_index("ix_cfval_lookup_number", "crm_custom_field_values", ["business_unit_id", "field_id", "value_number"])
    op.create_index("ix_cfval_lookup_date", "crm_custom_field_values", ["business_unit_id", "field_id", "value_date"])

    _enable_rls("crm_accounts")
    _enable_rls("crm_custom_field_definitions")
    _enable_rls("crm_custom_field_values")


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS crm_custom_field_values_tenant_isolation ON crm_custom_field_values;")
    op.execute("DROP POLICY IF EXISTS crm_custom_field_definitions_tenant_isolation ON crm_custom_field_definitions;")
    op.execute("DROP POLICY IF EXISTS crm_accounts_tenant_isolation ON crm_accounts;")

    op.drop_table("crm_custom_field_values")
    op.drop_table("crm_custom_field_definitions")
    op.drop_table("crm_accounts")
