"""Audit persistence, secret handling, and business-transaction isolation."""
from copy import deepcopy
from datetime import datetime, timezone
import json
import logging

import pytest
from sqlalchemy import create_engine, event, select, text
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool
from starlette.requests import Request

from app.database import Base
from app.models.audit_log import AuditLog
from app.models.user import User
from app.modules.audit_service import AuditService, REDACTED


@pytest.fixture(params=["file", "memory"])
def audit_factory(request, tmp_path):
    kwargs = {"poolclass": StaticPool} if request.param == "memory" else {}
    url = "sqlite://" if request.param == "memory" else f"sqlite:///{tmp_path / 'audit.db'}"
    engine = create_engine(url, **kwargs)

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    yield sessionmaker(bind=engine)
    engine.dispose()


def test_minimal_system_event(audit_factory):
    before = datetime.now(timezone.utc).replace(tzinfo=None)
    with audit_factory() as db:
        assert AuditService.log(db, "RUN", "schedules") is None
    with audit_factory() as db:
        entry = db.scalars(select(AuditLog)).one()
        assert entry.action == "RUN"
        assert entry.resource_type == "schedules"
        assert entry.username == "system"
        assert entry.status == "success"
        assert before <= entry.timestamp <= datetime.now(timezone.utc).replace(tzinfo=None)
        for field in ("user_id", "resource_id", "resource_name", "old_value", "new_value", "ip_address", "user_agent"):
            assert getattr(entry, field) is None


@pytest.mark.parametrize("status", ["success", "failed", "denied"])
def test_full_event(audit_factory, status):
    agent = "HK-NOVA test / " + "x" * 1000
    request = Request({"type": "http", "headers": [(b"user-agent", agent.encode())],
                       "client": ("2001:db8::1234", 443)})
    with audit_factory() as db:
        actor = User(username="operator", password_hash="not-a-real-hash")
        db.add(actor)
        db.commit()
        actor_id = actor.id
        AuditService.log(db, "UPDATE", "devices", user=actor, resource_id=42,
                         resource_name="Router Jakarta", old_value={"enabled": False},
                         new_value={"enabled": True, "label": "東京"}, request=request, status=status)
    with audit_factory() as db:
        entry = db.scalars(select(AuditLog)).one()
        assert (entry.user_id, entry.username) == (actor_id, "operator")
        assert (entry.resource_id, entry.resource_name) == (42, "Router Jakarta")
        assert json.loads(entry.old_value) == {"enabled": False}
        assert json.loads(entry.new_value) == {"enabled": True, "label": "東京"}
        assert entry.ip_address == "2001:db8::1234"
        assert entry.user_agent == agent
        assert entry.status == status


def test_redaction_is_recursive_and_does_not_mutate_input():
    sensitive_keys = ["password", "password_hash", "password_encrypted", "enable_secret_encrypted",
                      "ssh_private_key", "token", "secret_key", "api_key", "current_password",
                      "new_password", "confirm_password", "sshPrivateKey", "API-Key", "PASSWORD",
                      "refresh_token", "apprise_url_encrypted", "Authorization", "passphrase"]
    data = {"credentials": [{key: "sensitive-material" for key in sensitive_keys}],
            "nested": ({"token": "sensitive-material"},),
            "credential_name": "admin-ssh", "action": "password_updated",
            "key_generated": True, "key_type": "RSA", "empty": None}
    original = deepcopy(data)
    result = AuditService.redact_sensitive_fields(data)
    assert data == original
    assert all(value == REDACTED for value in result["credentials"][0].values())
    assert result["nested"] == [{"token": REDACTED}]
    assert result["action"] == "password_updated"
    assert result["key_generated"] is True
    assert result["key_type"] == "RSA"
    assert result["credential_name"] == "admin-ssh"
    assert result["empty"] is None
    assert "sensitive-material" not in json.dumps(result)
    assert AuditService.redact_sensitive_fields(None) is None


def test_both_change_snapshots_are_redacted(audit_factory):
    with audit_factory() as db:
        AuditService.log(db, "UPDATE", "credentials",
                         old_value={"password": "old-secret"},
                         new_value={"nested": [{"ssh_private_key": "new-secret"}]})
    with audit_factory() as db:
        entry = db.scalars(select(AuditLog)).one()
        assert json.loads(entry.old_value) == {"password": REDACTED}
        assert json.loads(entry.new_value) == {"nested": [{"ssh_private_key": REDACTED}]}


def test_missing_client_headers_and_empty_dict(audit_factory):
    request = Request({"type": "http", "headers": []})
    with audit_factory() as db:
        AuditService.log(db, "LOGIN_FAILED", "auth", request=request, new_value={})
    with audit_factory() as db:
        entry = db.scalars(select(AuditLog)).one()
        assert entry.ip_address is None
        assert entry.user_agent is None
        assert entry.new_value == "{}"


def test_success_does_not_commit_pending_business_changes(audit_factory):
    with audit_factory() as db:
        actor = User(username="pending", password_hash="placeholder")
        db.add(actor)
        AuditService.log(db, "TEST", "destinations")
        assert actor in db.new
        db.rollback()
    with audit_factory() as db:
        assert db.scalars(select(User)).all() == []
        assert len(db.scalars(select(AuditLog)).all()) == 1


def test_database_failure_preserves_pending_business_changes(audit_factory, caplog):
    with audit_factory() as db:
        actor = User(username="pending", password_hash="placeholder")
        db.add(actor)
        # Required NOT NULL action fails in the audit writer's transaction.
        with caplog.at_level(logging.WARNING, logger="hk-nova.audit"):
            AuditService.log(db, None, "users", resource_name="secret-in-error-parameters")
        assert db.is_active
        assert actor in db.new
        db.commit()
    with audit_factory() as db:
        assert db.scalars(select(User)).one().username == "pending"
        assert db.scalars(select(AuditLog)).all() == []
    assert "IntegrityError" in caplog.text
    assert "secret-in-error-parameters" not in caplog.text


def test_flushed_sqlite_transaction_is_not_rolled_back(audit_factory, caplog):
    with audit_factory() as db:
        actor = User(username="already-flushed", password_hash="placeholder")
        db.add(actor)
        db.flush()
        AuditService.log(db, "CREATE", "users", user=actor)
        assert db.is_active
        db.commit()
        # The documented post-commit call now persists normally.
        AuditService.log(db, "CREATE", "users", user=actor)
    with audit_factory() as db:
        assert db.scalars(select(User)).one().username == "already-flushed"
        assert len(db.scalars(select(AuditLog)).all()) == 1
    assert "SQLite business transaction" in caplog.text


def test_serialization_failure_is_contained(audit_factory, caplog):
    with audit_factory() as db:
        AuditService.log(db, "TEST", "devices", new_value={"unsupported": object()})
        db.add(User(username="still-usable", password_hash="placeholder"))
        db.commit()
    assert "TypeError" in caplog.text


def test_historical_username_survives_user_deletion(audit_factory):
    with audit_factory() as db:
        actor = User(username="historical", password_hash="placeholder")
        db.add(actor)
        db.commit()
        actor_id = actor.id
        AuditService.log(db, "LOGIN_SUCCESS", "auth", user=actor)
        # Raw DELETE verifies database ON DELETE SET NULL, not ORM emulation.
        db.execute(text("DELETE FROM users WHERE id = :id"), {"id": actor_id})
        db.commit()
    with audit_factory() as db:
        entry = db.scalars(select(AuditLog)).one()
        assert entry.user_id is None
        assert entry.username == "historical"


def test_connection_bound_session(audit_factory):
    engine = audit_factory.kw["bind"]
    with engine.connect() as connection, Session(bind=connection) as db:
        AuditService.log(db, "TEST", "destinations")
    with audit_factory() as db:
        assert len(db.scalars(select(AuditLog)).all()) == 1


def test_external_connection_transaction_is_preserved(audit_factory):
    engine = audit_factory.kw["bind"]
    with engine.begin() as connection:
        connection.execute(User.__table__.insert().values(username="external", password_hash="placeholder"))
        with Session(bind=connection) as db:
            AuditService.log(db, "TEST", "destinations")
    with audit_factory() as db:
        assert db.scalars(select(User)).one().username == "external"
        assert db.scalars(select(AuditLog)).all() == []
