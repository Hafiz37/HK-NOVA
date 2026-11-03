"""Credential audit metadata and secret-leak regression tests."""
import json
from pathlib import Path
import stat

import paramiko
import pytest
from sqlalchemy import event, select

from app.config import get_settings
from app.models.audit_log import AuditLog
from app.models.credential import Credential
from app.models.device import Device
from app.models.user import User
from app.modules.audit_service import AuditService, REDACTED


def logs(factory):
    with factory() as db:
        return list(db.scalars(select(AuditLog).where(AuditLog.resource_type == 'credentials').order_by(AuditLog.id)))


def assert_no_secrets(entries, secrets):
    for entry in entries:
        snapshots = (entry.old_value or '') + (entry.new_value or '')
        for forbidden in ('password_encrypted', 'enable_secret_encrypted', 'ssh_key_path',
                          'PRIVATE KEY', 'public_key', *secrets):
            assert forbidden not in snapshots


@pytest.fixture
def credential_client(web_client, monkeypatch, tmp_path):
    web_client.auth = ('operator', 'test-password-123')
    web_client.headers['User-Agent'] = 'credential-audit-test'
    monkeypatch.setattr(get_settings(), 'SSH_KEY_DIR', str(tmp_path / 'keys'))
    return web_client


@pytest.mark.parametrize('with_secrets', [True, False])
def test_credential_crud_metadata(credential_client, web_db, with_secrets):
    client = credential_client
    data = {'name': 'initial-credential', 'username': ' network-admin ', 'group': 'branch'}
    if with_secrets:
        data.update(password='initial-password-secret', enable_secret='enable-password-secret',
                    ssh_key_path='/private/key/location')
    assert client.post('/credentials/add', data=data).status_code == 303
    with web_db() as db:
        cred = db.scalar(select(Credential))
        cred_id = cred.id
        secret_values = [value for value in (cred.password_encrypted, cred.enable_secret_encrypted) if value]
        actor_id = db.scalar(select(User.id).where(User.username == 'operator'))
        device = Device(hostname='credential-device', ip_address='192.0.2.1',
                        credential_id=cred_id, proxy_credential_id=cred_id)
        db.add(device)
        db.commit()
        device_id = device.id
    create, = logs(web_db)
    assert create.action == 'CREATE' and create.old_value is None
    assert json.loads(create.new_value) == {'name': 'initial-credential', 'username': 'network-admin',
                                           'group': 'branch', 'has_password': with_secrets, 'has_ssh_key': with_secrets}
    assert client.post(f'/credentials/{cred_id}/edit', data={
        'name': 'renamed-credential', 'username': 'new-admin', 'group': 'hq',
        'password': 'replacement-password-secret', 'enable_secret': 'replacement-enable-secret',
        'ssh_key_path': '/new/private/location',
    }).status_code == 303
    update = logs(web_db)[-1]
    assert update.action == 'UPDATE'
    assert json.loads(update.old_value) == {'name': 'initial-credential', 'username': 'network-admin',
                                           'group': 'branch', 'password_changed': False}
    assert json.loads(update.new_value) == {'name': 'renamed-credential', 'username': 'new-admin',
                                           'group': 'hq', 'password_changed': True}
    with web_db() as db:
        cred = db.get(Credential, cred_id)
        assert cred.get_password() == 'replacement-password-secret'
        secret_values.extend([cred.password_encrypted, cred.enable_secret_encrypted])
    assert client.post(f'/credentials/{cred_id}/delete').status_code == 303
    entries = logs(web_db)
    assert [entry.action for entry in entries] == ['CREATE', 'UPDATE', 'DELETE']
    assert entries[-1].resource_name == 'renamed-credential'
    assert entries[-1].old_value is None and entries[-1].new_value is None
    for entry in entries:
        assert entry.resource_id == cred_id
        assert entry.user_id == actor_id
        assert entry.username == 'operator'
        assert entry.ip_address == 'testclient'
        assert entry.user_agent == 'credential-audit-test'
        assert entry.status == 'success'
    assert_no_secrets(entries, secret_values + ['initial-password-secret', 'enable-password-secret',
                      'replacement-password-secret', 'replacement-enable-secret',
                      '/private/key/location', '/new/private/location'])
    with web_db() as db:
        assert db.get(Credential, cred_id) is None
        device = db.get(Device, device_id)
        assert device.credential_id is None and device.proxy_credential_id is None


def test_blank_password_does_not_mark_change(credential_client, web_db):
    with web_db() as db:
        cred = Credential(name='existing', username=None, group='default')
        cred.set_password('original-secret')
        db.add(cred)
        db.commit()
        cred_id, original = cred.id, cred.password_encrypted
    assert credential_client.post(f'/credentials/{cred_id}/edit', data={'name': 'existing'}).status_code == 303
    entry, = logs(web_db)
    assert json.loads(entry.old_value)['password_changed'] is False
    assert json.loads(entry.new_value)['password_changed'] is False
    with web_db() as db:
        assert db.get(Credential, cred_id).password_encrypted == original


@pytest.mark.parametrize('existing', [False, True])
def test_real_key_generation_audits_metadata_only(credential_client, web_db, existing):
    data = {'key_name': 'audit-key'}
    if existing:
        with web_db() as db:
            cred = Credential(name='Existing Credential')
            db.add(cred)
            db.commit()
            data['cred_id'] = cred.id
    response = credential_client.post('/credentials/generate-ssh-key', data=data)
    assert response.status_code == 200
    path = Path(response.json()['ssh_key_path'])
    key = paramiko.RSAKey.from_private_key_file(str(path))
    assert key.get_bits() == 2048
    assert stat.S_IMODE(path.stat().st_mode) == 0o600
    assert Path(str(path) + '.pub').read_text().strip() == response.json()['public_key']
    entry, = logs(web_db)
    assert entry.action == 'GENERATE_SSH_KEY'
    assert entry.resource_id == data.get('cred_id')
    assert entry.resource_name == ('Existing Credential' if existing else 'audit-key')
    assert entry.username == 'operator'
    assert entry.user_agent == 'credential-audit-test'
    assert entry.old_value is None
    assert json.loads(entry.new_value) == {'key_type': 'RSA', 'key_size': 2048}
    assert_no_secrets([entry], [str(path), path.read_text(), key.get_base64()])
    if existing:
        response = credential_client.get(f"/credentials/{data['cred_id']}/edit")
        assert "form.append('cred_id'," in response.text
        with web_db() as db:
            assert db.get(Credential, data['cred_id']).ssh_key_path is None  # Saved by edit, as before.


@pytest.mark.parametrize('data,status', [({'key_name': '../invalid'}, 400),
                                        ({'key_name': 'valid', 'cred_id': 99999}, 404)])
def test_invalid_key_requests_are_not_successfully_audited(credential_client, web_db, data, status):
    assert credential_client.post('/credentials/generate-ssh-key', data=data).status_code == status
    assert logs(web_db) == []
    assert not Path(get_settings().SSH_KEY_DIR).exists()


def test_viewer_cannot_mutate_credentials(credential_client, web_db):
    credential_client.auth = ('viewer', 'test-password-123')
    for path, data in [('/add', {'name': 'forbidden'}), ('/1/edit', {'name': 'forbidden'}),
                       ('/1/delete', {}), ('/generate-ssh-key', {'key_name': 'forbidden'})]:
        assert credential_client.post('/credentials' + path, data=data).status_code == 403
    assert logs(web_db) == []


def test_audit_failure_keeps_credential_operations(credential_client, web_db):
    engine = web_db.kw['bind']

    def fail_audit(connection, cursor, statement, parameters, context, executemany):
        if statement.startswith('INSERT INTO audit_logs'):
            raise RuntimeError('audit unavailable')

    event.listen(engine, 'before_cursor_execute', fail_audit)
    try:
        assert credential_client.post('/credentials/add', data={'name': 'surviving'}).status_code == 303
        with web_db() as db:
            cred_id = db.scalar(select(Credential.id))
        assert credential_client.post(f'/credentials/{cred_id}/edit', data={'name': 'updated'}).status_code == 303
        with web_db() as db:
            assert db.get(Credential, cred_id).name == 'updated'
        response = credential_client.post('/credentials/generate-ssh-key', data={'key_name': 'surviving', 'cred_id': cred_id})
        assert response.status_code == 200
        assert Path(response.json()['ssh_key_path']).exists()
        assert credential_client.post(f'/credentials/{cred_id}/delete').status_code == 303
        with web_db() as db:
            assert db.get(Credential, cred_id) is None
    finally:
        event.remove(engine, 'before_cursor_execute', fail_audit)
    assert logs(web_db) == []


def test_boolean_flags_cannot_be_used_to_smuggle_secrets():
    for field in ('has_password', 'has_ssh_key', 'password_changed', 'password_updated'):
        for flag in (True, False):
            assert AuditService.redact_sensitive_fields({field: flag}) == {field: flag}
        for secret in ('plaintext-secret', {'password': 'secret'}, ['secret'], 1, None):
            assert AuditService.redact_sensitive_fields({field: secret}) == {field: REDACTED}
    assert AuditService.redact_sensitive_fields({'ssh_key_path': '/private/location'}) == {'ssh_key_path': REDACTED}
