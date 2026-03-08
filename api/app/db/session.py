# crm/api/app/db/session.py
from __future__ import annotations

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.core.config import settings

engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
    expire_on_commit=False,  # evita refresh pós-commit “à toa”
)

def get_db():
    """FastAPI dependency that yields a DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        # evita que o tenant fique “grudado” na conexão do pool
        try:
            db.execute(text("SELECT set_config('app.tenant_id', '', false)"))
        except Exception:
            pass
        db.close()