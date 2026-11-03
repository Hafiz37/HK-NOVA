"""Audit integration tests for Destinations, Groups, Jobs/Schedules, Locations, and Notifications."""
import json
from unittest.mock import AsyncMock, patch
import pytest
from sqlalchemy import select

from app.models.audit_log import AuditLog
from app.models.destination import Destination, DestinationType
from app.models.group import Group
from app.models.job import Schedule, JobRun
from app.models.location import Location
from app.models.notification import NotificationChannel
from app.models.user import User


def logs_for(factory, resource_type: str):
    with factory() as db:
        return list(
            db.scalars(
                select(AuditLog)
                .where(AuditLog.resource_type == resource_type)
                .order_by(AuditLog.id)
            )
        )


@pytest.fixture
def auth_client(web_client):
    web_client.auth = ("operator", "test-password-123")
    web_client.headers["User-Agent"] = "other-resources-audit-test"
    return web_client


@pytest.fixture
def admin_client(web_client):
    web_client.auth = ("admin", "test-password-123")
    web_client.headers["User-Agent"] = "admin-audit-test"
    return web_client


# ==============================================================================
# Task 8.1: Destination Management Tests
# ==============================================================================
def test_destination_crud_and_test(auth_client, admin_client, web_db):
    # 1. CREATE
    res = auth_client.post(
        "/destinations/add",
        data={
            "name": "Audit Dest Local",
            "dest_type": "local",
            "local_path": "./test_backups",
            "local_file_extension": ".cfg",
            "description": "Test local destination",
        },
    )
    assert res.status_code == 303
    with web_db() as db:
        dest = db.scalar(select(Destination).where(Destination.name == "Audit Dest Local"))
        assert dest is not None
        dest_id = dest.id

    create_log = logs_for(web_db, "destinations")[-1]
    assert create_log.action == "CREATE"
    assert create_log.resource_id == dest_id
    assert create_log.resource_name == "Audit Dest Local"
    assert create_log.status == "success"

    # 2. UPDATE
    res = auth_client.post(
        f"/destinations/{dest_id}/edit",
        data={
            "name": "Audit Dest Local Updated",
            "dest_type": "local",
            "local_path": "./test_backups_updated",
            "local_file_extension": ".txt",
            "description": "Updated description",
        },
    )
    assert res.status_code == 303
    update_log = logs_for(web_db, "destinations")[-1]
    assert update_log.action == "UPDATE"
    assert update_log.resource_id == dest_id
    assert update_log.resource_name == "Audit Dest Local Updated"
    assert update_log.status == "success"

    # 3. TEST
    res = auth_client.post(f"/destinations/{dest_id}/test")
    assert res.status_code == 200
    test_log = logs_for(web_db, "destinations")[-1]
    assert test_log.action == "TEST"
    assert test_log.resource_id == dest_id
    assert test_log.status == "success"

    # 4. DELETE (requires admin)
    res = admin_client.post(f"/destinations/{dest_id}/delete")
    assert res.status_code == 303
    delete_log = logs_for(web_db, "destinations")[-1]
    assert delete_log.action == "DELETE"
    assert delete_log.resource_id == dest_id
    assert delete_log.resource_name == "Audit Dest Local Updated"
    assert delete_log.status == "success"


# ==============================================================================
# Task 8.2: Group Management Tests
# ==============================================================================
def test_group_crud(auth_client, web_db):
    # 1. CREATE
    res = auth_client.post(
        "/groups/add",
        data={
            "name": "Audit Test Group",
            "description": "A group for audit testing",
            "backup_engine": "netmiko",
        },
    )
    assert res.status_code == 303
    with web_db() as db:
        group = db.scalar(select(Group).where(Group.name == "Audit Test Group"))
        assert group is not None
        group_id = group.id

    create_log = logs_for(web_db, "groups")[-1]
    assert create_log.action == "CREATE"
    assert create_log.resource_id == group_id
    assert create_log.resource_name == "Audit Test Group"
    new_val = json.loads(create_log.new_value)
    assert new_val["device_count"] == 0
    assert new_val["backup_engine"] == "netmiko"

    # 2. UPDATE
    res = auth_client.post(
        f"/groups/{group_id}/edit",
        data={
            "name": "Audit Test Group Updated",
            "description": "Updated group description",
            "backup_engine": "oxidized",
        },
    )
    assert res.status_code == 303
    update_log = logs_for(web_db, "groups")[-1]
    assert update_log.action == "UPDATE"
    assert update_log.resource_id == group_id
    assert update_log.resource_name == "Audit Test Group Updated"
    new_val = json.loads(update_log.new_value)
    assert new_val["backup_engine"] == "oxidized"

    # 3. DELETE
    res = auth_client.post(f"/groups/{group_id}/delete")
    assert res.status_code == 303
    delete_log = logs_for(web_db, "groups")[-1]
    assert delete_log.action == "DELETE"
    assert delete_log.resource_id == group_id
    assert delete_log.resource_name == "Audit Test Group Updated"


# ==============================================================================
# Task 8.3: Schedule/Job Management Tests
# ==============================================================================
def test_schedule_crud_and_run(auth_client, web_db):
    # 1. CREATE
    res = auth_client.post(
        "/jobs/add",
        data={
            "name": "Daily Backup Audit",
            "cron_expression": "0 2 * * *",
            "device_group": "default",
        },
    )
    assert res.status_code == 303
    with web_db() as db:
        schedule = db.scalar(select(Schedule).where(Schedule.name == "Daily Backup Audit"))
        assert schedule is not None
        sched_id = schedule.id

    create_log = logs_for(web_db, "schedules")[-1]
    assert create_log.action == "CREATE"
    assert create_log.resource_id == sched_id
    assert create_log.resource_name == "Daily Backup Audit"

    # 2. UPDATE
    res = auth_client.post(
        f"/jobs/{sched_id}/edit",
        data={
            "name": "Nightly Backup Audit",
            "cron_expression": "0 3 * * *",
            "device_group": "default",
            "enabled": "true",
        },
    )
    assert res.status_code == 303
    update_log = logs_for(web_db, "schedules")[-1]
    assert update_log.action == "UPDATE"
    assert update_log.resource_id == sched_id
    assert update_log.resource_name == "Nightly Backup Audit"

    # 3. RUN (empty device test or failed/submitted)
    res = auth_client.post(f"/jobs/{sched_id}/run")
    assert res.status_code == 303
    run_log = logs_for(web_db, "schedules")[-1]
    assert run_log.action == "RUN"
    assert run_log.resource_id == sched_id
    assert run_log.resource_name == "Nightly Backup Audit"

    # 4. DELETE SCHEDULE
    res = auth_client.post(f"/jobs/{sched_id}/delete")
    assert res.status_code == 303
    delete_log = logs_for(web_db, "schedules")[-1]
    assert delete_log.action == "DELETE"
    assert delete_log.resource_id == sched_id

    # 5. DELETE_HISTORY
    with web_db() as db:
        job_run = JobRun(job_name="History Run Test", status="completed")
        db.add(job_run)
        db.commit()
        run_id = job_run.id

    res = auth_client.post(f"/jobs/history/{run_id}/delete")
    assert res.status_code == 303
    history_log = logs_for(web_db, "schedules")[-1]
    assert history_log.action == "DELETE_HISTORY"
    assert history_log.resource_id == run_id
    assert history_log.resource_name == "History Run Test"


# ==============================================================================
# Task 8.4: Location Management Tests
# ==============================================================================
def test_location_crud_and_devices(auth_client, admin_client, web_db):
    # Ensure local and main telegram destinations exist for create_location
    with web_db() as db:
        local_dest = Destination(
            name="Local Storage",
            dest_type=DestinationType.local,
            enabled=True,
            config_json={"path": "./backups", "file_extension": ".cfg"},
        )
        main_dest = Destination(
            name="Main Telegram",
            dest_type=DestinationType.telegram,
            enabled=True,
            config_json={"bot_token": "mock-token", "chat_id": "-1009999999999"},
        )
        db.add_all([local_dest, main_dest])
        db.commit()

    # 1. CREATE
    res = auth_client.post(
        "/api/v1/locations/",
        json={"name": "Branch Jakarta", "telegram_chat_id": "-1001234567890"},
    )
    assert res.status_code == 201
    create_log = logs_for(web_db, "locations")[-1]
    assert create_log.action == "CREATE"
    assert create_log.resource_name == "Branch Jakarta"
    loc_id = res.json()["id"]

    # 2. UPDATE
    res = auth_client.put(
        f"/api/v1/locations/{loc_id}",
        json={"name": "Branch Jakarta Updated"},
    )
    assert res.status_code == 200
    update_log = logs_for(web_db, "locations")[-1]
    assert update_log.action == "UPDATE"
    assert update_log.resource_id == loc_id
    assert update_log.resource_name == "Branch Jakarta Updated"

    # 3. DELETE
    res = admin_client.delete(f"/api/v1/locations/{loc_id}?cascade=true")
    assert res.status_code == 204
    delete_log = logs_for(web_db, "locations")[-1]
    assert delete_log.action == "DELETE"
    assert delete_log.resource_id == loc_id



# ==============================================================================
# Task 8.5: Notification Management Tests
# ==============================================================================
def test_notification_crud_and_test(auth_client, web_db):
    # 1. CREATE
    res = auth_client.post(
        "/notifications/add",
        data={
            "name": "Audit Telegram",
            "apprise_url": "tgram://123456789:ABCdefGhI/987654321",
            "on_success": "1",
            "on_failure": "1",
        },
    )
    assert res.status_code == 303
    with web_db() as db:
        ch = db.scalar(select(NotificationChannel).where(NotificationChannel.name == "Audit Telegram"))
        assert ch is not None
        ch_id = ch.id

    create_log = logs_for(web_db, "notifications")[-1]
    assert create_log.action == "CREATE"
    assert create_log.resource_id == ch_id
    assert create_log.resource_name == "Audit Telegram"
    assert "123456789" not in (create_log.new_value or "")

    # 2. UPDATE
    res = auth_client.post(
        f"/notifications/{ch_id}/edit",
        data={
            "name": "Audit Telegram Updated",
            "apprise_url": "tgram://newtoken/newchat",
            "on_success": "1",
            "enabled": "true",
        },
    )
    assert res.status_code == 303
    update_log = logs_for(web_db, "notifications")[-1]
    assert update_log.action == "UPDATE"
    assert update_log.resource_id == ch_id
    assert update_log.resource_name == "Audit Telegram Updated"
    assert "newtoken" not in (update_log.new_value or "")

    # 3. TEST
    with patch("app.modules.notifications.test_notification", new_callable=AsyncMock) as mock_test:
        mock_test.return_value = (True, "Notification sent")
        res = auth_client.post(f"/notifications/{ch_id}/test")
        assert res.status_code == 200

    test_log = logs_for(web_db, "notifications")[-1]
    assert test_log.action == "TEST"
    assert test_log.resource_id == ch_id
    assert test_log.resource_name == "Audit Telegram Updated"
    assert test_log.status == "success"

    # 4. DELETE
    res = auth_client.post(f"/notifications/{ch_id}/delete")
    assert res.status_code == 303
    delete_log = logs_for(web_db, "notifications")[-1]
    assert delete_log.action == "DELETE"
    assert delete_log.resource_id == ch_id
    assert delete_log.resource_name == "Audit Telegram Updated"
