"""User audit integration for both forms and JSON endpoints."""
import json

import pytest
from sqlalchemy import event, select

from app.models.audit_log import AuditLog
from app.models.user import User
from app.security import verify_password


def user_logs(factory):
    with factory() as db:
        return list(db.scalars(select(AuditLog).where(AuditLog.resource_type == "users").order_by(AuditLog.id)))


@pytest.mark.parametrize("interface", ["api", "form"])
def test_crud_audit(web_client, web_db, interface):
    web_client.auth = ("admin", "test-password-123")
    web_client.headers["User-Agent"] = "user-management-test"
    values = dict(username="new-user", password="create-secret-123", role="viewer", is_active=True)
    if interface == "api":
        response = web_client.post("/api/users", json=values)
        assert response.status_code == 201
    else:
        response = web_client.post("/users/add", data=values)
        assert response.status_code == 303
    with web_db() as db:
        target = db.scalar(select(User).where(User.username == "new-user"))
        target_id = target.id
        password_hash = target.password_hash
        actor_id = db.scalar(select(User.id).where(User.username == "admin"))
    create, = user_logs(web_db)
    assert create.action == "CREATE"
    assert create.old_value is None
    assert json.loads(create.new_value) == {"username": "new-user", "role": "viewer", "is_active": True}

    changes = {"role": "operator", "is_active": False}
    if interface == "api":
        response = web_client.put(f"/api/users/{target_id}", json=changes)
        assert response.status_code == 200
    else:
        response = web_client.post(f"/users/{target_id}/edit", data=changes)
        assert response.status_code == 303
    update = user_logs(web_db)[-1]
    assert update.action == "UPDATE"
    assert json.loads(update.old_value) == {"role": "viewer", "is_active": True}
    assert json.loads(update.new_value) == changes

    if interface == "api":
        response = web_client.delete(f"/api/users/{target_id}")
        assert response.status_code == 204
    else:
        response = web_client.post(f"/users/{target_id}/delete")
        assert response.status_code == 303
    entries = user_logs(web_db)
    assert [entry.action for entry in entries] == ["CREATE", "UPDATE", "DELETE"]
    assert entries[-1].old_value is None and entries[-1].new_value is None
    for entry in entries:
        assert entry.user_id == actor_id
        assert entry.username == "admin"
        assert entry.resource_id == target_id
        assert entry.resource_name == "new-user"
        assert entry.status == "success"
        assert entry.ip_address == "testclient"
        assert entry.user_agent == "user-management-test"
        serialized = str({column.name: getattr(entry, column.name) for column in AuditLog.__table__.columns})
        assert "create-secret-123" not in serialized
        assert password_hash not in serialized
    with web_db() as db:
        assert db.get(User, target_id) is None


def test_partial_update_tracks_unchanged_status(web_client, web_db):
    web_client.auth = ("admin", "test-password-123")
    with web_db() as db:
        target_id = db.scalar(select(User.id).where(User.username == "viewer"))
    response = web_client.put(f"/api/users/{target_id}", json={"role": "operator"})
    assert response.status_code == 200
    entry, = user_logs(web_db)
    assert json.loads(entry.old_value) == {"role": "viewer", "is_active": True}
    assert json.loads(entry.new_value) == {"role": "operator", "is_active": True}


def test_password_change_excludes_passwords_and_hashes(web_client, web_db):
    web_client.auth = ("viewer", "test-password-123")
    with web_db() as db:
        actor = db.scalar(select(User).where(User.username == "viewer"))
        actor_id, old_hash = actor.id, actor.password_hash
    response = web_client.post("/profile/password", data={
        "current_password": "test-password-123", "new_password": "replacement-secret-123",
        "confirm_password": "replacement-secret-123",
    }, headers={"User-Agent": "password-change-test"})
    assert response.status_code == 200
    with web_db() as db:
        new_hash = db.get(User, actor_id).password_hash
        assert verify_password("replacement-secret-123", new_hash)
    entry, = user_logs(web_db)
    assert entry.action == "PASSWORD_CHANGE"
    assert entry.user_id == entry.resource_id == actor_id
    assert entry.username == entry.resource_name == "viewer"
    assert entry.status == "success"
    assert entry.ip_address == "testclient"
    assert entry.user_agent == "password-change-test"
    assert entry.old_value is None and entry.new_value is None
    serialized = str({column.name: getattr(entry, column.name) for column in AuditLog.__table__.columns})
    for secret in ("test-password-123", "replacement-secret-123", old_hash, new_hash):
        assert secret not in serialized


@pytest.mark.parametrize("current,new,confirm", [
    ("incorrect-current", "replacement-secret-123", "replacement-secret-123"),
    ("test-password-123", "replacement-secret-123", "does-not-match"),
    ("test-password-123", "short", "short"),
])
def test_rejected_password_change_does_not_log_success(web_client, web_db, current, new, confirm):
    web_client.auth = ("viewer", "test-password-123")
    response = web_client.post("/profile/password", data={
        "current_password": current, "new_password": new, "confirm_password": confirm,
    })
    assert response.status_code == 400
    assert user_logs(web_db) == []
    with web_db() as db:
        actor = db.scalar(select(User).where(User.username == "viewer"))
        assert verify_password("test-password-123", actor.password_hash)


def test_rejected_crud_does_not_log_success(web_client, web_db):
    web_client.auth = ("admin", "test-password-123")
    with web_db() as db:
        actor_id = db.scalar(select(User.id).where(User.username == "admin"))
    assert web_client.post("/api/users", json={"username": "admin", "password": "duplicate-secret"}).status_code == 400
    assert web_client.put(f"/api/users/{actor_id}", json={"role": "viewer"}).status_code == 400
    assert web_client.delete(f"/api/users/{actor_id}").status_code == 400
    web_client.auth = ("viewer", "test-password-123")
    assert web_client.post("/api/users", json={"username": "forbidden", "password": "forbidden-secret"}).status_code == 403
    assert user_logs(web_db) == []


def test_audit_database_failure_keeps_user_changes(web_client, web_db):
    web_client.auth = ("admin", "test-password-123")
    engine = web_db.kw["bind"]

    def fail_audit(connection, cursor, statement, parameters, context, executemany):
        if statement.startswith("INSERT INTO audit_logs"):
            raise RuntimeError("audit unavailable")

    event.listen(engine, "before_cursor_execute", fail_audit)
    try:
        response = web_client.post("/api/users", json={"username": "surviving-user", "password": "initial-secret-123"})
        assert response.status_code == 201
        target_id = response.json()["id"]
        assert web_client.put(f"/api/users/{target_id}", json={"role": "operator"}).status_code == 200
        with web_db() as db:
            assert db.get(User, target_id).role.value == "operator"
        web_client.auth = ("surviving-user", "initial-secret-123")
        assert web_client.post("/profile/password", data={
            "current_password": "initial-secret-123", "new_password": "replacement-secret-123",
            "confirm_password": "replacement-secret-123",
        }).status_code == 200
        with web_db() as db:
            assert verify_password("replacement-secret-123", db.get(User, target_id).password_hash)
        web_client.auth = ("admin", "test-password-123")
        assert web_client.delete(f"/api/users/{target_id}").status_code == 204
        with web_db() as db:
            assert db.get(User, target_id) is None
    finally:
        event.remove(engine, "before_cursor_execute", fail_audit)
    assert user_logs(web_db) == []
