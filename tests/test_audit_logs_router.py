"""Tests for Audit Log UI viewer and CSV export."""
import csv
import io
import pytest
from sqlalchemy import select

from app.models.audit_log import AuditLog
from app.models.user import User


@pytest.fixture
def admin_client(web_client):
    web_client.auth = ("admin", "test-password-123")
    return web_client


def test_audit_logs_rbac(web_client):
    # Operator forbidden (403)
    web_client.auth = ("operator", "test-password-123")
    res_op = web_client.get("/audit-logs")
    assert res_op.status_code == 403

    # Viewer forbidden (403)
    web_client.auth = ("viewer", "test-password-123")
    res_vi = web_client.get("/audit-logs")
    assert res_vi.status_code == 403

    # Admin allowed (200)
    web_client.auth = ("admin", "test-password-123")
    res_adm = web_client.get("/audit-logs")
    assert res_adm.status_code == 200
    assert "Audit Logs" in res_adm.text


def test_audit_logs_filtering_and_pagination(admin_client, web_db):
    with web_db() as db:
        # Seed 10 audit logs with various actions and users
        for i in range(15):
            log = AuditLog(
                action="CREATE" if i % 2 == 0 else "DELETE",
                resource_type="devices" if i % 3 == 0 else "destinations",
                username=f"user_{i % 3}",
                resource_name=f"router-{i}",
                status="success",
            )
            db.add(log)
        db.commit()

    # Test filtering by action
    res_action = admin_client.get("/audit-logs?action=CREATE")
    assert res_action.status_code == 200
    assert "CREATE" in res_action.text

    # Test filtering by resource_type
    res_type = admin_client.get("/audit-logs?resource_type=devices")
    assert res_type.status_code == 200

    # Test pagination
    res_page = admin_client.get("/audit-logs?page=1&per_page=5")
    assert res_page.status_code == 200
    assert "Showing 1 - 5 of" in res_page.text

    # Test search query
    res_search = admin_client.get("/audit-logs?search=router-1")
    assert res_search.status_code == 200


def test_audit_logs_export_csv(admin_client, web_db):
    with web_db() as db:
        log = AuditLog(
            action="EXPORT_TEST",
            resource_type="auth",
            username="export_user",
            resource_name="Export Target",
            ip_address="192.168.1.100",
            status="success",
        )
        db.add(log)
        db.commit()

    res = admin_client.get("/audit-logs/export?action=EXPORT_TEST")
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    assert "attachment; filename=" in res.headers["content-disposition"]

    # Validate CSV content
    reader = csv.reader(io.StringIO(res.text))
    rows = list(reader)
    header = rows[0]
    assert header == ["ID", "Timestamp (UTC)", "Username", "Action", "Resource Type", "Resource ID", "Resource Name", "IP Address", "Status"]
    assert any(row[3] == "EXPORT_TEST" and row[2] == "export_user" for row in rows[1:])


def test_audit_log_details_endpoint(admin_client, web_db):
    with web_db() as db:
        log = AuditLog(
            action="DETAIL_TEST",
            resource_type="users",
            username="detail_user",
            old_value='{"name": "old_val"}',
            new_value='{"name": "new_val"}',
            status="success",
        )
        db.add(log)
        db.commit()
        log_id = log.id

    res = admin_client.get(f"/audit-logs/{log_id}/details")
    assert res.status_code == 200
    data = res.json()
    assert data["id"] == log_id
    assert data["action"] == "DETAIL_TEST"
    assert data["old_value"] == {"name": "old_val"}
    assert data["new_value"] == {"name": "new_val"}
