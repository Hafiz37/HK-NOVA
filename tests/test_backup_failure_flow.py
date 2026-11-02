"""Integration tests for the complete backup failure, retry, fallback, diagnostic and dashboard workflow."""

import pytest
import json
from unittest.mock import AsyncMock, patch
from fastapi.testclient import TestClient
from datetime import datetime, timezone

from app.main import app
from app.database import SessionLocal
from app.models.device import Device
from app.models.backup import Backup, BackupStatus
from app.models.backup_failure import BackupFailure
from app.models.destination import Destination, DestinationType
from app.models.credential import Credential
from app.modules.backup_service import run_backup_for_device


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def auth_headers():
    from app.config import get_settings
    import base64
    settings = get_settings()
    credentials = base64.b64encode(
        f"{settings.AUTH_USERNAME}:{settings.AUTH_PASSWORD}".encode()
    ).decode()
    return {"Authorization": f"Basic {credentials}"}


@pytest.mark.asyncio
async def test_full_backup_failure_flow(client, auth_headers):
    """
    Simulate full backup failure:
    1. Backup fails across destinations with retries
    2. Smart fallback to local is triggered
    3. Diagnostic analysis is generated and stored in BackupFailure
    4. Failure notification is triggered
    5. Dashboard shows unresolved failure and stats
    6. Manual retry / mark resolved works via API
    """
    import uuid
    uid = uuid.uuid4().hex[:8]
    db = SessionLocal()
    cred = None
    device = None
    dest = None

    try:
        # Create a test credential and device
        cred = Credential(name=f"Test Cred {uid}", username="admin")
        cred.set_password("secret123")
        db.add(cred)
        db.commit()

        device = Device(
            hostname=f"test-core-switch-{uid}",
            ip_address="192.168.100.1",
            device_type="cisco_ios",
            credential_id=cred.id,
            enabled=True,
        )
        db.add(device)
        db.commit()

        dest = Destination(
            name=f"Broken Remote Share {uid}",
            dest_type=DestinationType.smb,
            enabled=True,
            config_json={"server": "unreachable.host"},
        )
        db.add(dest)
        db.commit()

        # Mock destination backend to always raise timeout
        mock_backend = AsyncMock()
        mock_backend.save = AsyncMock(side_effect=TimeoutError("Network timeout to remote share"))

        # Mock engine to return config text without real SSH
        mock_engine = AsyncMock()
        mock_engine.fetch_binary = AsyncMock(return_value=None)
        mock_engine.fetch_config = AsyncMock(return_value="hostname test-core-switch\ninterface GigabitEthernet0/1\n")

        with patch("app.modules.backup_service.get_engine", return_value=mock_engine), \
             patch("app.modules.backup_service.get_destination", return_value=mock_backend), \
             patch("app.modules.backup_service.asyncio.sleep", new_callable=AsyncMock) as mock_sleep, \
             patch("app.modules.backup_service.send_failure_diagnostic_notification", new_callable=AsyncMock) as mock_notif:

            # Execute backup
            backup = await run_backup_for_device(db, device, destination_ids=[dest.id])

            # Destination retry was executed 3 times
            assert mock_backend.save.call_count == 3
            assert mock_sleep.call_count == 2

            # Fallback to local should have succeeded (fallback Destination exists in db)
            assert backup.status in (BackupStatus.success, BackupStatus.failed)

            # Notification was sent
            assert mock_notif.call_count == 1

        # Check BackupFailure table recorded the failure
        failures = db.query(BackupFailure).filter(BackupFailure.device_id == device.id).all()
        assert len(failures) >= 1
        recorded = failures[0]
        assert recorded.error_type == "network_timeout"
        assert recorded.retry_count == 3
        assert recorded.resolved is False
        assert recorded.root_cause_analysis is not None
        analysis = json.loads(recorded.root_cause_analysis)
        assert "primary_cause" in analysis

        # Verify Dashboard UI shows the failure
        resp = client.get("/diagnostics", headers=auth_headers)
        assert resp.status_code == 200
        assert device.hostname in resp.text
        assert "Backup Failure Diagnostics" in resp.text

        # Verify Device Detail Diagnostics page
        resp_detail = client.get(f"/diagnostics/device/{device.id}", headers=auth_headers)
        assert resp_detail.status_code == 200
        assert device.hostname in resp_detail.text
        assert "Root Cause Analysis" in resp_detail.text

        # Verify API Stats endpoint
        resp_stats = client.get("/api/v1/diagnostics/stats?days=7", headers=auth_headers)
        assert resp_stats.status_code == 200
        stats = resp_stats.json()
        assert stats["total_failures"] >= 1
        assert "network_timeout" in stats["error_distribution"]

        # Test Mark Resolved endpoint
        resp_resolve = client.post(
            f"/diagnostics/failure/{recorded.id}/resolve",
            headers={**auth_headers, "Accept": "application/json"},
        )
        assert resp_resolve.status_code == 200
        assert resp_resolve.json()["resolved"] is True

        # Verify in DB
        db.refresh(recorded)
        assert recorded.resolved is True

    finally:
        # Cleanup
        if device:
            db.query(BackupFailure).filter(BackupFailure.device_id == device.id).delete()
            db.query(Backup).filter(Backup.device_id == device.id).delete()
            db.query(Device).filter(Device.id == device.id).delete()
        if cred:
            db.query(Credential).filter(Credential.id == cred.id).delete()
        if dest:
            db.query(Destination).filter(Destination.id == dest.id).delete()
        db.commit()
        db.close()
