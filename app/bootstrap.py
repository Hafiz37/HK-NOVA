"""Idempotent provisioning of the initial administrator."""
import logging

from sqlalchemy import exists, select
from sqlalchemy.exc import IntegrityError

from app.config import get_settings
from app.database import SessionLocal
from app.models.user import User, UserRole
from app.security import hash_password

logger = logging.getLogger("hk-nova")


def ensure_default_admin() -> None:
    """Seed only an empty users table; never overwrite an existing account."""
    with SessionLocal() as db:
        if db.scalar(select(exists().where(User.id.is_not(None)))):
            return
        settings = get_settings()
        if not settings.AUTH_USERNAME or len(settings.AUTH_USERNAME) > 50:
            raise ValueError("AUTH_USERNAME must contain 1–50 characters")
        db.add(User(
            username=settings.AUTH_USERNAME,
            password_hash=hash_password(settings.AUTH_PASSWORD),
            role=UserRole.admin,
            is_active=True,
        ))
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            # Concurrent workers may have inserted the same bootstrap account.
            if not db.scalar(select(User.id).where(User.username == settings.AUTH_USERNAME)):
                raise
            return
        logger.info("Created initial administrator from AUTH_USERNAME configuration")
