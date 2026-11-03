"""Tests for User model, password hashing, and bootstrap RBAC logic."""
import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.models.user import User, UserRole
from app.security import hash_password, verify_password
from app.bootstrap import ensure_default_admin


class TestPasswordHashing:
    """Test bcrypt password hashing and verification."""

    def test_hash_and_verify_success(self):
        plain = "supersecret123"
        hashed = hash_password(plain)
        assert hashed != plain
        assert hashed.startswith("$2b$") or hashed.startswith("$2a$")
        assert verify_password(plain, hashed) is True

    def test_verify_failure_wrong_password(self):
        hashed = hash_password("correct-pass")
        assert verify_password("wrong-pass", hashed) is False

    def test_empty_password_rejected(self):
        with pytest.raises(ValueError, match="1–72 UTF-8 bytes"):
            hash_password("")
        assert verify_password("", "somehash") is False

    def test_overlong_password_rejected(self):
        long_pass = "a" * 73
        with pytest.raises(ValueError, match="1–72 UTF-8 bytes"):
            hash_password(long_pass)
        assert verify_password(long_pass, "somehash") is False

    def test_verify_malformed_hash(self):
        assert verify_password("password", "invalid_hash_string") is False
        assert verify_password("password", "") is False


class TestUserModel:
    """Test User ORM model constraints and defaults."""

    def test_create_user_defaults(self, db_session):
        user = User(
            username="viewer_test",
            password_hash=hash_password("viewpass123"),
            full_name="Viewer User",
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)

        assert user.id is not None
        assert user.username == "viewer_test"
        assert user.role == UserRole.viewer
        assert user.is_active is True
        assert user.created_at is not None

    def test_unique_username_constraint(self, db_session):
        u1 = User(
            username="duplicate_user",
            password_hash=hash_password("pass1"),
            role=UserRole.operator,
        )
        db_session.add(u1)
        db_session.commit()

        u2 = User(
            username="duplicate_user",
            password_hash=hash_password("pass2"),
            role=UserRole.viewer,
        )
        db_session.add(u2)
        with pytest.raises(IntegrityError):
            db_session.commit()
        db_session.rollback()

    def test_roles_assignment(self, db_session):
        admin = User(username="admin_user", password_hash=hash_password("p1"), role=UserRole.admin)
        operator = User(username="op_user", password_hash=hash_password("p2"), role=UserRole.operator)
        viewer = User(username="view_user", password_hash=hash_password("p3"), role=UserRole.viewer)

        db_session.add_all([admin, operator, viewer])
        db_session.commit()

        assert admin.role.value == "admin"
        assert operator.role.value == "operator"
        assert viewer.role.value == "viewer"


class TestBootstrapAdmin:
    """Test initial administrator provisioning."""

    def test_ensure_default_admin_idempotent(self, monkeypatch, db_engine):
        from app.database import SessionLocal
        from app.config import get_settings

        settings = get_settings()

        # Verify running ensure_default_admin seeds user if empty
        ensure_default_admin()

        with SessionLocal() as session:
            admin = session.scalar(select(User).where(User.username == settings.AUTH_USERNAME))
            assert admin is not None
            assert admin.role == UserRole.admin
            assert admin.is_active is True
            assert verify_password(settings.AUTH_PASSWORD, admin.password_hash)

        # Calling it again should not error or duplicate
        ensure_default_admin()
