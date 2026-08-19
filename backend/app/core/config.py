"""Application configuration.

Values are read from environment variables / .env. Business-rule thresholds
that the firm may want to tune without a redeploy live in the `app_config`
DB table (see app.models.reference.AppConfig), not here — this module only
holds infrastructure-level settings.
"""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="RMS_", extra="ignore")

    app_name: str = "firm-rms"
    environment: str = "development"

    # DATABASE_URL wins if set (used by docker-compose / prod). Otherwise fall
    # back to a local SQLite file for dev, and tests override this explicitly.
    database_url: str = "sqlite:///./firm_rms_dev.db"

    jwt_secret_key: str = "change-me-in-production-this-is-a-dev-only-secret"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 14

    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_from: str = "rms@firm.local"

    google_oauth_client_id: str | None = None
    google_oauth_client_secret: str | None = None

    # Default rule thresholds — seeded into app_config on first boot; the DB
    # copy is authoritative thereafter.
    default_max_article_ratio: float = 3.0
    default_burnout_weeks: int = 6
    default_bench_days: int = 5
    default_max_cost_ratio: float = 0.60
    default_cooling_off_months: int = 24
    default_max_days_single_client: int = 120
    default_article_secondment_cap: int = 2
    default_article_secondment_months_cap: int = 12


@lru_cache
def get_settings() -> Settings:
    return Settings()
