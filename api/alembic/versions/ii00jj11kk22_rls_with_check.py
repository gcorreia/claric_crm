"""rls policies with with check

Revision ID: ii00jj11kk22
Revises: gg88hh99ii00
Create Date: 2026-02-20
"""

from __future__ import annotations

from alembic import op

revision = "ii00jj11kk22"
down_revision = "hh99ii00jj11"
branch_labels = None
depends_on = None


TENANT_TABLES = [
    "crm_accounts",
    "crm_contacts",
    "crm_leads",
    "crm_opportunities",
    "crm_custom_field_definitions",
    "crm_custom_field_values",
    "crm_custom_object_definitions",
    "crm_custom_object_records",
]


def _recreate_policy(table: str) -> None:
    policy = f"{table}_tenant_isolation"
    op.execute(
        f"""
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM pg_policies
                WHERE schemaname = current_schema()
                  AND tablename = '{table}'
                  AND policyname = '{policy}'
            ) THEN
                EXECUTE 'DROP POLICY {policy} ON {table}';
            END IF;

            EXECUTE $pol$
                CREATE POLICY {policy}
                ON {table}
                USING (business_unit_id = current_setting('app.tenant_id', true))
                WITH CHECK (business_unit_id = current_setting('app.tenant_id', true));
            $pol$;
        END $$;
        """
    )


def upgrade() -> None:
    for t in TENANT_TABLES:
        _recreate_policy(t)


def downgrade() -> None:
    # Downgrade keeps the stricter policy; if you really need to revert, re-create without WITH CHECK.
    pass
