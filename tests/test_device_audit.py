"""Device audit integration; connection engines are mocked, never contacted."""
import json
from unittest.mock import AsyncMock, Mock

import pytest
from sqlalchemy import select

from app.models.audit_log import AuditLog
from app.models.credential import Credential
from app.models.destination import Destination
from app.models.device import Device
from app.models.user import User


def logs(factory):
    with factory() as db:
        return list(db.scalars(select(AuditLog).where(AuditLog.resource_type == 'devices').order_by(AuditLog.id)))


@pytest.fixture
def device_setup(web_db, web_client):
    web_client.auth = ('operator', 'test-password-123')
    web_client.headers['User-Agent'] = 'device-audit-test'
    with web_db() as db:
        dest = Destination(name='local-test', dest_type='local')
        cred = Credential(name='device-login', username='network-admin')
        cred.set_password('credential-secret')
        db.add_all([dest, cred])
        db.flush()
        device = Device(hostname='router-one', ip_address='192.0.2.1', device_type='cisco_ios',
                        credential_id=cred.id, destination_ids_override=[dest.id])
        second = Device(hostname='router-two', ip_address='192.0.2.2', device_type='cisco_ios')
        db.add_all([device, second])
        db.commit()
        return device.id, second.id, dest.id, cred.id


def test_device_crud(web_client, web_db, device_setup):
    _, _, dest, _ = device_setup
    values = dict(hostname='new-router', ip_address='192.0.2.10', device_type='cisco_ios', destination_ids=[dest])
    response = web_client.post('/devices/add', data=values)
    assert response.status_code == 303
    device_id = int(response.headers['location'].split('/')[-1])
    create, = logs(web_db)
    assert create.action == 'CREATE'
    assert json.loads(create.new_value) == dict(hostname='new-router', ip_address='192.0.2.10',
                                               device_type='cisco_ios', vendor=None, location_id=None)
    values.update(hostname='renamed-router', port=2222, notes='password=do-not-store')
    assert web_client.post(f'/devices/{device_id}/edit', data=values).status_code == 303
    update = logs(web_db)[-1]
    assert update.action == 'UPDATE'
    assert json.loads(update.old_value) == {'hostname': 'new-router', 'port': 22, 'notes': '***REDACTED***'}
    assert json.loads(update.new_value) == {'hostname': 'renamed-router', 'port': 2222, 'notes': '***REDACTED***'}
    assert web_client.post(f'/devices/{device_id}/delete').status_code == 303
    entries = logs(web_db)
    assert [entry.action for entry in entries] == ['CREATE', 'UPDATE', 'DELETE']
    assert entries[-1].resource_name == 'renamed-router'
    with web_db() as db:
        actor_id = db.scalar(select(User.id).where(User.username == 'operator'))
        assert db.get(Device, device_id) is None
    for entry in entries:
        assert entry.resource_id == device_id
        assert entry.user_id == actor_id
        assert entry.username == 'operator'
        assert entry.ip_address == 'testclient'
        assert entry.user_agent == 'device-audit-test'
        assert entry.status == 'success'
        assert 'do-not-store' not in str(entry.new_value)


def test_batch_summary_counts_unique_existing_devices(web_client, web_db, device_setup):
    first, second, _, _ = device_setup
    response = web_client.post('/devices/batch-edit', data={
        'device_ids': f'{first},{second},{first},99999', 'credential_id': '__none__', 'group': 'branch',
    })
    assert response.status_code == 303
    entry, = logs(web_db)
    assert entry.action == 'BATCH_EDIT'
    assert entry.resource_id is None
    assert entry.resource_name == '2 devices'
    assert json.loads(entry.new_value) == {'fields_updated': ['credential_id', 'group'], 'device_count': 2}
    with web_db() as db:
        for device_id in (first, second):
            assert db.get(Device, device_id).credential_id is None
            assert db.get(Device, device_id).group == 'branch'


def test_import_summary_includes_duplicate_and_invalid_nodes(web_client, web_db, device_setup):
    node = {'name': 'imported-router', 'ip': '192.0.2.20', 'model': 'ios'}
    response = web_client.post('/devices/import/oxidized', data={
        'node_1': json.dumps(node), 'node_2': json.dumps(node),
        'node_3': json.dumps({'name': 'router-one', 'ip': '192.0.2.1'}),
        'node_4': 'invalid json', 'node_5': '[]', 'node_6': '{}',
    })
    assert response.status_code == 303
    entry, = logs(web_db)
    assert entry.action == 'IMPORT'
    assert json.loads(entry.new_value) == {'source': 'oxidized', 'imported_count': 1, 'skipped_count': 5}
    with web_db() as db:
        imported, = db.scalars(select(Device).where(Device.hostname == 'imported-router')).all()
        assert imported.device_type == 'cisco_ios'


@pytest.mark.parametrize('outcome,status,message', [
    (True, 'success', 'Connection OK'), (False, 'failed', 'Connection Failed'),
    (RuntimeError('credential-secret'), 'failed', 'Connection error'),
])
def test_connection_outcomes(web_client, web_db, device_setup, monkeypatch, outcome, status, message):
    first, _, _, _ = device_setup
    test = AsyncMock(side_effect=outcome) if isinstance(outcome, Exception) else AsyncMock(return_value=outcome)
    monkeypatch.setattr('app.modules.engines.get_engine', Mock(return_value=Mock(test_connection=test)))
    response = web_client.post(f'/devices/{first}/test')
    assert response.status_code == 200
    assert message in response.text
    entry, = logs(web_db)
    assert entry.action == 'TEST_CONNECTION'
    assert entry.resource_id == first
    assert entry.resource_name == 'router-one'
    assert entry.status == status
    assert entry.username == 'operator'
    assert entry.user_agent == 'device-audit-test'
    assert entry.old_value is None and entry.new_value is None
    test.assert_awaited_once()


@pytest.mark.parametrize('missing', [False, True])
def test_connection_without_credential_or_device(web_client, web_db, device_setup, missing):
    _, second, _, _ = device_setup
    device_id = 99999 if missing else second
    response = web_client.post(f'/devices/{device_id}/test')
    assert ('Device not found' if missing else 'No credential assigned') in response.text
    entry, = logs(web_db)
    assert entry.action == 'TEST_CONNECTION' and entry.status == 'failed'
    assert entry.resource_id == device_id
    assert entry.resource_name == (None if missing else 'router-two')


def test_engine_initialization_failure_is_audited(web_client, web_db, device_setup, monkeypatch):
    first, _, _, _ = device_setup
    monkeypatch.setattr('app.modules.engines.get_engine', Mock(side_effect=ValueError('bad engine')))
    assert 'Connection error' in web_client.post(f'/devices/{first}/test').text
    entry, = logs(web_db)
    assert entry.status == 'failed'


def test_rejected_operations_do_not_log_success(web_client, web_db, device_setup):
    first, _, dest, _ = device_setup
    data = dict(hostname='invalid', ip_address='192.0.2.11', port=0, destination_ids=[dest])
    assert web_client.post('/devices/add', data=data).status_code == 400
    assert web_client.post(f'/devices/{first}/edit', data=data).status_code == 400
    assert web_client.post('/devices/99999/delete').status_code == 404
    assert web_client.post('/devices/batch-edit', data={'device_ids': ''}).status_code == 303
    web_client.auth = ('viewer', 'test-password-123')
    assert web_client.post(f'/devices/{first}/delete').status_code == 403
    assert logs(web_db) == []


def test_unexpected_audit_failure_preserves_committed_operation(web_client, web_db, device_setup, monkeypatch, caplog):
    first, _, _, _ = device_setup
    monkeypatch.setattr('app.routers.devices.AuditService.log', Mock(side_effect=RuntimeError('sensitive-error')))
    assert web_client.post(f'/devices/{first}/delete').status_code == 303
    with web_db() as db:
        assert db.get(Device, first) is None
    assert 'Device audit could not be recorded' in caplog.text
    assert 'sensitive-error' not in caplog.text
