"""Authentication audit integration using an isolated request database."""
from html.parser import HTMLParser

import pytest
from sqlalchemy import event, select
from starlette.responses import RedirectResponse

from app.models.audit_log import AuditLog
from app.models.user import User
from app.security import _COOKIE_NAME, verify_session_token


def logs(factory):
    with factory() as db:
        return list(db.scalars(select(AuditLog).order_by(AuditLog.id)))


@pytest.mark.parametrize("username", ["admin", "operator", "viewer"])
def test_login_success_context(web_client, web_db, username):
    agent = "HK-NOVA audit integration / browser"
    response = web_client.post("/login", data={
        "username": username, "password": "test-password-123", "next": "/profile",
    }, headers={"User-Agent": agent, "X-Forwarded-For": "203.0.113.99"})
    assert response.status_code == 303
    assert response.headers["location"] == "/profile"
    entry, = logs(web_db)
    with web_db() as db:
        user = db.scalar(select(User).where(User.username == username))
        assert entry.user_id == user.id
    assert entry.username == username
    assert entry.action == "LOGIN_SUCCESS"
    assert entry.resource_type == "auth"
    assert entry.status == "success"
    assert entry.timestamp is not None
    assert entry.ip_address == "testclient"  # Socket peer, not untrusted proxy header.
    assert entry.user_agent == agent
    assert entry.old_value is None and entry.new_value is None
    assert verify_session_token(web_client.cookies[_COOKIE_NAME]) == entry.user_id


@pytest.mark.parametrize("username,password", [
    ("unknown-user", "attempted-secret"),
    ("admin", "attempted-secret"),
    ("inactive", "test-password-123"),
])
def test_failed_login_records_attempt_not_password(web_client, web_db, username, password):
    response = web_client.post("/login", data={"username": username, "password": password},
                               headers={"User-Agent": "failed-login-agent"})
    assert response.status_code == 401
    assert _COOKIE_NAME not in web_client.cookies
    entry, = logs(web_db)
    assert entry.action == "LOGIN_FAILED"
    assert entry.resource_type == "auth"
    assert entry.resource_name == username
    assert entry.user_id is None
    assert entry.username == "system"
    assert entry.status == "failed"
    assert entry.ip_address == "testclient"
    assert entry.user_agent == "failed-login-agent"
    assert entry.old_value is None and entry.new_value is None
    assert password not in response.text
    assert password not in str({column.name: getattr(entry, column.name) for column in AuditLog.__table__.columns})


@pytest.mark.parametrize("method", ["post", "get"])
def test_logout_persists_before_cookie_deletion(web_client, web_db, monkeypatch, method):
    web_client.post("/login", data={"username": "viewer", "password": "test-password-123"})
    actor_id = verify_session_token(web_client.cookies[_COOKIE_NAME])
    original = RedirectResponse.delete_cookie
    deleted = []

    def checked_delete(response, key, *args, **kwargs):
        # Inspect persisted state at the exact point the handler clears the cookie.
        entry = logs(web_db)[-1]
        assert entry.action == "LOGOUT"
        assert entry.resource_type == "auth"
        assert entry.user_id == actor_id
        assert entry.username == "viewer"
        assert entry.status == "success"
        assert entry.ip_address == "testclient"
        assert entry.user_agent == "logout-agent"
        deleted.append(key)
        return original(response, key, *args, **kwargs)

    monkeypatch.setattr(RedirectResponse, "delete_cookie", checked_delete)
    response = getattr(web_client, method)("/logout", headers={"User-Agent": "logout-agent"})
    assert response.status_code == 303
    assert response.headers["location"] == "/login"
    assert deleted == [_COOKIE_NAME]
    assert "Max-Age=0" in response.headers["set-cookie"]
    assert _COOKIE_NAME not in web_client.cookies
    assert [entry.action for entry in logs(web_db)] == ["LOGIN_SUCCESS", "LOGOUT"]
    assert web_client.get("/profile").status_code == 302


def test_logout_requires_authenticated_user(web_client, web_db):
    response = web_client.post("/logout")
    assert response.status_code == 302
    assert response.headers["location"].startswith("/login")
    assert logs(web_db) == []


def test_audit_storage_failure_does_not_break_login_or_logout(web_client, web_db, caplog):
    engine = web_db.kw["bind"]

    def fail_audit(connection, cursor, statement, parameters, context, executemany):
        if statement.startswith("INSERT INTO audit_logs"):
            raise RuntimeError("sensitive-database-error")

    event.listen(engine, "before_cursor_execute", fail_audit)
    try:
        response = web_client.post("/login", data={"username": "admin", "password": "wrong-password"})
        assert response.status_code == 401
        response = web_client.post("/login", data={"username": "admin", "password": "test-password-123"})
        assert response.status_code == 303
        assert _COOKIE_NAME in web_client.cookies
        response = web_client.post("/logout")
        assert response.status_code == 303
        assert _COOKIE_NAME not in web_client.cookies
    finally:
        event.remove(engine, "before_cursor_execute", fail_audit)
    assert logs(web_db) == []
    assert caplog.text.count("Audit entry could not be recorded") == 3
    assert "sensitive-database-error" not in caplog.text


def test_desktop_and_mobile_navigation_submit_post_logout(web_client):
    web_client.post("/login", data={"username": "viewer", "password": "test-password-123"})
    response = web_client.get("/profile")
    assert response.status_code == 200

    class LogoutForms(HTMLParser):
        def __init__(self):
            super().__init__()
            self.methods = []

        def handle_starttag(self, tag, attrs):
            attributes = dict(attrs)
            if tag == "form" and attributes.get("action") == "/logout":
                self.methods.append(attributes.get("method"))
            if tag == "a":
                assert attributes.get("href") != "/logout"

    parser = LogoutForms()
    parser.feed(response.text)
    assert parser.methods == ["post", "post"]
