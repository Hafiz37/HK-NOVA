from pydantic_settings import BaseSettings
from pydantic import Field
from functools import lru_cache
import os


class Settings(BaseSettings):
    DATABASE_URL: str = "sqlite:///./hk-nova.db"
    SECRET_KEY: str = "change-me"
    BACKUP_DIR: str = "./backups"
    SSH_KEY_DIR: str = "./ssh_keys"
    OXIDIZED_URL: str = "http://localhost:8888"
    LOG_LEVEL: str = "INFO"
    HOST: str = "0.0.0.0"
    PORT: int = 5005
    BASE_URL: str = Field(default="http://localhost:8000", description="Base URL for notification links")
    
    # Bootstrap credentials: used only when users is empty. Login uses the database.
    AUTH_USERNAME: str = "admin"
    AUTH_PASSWORD: str = "admin"  # CHANGE THIS IN PRODUCTION!
    CORS_ORIGINS: str = "http://localhost:5005,http://127.0.0.1:5005,http://0.0.0.0:5005"

    # Retry Configuration
    BACKUP_RETRY_MAX_ATTEMPTS: int = Field(default=3, description="Maximum retry attempts per destination")
    BACKUP_RETRY_BASE_DELAY: int = Field(default=2, description="Base delay in seconds for exponential backoff")
    BACKUP_RETRY_MAX_DELAY: int = Field(default=60, description="Maximum delay in seconds between retries")

    # Auto-fix
    BACKUP_AUTO_FIX_ENABLED: bool = Field(default=True, description="Enable automatic error fixing")
    BACKUP_AUTO_FIX_TIMEOUT_MULTIPLIER: float = Field(default=2.0, description="Timeout multiplier for auto-fix")

    # Diagnostics
    BACKUP_FAILURE_NOTIFICATION_ENABLED: bool = Field(default=True, description="Send notifications for backup failures")
    BACKUP_FAILURE_NOTIFICATION_THRESHOLD: int = Field(default=1, description="Notify after N consecutive failures")
    DIAGNOSTIC_DASHBOARD_ENABLED: bool = Field(default=True, description="Enable diagnostic dashboard")

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
