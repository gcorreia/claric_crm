from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import os
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core import redis as redis_mod
from app.db import session as session_mod
from app.models.base import Base
from app.main import app


class FakeRedis:
    """Tiny in-memory subset of redis.asyncio.Redis used by session_store."""

    def __init__(self) -> None:
        self._hashes: dict[str, dict[str, str]] = {}
        self._expires: dict[str, int] = {}

    async def hset(self, key: str, mapping: dict[str, str]) -> int:
        h = self._hashes.setdefault(key, {})
        h.update({k: str(v) for k, v in mapping.items()})
        return 1

    async def hgetall(self, key: str) -> dict[str, str]:
        return dict(self._hashes.get(key, {}))

    async def expire(self, key: str, seconds: int) -> bool:
        self._expires[key] = int(seconds)
        return True

    async def delete(self, key: str) -> int:
        self._hashes.pop(key, None)
        self._expires.pop(key, None)
        return 1

    async def incr(self, key: str) -> int:
        h = self._hashes.setdefault("__counters__", {})
        cur = int(h.get(key, "0"))
        cur += 1
        h[key] = str(cur)
        return cur

    async def ttl(self, key: str) -> int:
        return int(self._expires.get(key, -1))


def _is_integration_run(pytestconfig: pytest.Config) -> bool:
    markexpr = (getattr(pytestconfig.option, "markexpr", "") or "").lower()
    if "integration" in markexpr:
        return True

    # If a Postgres URL is provided, treat it as integration context.
    return bool(
        os.getenv("POSTGRES_APP_URL")
        or os.getenv("POSTGRES_TEST_DATABASE_URL")
        or os.getenv("TEST_DATABASE_URL")
        or os.getenv("DATABASE_URL")
    )


def _postgres_url() -> str | None:
    return (
        os.getenv("POSTGRES_APP_URL")
        or os.getenv("POSTGRES_TEST_DATABASE_URL")
        or os.getenv("TEST_DATABASE_URL")
        or os.getenv("DATABASE_URL")
    )


@pytest.fixture(scope="session")
def _engine(pytestconfig: pytest.Config):
    """
    Unit tests: sqlite in-memory.
    Integration tests: real Postgres (no create_all; migrations handle schema).
    """
    if _is_integration_run(pytestconfig):
        url = _postgres_url()
        if not url:
            pytest.skip("Postgres URL not provided for integration run")
        return create_engine(url, pool_pre_ping=True)

    # Why: in-memory sqlite disappears per connection; keep one engine for session.
    return create_engine("sqlite+pysqlite:///:memory:", connect_args={"check_same_thread": False})


@pytest.fixture(scope="session")
def _SessionLocal(_engine):
    return sessionmaker(autocommit=False, autoflush=False, bind=_engine)


@pytest.fixture(scope="session", autouse=True)
def _create_schema(pytestconfig: pytest.Config, _engine) -> None:
    """
    Never run Base.metadata.create_all() against Postgres:
      - it bypasses Alembic
      - it breaks on PG-specific types (e.g., JSONB) if accidentally using SQLite
    """
    if _engine.dialect.name != "sqlite":
        return
    Base.metadata.create_all(bind=_engine)


@pytest.fixture()
def db(_SessionLocal) -> Iterator[Session]:
    s: Session = _SessionLocal()
    try:
        yield s
        s.commit()
    finally:
        s.close()


@pytest.fixture()
def fake_redis(monkeypatch: pytest.MonkeyPatch) -> FakeRedis:
    r = FakeRedis()

    async def _init() -> FakeRedis:
        return r

    monkeypatch.setattr(redis_mod, "redis", r, raising=False)
    monkeypatch.setattr(redis_mod, "init_redis", _init, raising=True)
    return r


@pytest.fixture()
def client(monkeypatch: pytest.MonkeyPatch, _SessionLocal, fake_redis: FakeRedis) -> Iterator[TestClient]:
    # Override DB dependency.
    def _get_db_override():
        s: Session = _SessionLocal()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[session_mod.get_db] = _get_db_override

    # Patch startup seeding to use our SessionLocal.
    import app.main as main_mod

    monkeypatch.setattr(main_mod, "SessionLocal", _SessionLocal, raising=True)

    with TestClient(app) as c:
        yield c

    app.dependency_overrides.clear()