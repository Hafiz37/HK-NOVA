"""Database authentication and reusable role permissions for HK-NOVA."""
import base64
import binascii
import hashlib
import hmac
import secrets
import time
from collections.abc import Callable
from urllib.parse import quote

import bcrypt
from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.database import get_db
from app.models.user import User, UserRole

_COOKIE_NAME = "vibenet_session"
_SESSION_TTL = 14 * 24 * 3600


def _sign(payload: str) -> str:
    return hmac.new(get_settings().SECRET_KEY.encode(), payload.encode(), hashlib.sha256).hexdigest()


def generate_session_token(user_id: int) -> str:
    payload = f"{int(time.time()) + _SESSION_TTL}:{user_id}:{secrets.token_hex(16)}"
    return f"{payload}:{_sign(payload)}"


def verify_session_token(token: str) -> int | None:
    """Return the signed user ID, rejecting legacy, tampered and expired tokens."""
    try:
        expiry, user_id, nonce, signature = token.split(":")
        payload = f"{expiry}:{user_id}:{nonce}"
        if not hmac.compare_digest(signature, _sign(payload)):
            return None
        if int(expiry) <= int(time.time()) or int(user_id) <= 0:
            return None
        return int(user_id)
    except (ValueError, TypeError):
        return None


def hash_password(plain: str) -> str:
    encoded = plain.encode("utf-8")
    if not encoded or len(encoded) > 72:
        raise ValueError("Password must contain 1–72 UTF-8 bytes")
    return bcrypt.hashpw(encoded, bcrypt.gensalt()).decode("ascii")


def verify_password(plain: str, hashed: str) -> bool:
    encoded = plain.encode("utf-8")
    if not encoded or len(encoded) > 72:
        return False
    try:
        return bcrypt.checkpw(encoded, hashed.encode("ascii"))
    except (ValueError, UnicodeError):
        return False


# Equalize password checking work for unknown usernames.
_DUMMY_HASH = bcrypt.hashpw(b"unknown-user", bcrypt.gensalt()).decode("ascii")


def authenticate_user(db: Session, username: str, password: str) -> User | None:
    user = db.scalar(select(User).where(User.username == username))
    valid = verify_password(password, user.password_hash if user else _DUMMY_HASH)
    return user if valid and user and user.is_active else None


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """Resolve a live user on each request; roles are never trusted from cookies."""
    cached = getattr(request.state, "user", None)
    if cached is not None:
        return cached
    user = None
    token = request.cookies.get(_COOKIE_NAME)
    user_id = verify_session_token(token) if token else None
    if user_id is not None:
        user = db.get(User, user_id)
        if user is not None and not user.is_active:
            user = None
    if user is None:
        header = request.headers.get("Authorization", "")
        if header.lower().startswith("basic "):
            try:
                username, password = base64.b64decode(header[6:], validate=True).decode("utf-8").split(":", 1)
            except (ValueError, UnicodeError, binascii.Error):
                pass
            else:
                user = authenticate_user(db, username, password)
    if user is None:
        if request.url.path.startswith("/api/"):
            raise HTTPException(401, "Authentication required", headers={"WWW-Authenticate": "Basic"})
        target = request.url.path + (f"?{request.url.query}" if request.url.query else "")
        raise HTTPException(302, headers={"Location": f"/login?next={quote(target, safe='')}"})
    request.state.user = user
    return user


def require_auth(request: Request, db: Session = Depends(get_db)) -> User | None:
    if request.url.path in ("/health", "/login"):
        return None
    return get_current_user(request, db)


def require_role(*allowed_roles: UserRole) -> Callable[..., User]:
    def check_role(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise HTTPException(403, "Access denied. Required role: " + ", ".join(role.value for role in allowed_roles))
        return current_user
    return check_role


require_admin = require_role(UserRole.admin)
require_operator_or_admin = require_role(UserRole.admin, UserRole.operator)


def can_edit(user: User) -> bool:
    return user.role in (UserRole.admin, UserRole.operator)


def can_delete(user: User) -> bool:
    return can_edit(user)


def can_trigger_backup(user: User) -> bool:
    return can_edit(user)


def can_delete_destination(user: User) -> bool:
    return user.role == UserRole.admin
