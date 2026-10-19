from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="GG_", env_file=".env", extra="ignore")

    database_url: str = "sqlite:///./var/grievancegrid.db"
    jurisdiction_id: str = "demo-municipality"
    jurisdiction_name: str = "Kochi"
    emergency_number: str = "112"
    cors_origins: list[str] = ["http://localhost:3000"]
    session_hours: int = Field(default=8, ge=1, le=24)
    storage_backend: str = "local"
    local_storage_path: Path = Path("var/evidence")
    s3_endpoint_url: str | None = None
    s3_bucket: str = "grievancegrid-evidence"
    s3_region: str = "us-east-1"
    max_image_bytes: int = 8 * 1024 * 1024
    secret_key: str = "dev-secret-key-change-in-production-min-32-chars"
    redis_url: str = "redis://127.0.0.1:6379/0"
    mail_backend: str = "console"
    mailpit_host: str = "127.0.0.1"
    mailpit_port: int = 1025
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    frontend_url: str = "http://localhost:3000"

    # Pass 8: Machine Learning & Suggestions
    ml_enabled: bool = True
    ml_assets_dir: str = "ml_assets"
    photo_check_enabled: bool = True
    duplicate_match_enabled: bool = True
    priority_suggestion_enabled: bool = True
    citizen_photo_hint_enabled: bool = True
    after_photo_check_enabled: bool = True
    incident_scorer: str = "heuristic"  # heuristic (Strategy 2) or logreg (Strategy 3)
    embedding_model: str = "paraphrase-multilingual-MiniLM-L12-v2"
    duplicate_radius_meters: float = 250.0
    duplicate_window_days: int = 30
    duplicate_threshold: float = 0.70

    # Pass 8: Escalations
    escalation_check_minutes: int = 10
    due_soon_hours: int = 24

    # Pass 10: Authenticity, Clustering, Real-Time SSE
    photo_authenticity_enabled: bool = True
    cluster_road_radius_meters: float = 60.0
    cluster_garbage_radius_meters: float = 100.0
    cluster_waterlogging_radius_meters: float = 200.0
    cluster_manhole_radius_meters: float = 30.0
    cluster_window_days: int = 30
    cluster_threshold: float = 0.70
    sse_heartbeat_seconds: int = 15
    max_streams_per_user: int = 5
    senior_alert_popup_enabled: bool = True
    environment: str = "development"
    analysis_state: str = "disabled"


@lru_cache
def get_settings() -> Settings:
    return Settings()
