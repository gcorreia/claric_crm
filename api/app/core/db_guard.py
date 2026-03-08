from __future__ import annotations

import time
from dataclasses import dataclass

from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlalchemy.exc import OperationalError


@dataclass(frozen=True)
class DbRoleStatus:
    current_user: str
    is_superuser: bool
    bypass_rls: bool


def _read_db_role_status(engine: Engine) -> DbRoleStatus:
    with engine.connect() as conn:
        row = conn.execute(
            text(
                """
                SELECT
                  current_user,
                  r.rolsuper,
                  r.rolbypassrls
                FROM pg_roles r
                WHERE r.rolname = current_user
                """
            )
        ).one()

    return DbRoleStatus(
        current_user=str(row[0]),
        is_superuser=bool(row[1]),
        bypass_rls=bool(row[2]),
    )


def enforce_safe_db_role(engine: Engine, *, attempts: int = 30, sleep_seconds: float = 0.5) -> None:
    """
    Fail-fast if the runtime DB role is SUPERUSER or BYPASSRLS.
    Retries briefly to avoid crashing during DB warmup.
    """
    last_err: Exception | None = None
    for _ in range(attempts):
        try:
            status = _read_db_role_status(engine)
            if status.is_superuser or status.bypass_rls:
                raise RuntimeError(
                    f"Unsafe DB role detected: user={status.current_user}, "
                    f"superuser={status.is_superuser}, bypassrls={status.bypass_rls}. Refusing to start."
                )
            return
        except OperationalError as e:
            last_err = e
            time.sleep(sleep_seconds)

    raise RuntimeError(f"DB not reachable after {attempts} attempts; last error: {last_err!r}")