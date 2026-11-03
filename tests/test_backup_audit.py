"""Backup audit integration, with device/network/storage work mocked."""
from datetime import datetime
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import event, select

from app.models.audit_log import AuditLog
from app.models.backup import Backup, BackupStatus
from app.models.device import Device
from app.models.user import User


def logs(factory):
    with factory() as db:
        return list(db.scalars(select(AuditLog).where(AuditLog.resource_type == 'backups').order_by(AuditLog.id)))


@pytest.fixture
def backup_setup(web_client, web_db, monkeypatch):
    web_client.auth = ('operator', 'test-password-123')
    web_client.headers['User-Agent'] = 'backup-audit-test'
    runner = AsyncMock(return_value=SimpleNamespace(status=BackupStatus.success, file_size=100, error_message=None))
    deleter = AsyncMock()
    monkeypatch.setattr('app.routers.backups.run_backup_for_device', runner)
    monkeypatch.setattr('app.routers.backups._delete_backup_file', deleter)
    with web_db() as db:
        devices = [Device(hostname=f'router-{i}', ip_address=f'192.0.2.{i}',
                          group='branch' if i < 3 else 'hq', enabled=i < 4) for i in range(1, 5)]
        db.add_all(devices)
        db.flush()
        backups = [Backup(device_id=device.id, timestamp=datetime(2026, 11, 3, 1, 2, 3),
                          file_size=100 + i, status=BackupStatus.success,
                          config_text='password super-sensitive-config', destination_path='/private/backups/config')
                   for i, device in enumerate(devices)]
        db.add_all(backups)
        db.commit()
        return [d.id for d in devices], [b.id for b in backups], runner, deleter


@pytest.mark.parametrize('indices,scope,name', [([0, 1, 2], 'all', 'all devices'),
                                             ([0, 1], 'group', 'group:branch'),
                                             ([0], 'selected', 'selected devices')])
def test_trigger_scope(web_client, web_db, backup_setup, indices, scope, name):
    devices, _, runner, _ = backup_setup
    selected = [devices[i] for i in indices]
    response = web_client.post('/backups/trigger', data={'device_ids': selected + [selected[0], 99999]})
    assert response.status_code == 303
    entry, = logs(web_db)
    assert entry.action == 'TRIGGER'
    assert entry.resource_name == name
    assert json.loads(entry.new_value) == {'scope': scope, 'device_count': len(selected)}
    assert entry.status == 'success'
    assert runner.await_count == len(selected)
    for call in runner.await_args_list:
        assert call.kwargs == {'destination_ids': None}
    with web_db() as db:
        assert entry.user_id == db.scalar(select(User.id).where(User.username == 'operator'))
    assert entry.username == 'operator'
    assert entry.ip_address == 'testclient'
    assert entry.user_agent == 'backup-audit-test'


@pytest.mark.parametrize('outcome,status', [('success', 'success'), ('failed', 'failed'), ('error', 'failed')])
def test_single_trigger(web_client, web_db, backup_setup, outcome, status):
    devices, _, runner, _ = backup_setup
    if outcome == 'error':
        runner.side_effect = RuntimeError('secret-error-content')
    elif outcome == 'failed':
        runner.return_value = SimpleNamespace(status=BackupStatus.failed, error_message='failure')
    response = web_client.post(f'/backups/{devices[0]}/now')
    assert response.status_code == 200
    entry, = logs(web_db)
    assert entry.action == 'TRIGGER'
    assert entry.resource_id == devices[0]
    assert entry.resource_name == 'router-1'
    assert entry.status == status
    assert entry.old_value is None and entry.new_value is None
    assert 'secret-error-content' not in response.text


def test_bulk_failed_result(web_client, web_db, backup_setup):
    devices, _, runner, _ = backup_setup
    runner.return_value = SimpleNamespace(status=BackupStatus.failed)
    assert web_client.post('/backups/trigger', data={'device_ids': devices[:2]}).status_code == 303
    entry, = logs(web_db)
    assert entry.status == 'failed'
    assert json.loads(entry.new_value)['device_count'] == 2


def test_bulk_exception_records_failure_without_error_payload(web_client, web_db, backup_setup):
    devices, _, runner, _ = backup_setup
    runner.side_effect = RuntimeError('secret-error-content')
    with pytest.raises(RuntimeError, match='secret-error-content'):
        web_client.post('/backups/trigger', data={'device_ids': devices[:2]})
    entry, = logs(web_db)
    assert entry.action == 'TRIGGER' and entry.status == 'failed'
    assert json.loads(entry.new_value) == {'scope': 'group', 'device_count': 2}
    assert 'secret-error-content' not in entry.new_value


def test_single_delete_metadata(web_client, web_db, backup_setup):
    _, backups, _, deleter = backup_setup
    assert web_client.post(f'/backups/{backups[0]}/delete').status_code == 303
    entry, = logs(web_db)
    assert entry.action == 'DELETE' and entry.resource_id == backups[0]
    assert entry.resource_name == 'router-1'
    assert json.loads(entry.old_value) == {'device_name': 'router-1', 'timestamp': '2026-11-03T01:02:03+00:00', 'size': 100}
    assert entry.new_value is None
    assert entry.username == 'operator' and entry.user_agent == 'backup-audit-test'
    assert 'super-sensitive-config' not in entry.old_value
    assert '/private/backups/config' not in entry.old_value
    deleter.assert_awaited_once()
    with web_db() as db:
        assert db.get(Backup, backups[0]) is None


def test_batch_delete_summary(web_client, web_db, backup_setup):
    _, backups, _, deleter = backup_setup
    response = web_client.post('/backups/batch-delete', data={
        'backup_ids': [backups[0], backups[1], backups[0], 99999, 'invalid', -1],
    })
    assert response.status_code == 303
    entry, = logs(web_db)
    assert entry.action == 'BATCH_DELETE'
    assert entry.resource_id is None
    assert json.loads(entry.new_value) == {'deleted_count': 2, 'criteria': {'backup_ids': sorted(backups[:2] + [99999])}}
    assert deleter.await_count == 2
    with web_db() as db:
        assert db.get(Backup, backups[0]) is None
        assert db.get(Backup, backups[1]) is None
        assert db.get(Backup, backups[2]) is not None


def test_rejected_and_empty_operations(web_client, web_db, backup_setup):
    _, backups, runner, deleter = backup_setup
    assert web_client.post('/backups/batch-delete').status_code == 303
    assert web_client.post('/backups/99999/delete').status_code == 404
    assert 'Device not found' in web_client.post('/backups/99999/now').text
    assert web_client.post('/backups/trigger').status_code == 422
    web_client.auth = ('viewer', 'test-password-123')
    assert web_client.post(f'/backups/{backups[0]}/delete').status_code == 403
    assert logs(web_db) == []
    runner.assert_not_awaited()
    deleter.assert_not_awaited()


def test_audit_failure_preserves_backup_operations(web_client, web_db, backup_setup):
    devices, backups, runner, _ = backup_setup
    engine = web_db.kw['bind']

    def fail_audit(connection, cursor, statement, parameters, context, executemany):
        if statement.startswith('INSERT INTO audit_logs'):
            raise RuntimeError('audit unavailable')

    event.listen(engine, 'before_cursor_execute', fail_audit)
    try:
        assert web_client.post('/backups/trigger', data={'device_ids': devices[:2]}).status_code == 303
        assert web_client.post(f'/backups/{devices[0]}/now').status_code == 200
        assert runner.await_count == 3
        assert web_client.post(f'/backups/{backups[0]}/delete').status_code == 303
        assert web_client.post('/backups/batch-delete', data={'backup_ids': backups[1:]}).status_code == 303
        with web_db() as db:
            assert db.scalars(select(Backup)).all() == []
    finally:
        event.remove(engine, 'before_cursor_execute', fail_audit)
    assert logs(web_db) == []
