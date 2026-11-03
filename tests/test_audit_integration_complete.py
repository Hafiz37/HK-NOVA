"""Integration and performance tests for the complete Audit Log system."""
import csv
import io
import time
import pytest
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import sessionmaker

from app.database import Base, _apply_migrations, init_db
from app.models.audit_log import AuditLog
from app.models.credential import Credential
from app.models.device import Device
from app.models.user import User, UserRole


# ==============================================================================
# Scenario 1 & 2: Fresh Install & Upgrade Path
# ==============================================================================
def test_fresh_installation_creates_audit_table_and_indexes(tmp_path):
    db_file = tmp_path / "fresh_hk_nova.db"
    engine = create_engine(f"sqlite:///{db_file}", connect_args={"check_same_thread": False})
    
    # Run metadata creation & migrations
    Base.metadata.create_all(bind=engine)
    with engine.connect() as conn:
        # Check tables
        tables = [r[0] for r in conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'")).fetchall()]
        assert "audit_logs" in tables
        
        # Check indexes
        indexes = [r[1] for r in conn.execute(text("PRAGMA index_list(audit_logs)")).fetchall()]
        assert "ix_audit_logs_timestamp" in indexes
        assert "ix_audit_logs_user_id" in indexes
        assert "ix_audit_logs_action" in indexes
        assert "ix_audit_logs_resource_type" in indexes
    engine.dispose()


def test_upgrade_path_applies_v18_and_preserves_existing_data(tmp_path):
    db_file = tmp_path / "legacy_hk_nova.db"
    # Create legacy db with existing tables and migrations marked up to v17
    engine = create_engine(f"sqlite:///{db_file}", connect_args={"check_same_thread": False})
    with engine.connect() as conn:
        conn.execute(text("""
            CREATE TABLE _applied_migrations (
                name VARCHAR(100) NOT NULL PRIMARY KEY,
                applied_at DATETIME NOT NULL DEFAULT (datetime('now'))
            )
        """))
        for m in ["v09_credentials_group", "v15_devices_proxy_columns", "v16_groups_profile_columns",
                  "v161_credentials_nullable", "v161_repair_column_swap", "v17_backup_failures"]:
            conn.execute(text(f"INSERT INTO _applied_migrations (name) VALUES ('{m}')"))

        conn.execute(text("CREATE TABLE users (id INTEGER PRIMARY KEY, username VARCHAR(50))"))
        conn.execute(text("INSERT INTO users (id, username) VALUES (1, 'legacy_admin')"))
        conn.commit()

    from unittest.mock import patch
    with patch("app.database.engine", engine):
        _apply_migrations()

    with engine.connect() as conn:
        applied = [r[0] for r in conn.execute(text("SELECT name FROM _applied_migrations")).fetchall()]
        assert "v18_audit_logs" in applied

        # Ensure legacy user data is preserved
        user_row = conn.execute(text("SELECT username FROM users WHERE id = 1")).fetchone()
        assert user_row[0] == "legacy_admin"

        # Ensure audit_logs table was created
        tables = [r[0] for r in conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'")).fetchall()]
        assert "audit_logs" in tables
    engine.dispose()


# ==============================================================================
# Scenario 3 & 4: Functional & Security Tests
# ==============================================================================
def test_security_non_admin_cannot_access_audit_logs(web_client):
    web_client.auth = ("operator", "test-password-123")
    res = web_client.get("/audit-logs")
    assert res.status_code == 403

    web_client.auth = ("viewer", "test-password-123")
    res = web_client.get("/audit-logs")
    assert res.status_code == 403


def test_security_sensitive_data_redacted_no_password_leaks(web_db, web_client):
    web_client.auth = ("admin", "test-password-123")

    # Add a credential with sensitive passwords
    res = web_client.post(
        "/credentials/add",
        data={
            "name": "SuperSecretCred",
            "username": "secret_user",
            "password": "MySuperSecretPlainPassword123!",
            "enable_secret": "MyEnableSecretXYZ!",
        },
    )
    assert res.status_code == 303

    # Inspect the audit_logs table directly
    with web_db() as db:
        logs = list(db.scalars(select(AuditLog).where(AuditLog.resource_name == "SuperSecretCred")).all())
        assert len(logs) > 0
        for entry in logs:
            combined = f"{entry.old_value or ''} {entry.new_value or ''}"
            assert "MySuperSecretPlainPassword123!" not in combined
            assert "MyEnableSecretXYZ!" not in combined
            # Ensure passwords are never stored in plaintext
            assert "password_encrypted" not in combined


# ==============================================================================
# Scenario 5: Performance Tests (10,000 entries)
# ==============================================================================
def test_performance_10k_records_pagination_and_streaming_export(web_client, web_db):
    web_client.auth = ("admin", "test-password-123")

    # Seed 10,000 audit log rows using bulk insert for performance
    with web_db() as db:
        items = [
            {
                "action": "UPDATE" if i % 2 == 0 else "CREATE",
                "resource_type": "devices" if i % 2 == 0 else "credentials",
                "username": f"bulk_user_{i % 10}",
                "resource_name": f"resource-{i}",
                "ip_address": "10.0.0.1",
                "status": "success",
            }
            for i in range(10000)
        ]
        db.bulk_insert_mappings(AuditLog, items)
        db.commit()

    # 1. Page load time < 2.0s
    t0 = time.perf_counter()
    res_page = web_client.get("/audit-logs?page=1&per_page=50")
    t1 = time.perf_counter()
    page_duration = t1 - t0
    assert res_page.status_code == 200
    assert page_duration < 2.0, f"Page load took {page_duration:.2f}s, expected < 2.0s"

    # 2. Filter query time with multiple criteria
    t0 = time.perf_counter()
    res_filter = web_client.get("/audit-logs?action=UPDATE&resource_type=devices&username=bulk_user_1")
    t1 = time.perf_counter()
    filter_duration = t1 - t0
    assert res_filter.status_code == 200
    assert filter_duration < 2.0

    # 3. CSV export of large dataset (streaming)
    t0 = time.perf_counter()
    res_export = web_client.get("/audit-logs/export?action=UPDATE&resource_type=devices")
    t1 = time.perf_counter()
    export_duration = t1 - t0
    assert res_export.status_code == 200
    assert res_export.headers["content-type"].startswith("text/csv")
    reader = csv.reader(io.StringIO(res_export.text))
    rows = list(reader)
    # Header + 5000 records
    assert len(rows) == 5001
    assert export_duration < 5.0
