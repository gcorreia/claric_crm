from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables (.env supported)."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    DATABASE_URL: str = "postgresql+psycopg://postgres:postgres@db:5432/postgres"
    MIGRATION_DATABASE_URL: str | None = None

    REDIS_URL: str = "redis://redis:6379/0"

    SESSION_IDLE_SECONDS: int = 1800
    SESSION_ABSOLUTE_SECONDS: int = 43200

    COOKIE_NAME: str = "sid"
    COOKIE_SECURE: bool = False
    COOKIE_SAMESITE: str = "lax"
    COOKIE_DOMAIN: str | None = None

    LOGIN_RL_WINDOW_SECONDS: int = 300
    LOGIN_RL_MAX_ATTEMPTS: int = 10

    SEED_ADMIN_EMAIL: str = "admin@claric.local"
    SEED_ADMIN_PASSWORD: str = "Nimbus#12345"
    SEED_BU_ADMIN_PASSWORD: str = "Nimbus#12345"


settings = Settings()