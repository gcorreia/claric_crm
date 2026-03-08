from __future__ import annotations

import os
import uuid

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.exc import DBAPIError


def _env(name: str) -> str:
    val = os.getenv(name)
    if not val:
        pytest.skip(f"{name} not set")
    return val


@pytest.mark.integration
def test_rls_blocks_cross_tenant_insert() -> None:
    """
    Uses 2 DB URLs:
      - POSTGRES_MIGRATION_URL: admin role (crm_admin) to run alembic (DDL)
      - POSTGRES_APP_URL: runtime role (crm_app) where RLS must apply
    """
    migration_url = _env("POSTGRES_MIGRATION_URL")
    app_url = _env("POSTGRES_APP_URL")

    # Run migrations as admin (never run DDL as crm_app)
    alembic_ini = os.path.join(os.path.dirname(__file__), "..", "alembic.ini")
    cfg = Config(alembic_ini)

    # Alembic config uses ConfigParser interpolation; escape % in URL-encoded passwords.
    cfg.set_main_option("sqlalchemy.url", migration_url.replace("%", "%%"))
    command.upgrade(cfg, "head")

    engine = create_engine(app_url, pool_pre_ping=True)

    bu1 = "BU0000000000000001"
    bu2 = "BU0000000000000002"
    account_id = "AC" + uuid.uuid4().hex[:16]

    with engine.begin() as conn:
        # Ensure business_units exist so FK doesn't mask RLS
        conn.execute(
            text(
                """
                INSERT INTO business_units (id, name, address)
                VALUES (:bu1, 'Tenant 1', ''), (:bu2, 'Tenant 2', '')
                ON CONFLICT (id) DO NOTHING
                """
            ),
            {"bu1": bu1, "bu2": bu2},
        )

        # Tenant context = BU1
        conn.execute(text("SELECT set_config('app.tenant_id', :tid, true)"), {"tid": bu1})

        # Cross-tenant insert BU2 must fail by RLS WITH CHECK
        with pytest.raises(DBAPIError) as exc:
            conn.execute(
                text(
                    """
                    INSERT INTO crm_accounts
                      (id, business_unit_id, name, document, website, industry, notes, created_at, updated_at)
                    VALUES
                      (:id, :bu2, 'X', '', '', '', '', now(), now())
                    """
                ),
                {"id": account_id, "bu2": bu2},
            )

        msg = str(exc.value).lower()
        assert "row-level security" in msg or "rls" in msg, msg