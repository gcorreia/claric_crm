"""
crm/api/scripts/grant_privileges.py

Aplica GRANTs para a role de runtime (crm_app) em todas as tabelas/sequences existentes,
após migrations terem criado objetos com o role migrator.

Compatível com URLs no formato SQLAlchemy (postgresql+psycopg://) e libpq (postgresql://).
"""

from __future__ import annotations

import os
import sys

import psycopg


def _require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise RuntimeError(f"Missing required env var: {name}")
    return value


def _normalize_pg_dsn(dsn: str) -> str:
    # psycopg/libpq não entende "postgresql+psycopg://"
    return (
        dsn.replace("postgresql+psycopg://", "postgresql://")
        .replace("postgres+psycopg://", "postgresql://")
    )


def main() -> int:
    dsn = _normalize_pg_dsn(_require_env("DATABASE_URL"))

    app_role = os.getenv("APP_DB_ROLE", "crm_app")
    schema = os.getenv("APP_DB_SCHEMA", "public")

    statements = [
        f"GRANT USAGE ON SCHEMA {schema} TO {app_role};",
        f"GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA {schema} TO {app_role};",
        f"GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA {schema} TO {app_role};",
    ]

    with psycopg.connect(dsn) as conn:
        conn.autocommit = True
        with conn.cursor() as cur:
            for sql in statements:
                cur.execute(sql)

    print(f"[grant_privileges] Granted privileges on schema={schema} to role={app_role}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"[grant_privileges] ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)