from sqlalchemy import Column, Integer, String, Boolean, DateTime, JSON, Enum as SAEnum
from datetime import datetime, timezone
import enum
import base64
import hashlib

from app.database import Base
from cryptography.fernet import Fernet


class DestinationType(str, enum.Enum):
    local = "local"
    forgejo = "forgejo"
    github = "github"
    gitea = "gitea"
    git = "git"
    smb = "smb"
    telegram = "telegram"


class Destination(Base):
    __tablename__ = "destinations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, unique=True)
    dest_type = Column(SAEnum(DestinationType), nullable=False)
    description = Column(String(500), nullable=True)
    config_json = Column(JSON, nullable=True)
    # config_json examples:
    # local: {"path": "./backups"}
    # forgejo: {"repo_path": "./repos/configs", "remote_url": "...", "branch": "main", "token": "..."}
    # smb: {"server": "...", "share": "...", "username": "...", "password": "...", "base_path": "backups"}
    # telegram: {"bot_token": "encrypted_token", "chat_id": "-100123456789", "compress": false, "max_file_size_mb": 45}
    enabled = Column(Boolean, default=True)
    retention_config = Column(JSON, nullable=True)
    # retention_config: {"daily": 14, "weekly": 6, "monthly": 12}
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    @staticmethod
    def _get_fernet() -> Fernet:
        from app.config import get_settings
        secret = get_settings().SECRET_KEY.encode()
        key = base64.urlsafe_b64encode(hashlib.sha256(secret).digest())
        return Fernet(key)

    def encrypt_token(self, plain: str) -> str:
        return self._get_fernet().encrypt(plain.encode()).decode()

    def decrypt_token(self, encrypted: str) -> str:
        return self._get_fernet().decrypt(encrypted.encode()).decode()
