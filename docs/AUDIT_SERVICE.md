# Audit service (Phases 2–7)

`app.modules.audit_service.AuditService.log()` is the centralized, best-effort
writer for the existing `AuditLog` model. Authentication, user-management,
device, credential, and backup mutation endpoints now use this service. Other resource instrumentation and audit
viewing/filtering/export UI remain separate integration work.

## Backup operations

- `POST /backups/trigger` records one `TRIGGER` summary. The existing form submits
  device IDs: matching all enabled devices yields scope `all`/name `all devices`;
  matching a complete enabled group yields `group`/name `group:<name>`; other
  selections use `selected`/name `selected devices` so partial selections are not
  mislabeled. `device_count` is the number of unique existing selected targets;
  duplicate/missing IDs do not inflate the count or cause duplicate executions.
- `POST /backups/{device_id}/now` records `TRIGGER` with the device ID and hostname.
  Failed backup results or exceptions mark trigger events failed; raw error
  messages and configuration content are not copied into audit. A bulk exception
  still propagates as before, after rolling back the current transaction and
  recording the failed request. Earlier backup commits are not undone.
- Single `DELETE` captures device name, UTC ISO timestamp, and file size before
  deleting, then records the event after commit. It stores no configuration,
  storage path, or destination credentials.
- `BATCH_DELETE` emits one summary after commit with `deleted_count` and
  `criteria.backup_ids` (unique, positive requested IDs). Counts reflect records
  actually deleted, including when requests contain duplicates or missing IDs.
- Delete success describes removal of database records. File removal retains the
  existing best-effort behavior; failures in remote/local cleanup can leave files.
  Download and content-view endpoints remain uninstrumented in this phase.

## Credential management events

Credential CRUD emits `CREATE`, `UPDATE`, and `DELETE` after commit with the
acting operator/admin, target ID/name, and request context. Snapshots explicitly
select name, username, and group; CREATE adds `has_password`/`has_ssh_key`, and
UPDATE adds `password_changed` (false before the operation, true afterwards only
when a non-empty replacement password was supplied). Blank password input keeps
the existing password and records false. Neither encrypted password/enable-secret
values nor SSH key paths enter snapshots.

The redactor preserves only strictly boolean values for the explicit metadata
flags `has_password`, `has_ssh_key`, `password_changed`, and `password_updated`.
Non-boolean values under these names remain redacted. SSH key paths are also
redacted defensively by the central service.

`GENERATE_SSH_KEY` records only RSA type and the actual key size after both key
files are written. Generation now uses 2048 bits as specified for Phase 6
(previously 4096); existing keys are not changed. Edit forms send an optional
`cred_id` so the event references the existing credential. On the add form there
is no saved credential yet: the resource ID is NULL and the resource name is
`key_name`. Generation still returns the path/public key to the UI and does not
automatically save a credential or attach the generated key. Neither key material
nor path is passed to audit.

Credential integration tests generate keys only in temporary directories, verify
the actual size and private-file permissions, and scan both audit snapshots for
known plaintext/ciphertext values, key material, and forbidden field names.

## Device management events

The six mutation/test handlers in `app/routers/devices.py` resolve an operator or
administrator through dependency injection and attach actor/IP/User-Agent context.
Successful mutations are audited after commit. An additional guarded helper
contains unexpected audit integration failures without logging error payloads.

- `CREATE` stores hostname, IP address, and device type. `vendor` and `location_id`
  are NULL because the current Device model has neither attribute; no schema or
  form changes are introduced.
- `UPDATE` compares explicit editable fields and records only changed old/new
  values, including credential references, destinations, and monitoring settings.
  Free-form notes are replaced with `***REDACTED***` in both snapshots when changed.
  Credential relationships and their secrets are never serialized.
- `DELETE` retains the hostname captured before deletion.
- `BATCH_EDIT` emits one summary with selected field names and the number of
  unique existing devices selected. Repeated/missing IDs do not inflate counts.
  Empty selection returns without an event, matching the existing early return.
- `IMPORT` emits one summary with source `oxidized` and imported/skipped counts.
  Skipped includes malformed/empty nodes and duplicates, including duplicates
  within the same submission. No per-device CREATE events are emitted.
- `TEST_CONNECTION` records success for a positive engine result; negative
  results, exceptions, missing credentials/devices, and engine initialization
  failures record failed status. Raw exception messages are never audited.

Device audit tests mock connection engines; they do not contact real devices.

## User management events

Both HTML forms and JSON API mutations record successful operations after the
business transaction commits, with the acting user's identity and request IP and
User-Agent. These replace the former `logger.info()` audit messages.

- `CREATE` stores the target ID/name and new username, role, and active status.
- `UPDATE` stores old/new role and active status. The old snapshot is captured
  after the concurrency guard refreshes the target and before applying changes.
- `DELETE` preserves the target username captured before deletion.
- `PASSWORD_CHANGE` records the current user as actor and target, with no old/new
  snapshots. Neither plaintext passwords nor password hashes are passed to audit.

Rejected operations do not produce success events. Audit write failures do not
undo committed user changes.

## Authentication events

- `POST /login` records `LOGIN_SUCCESS` with the authenticated user's ID and
  historical username before returning the redirect. Invalid passwords, unknown
  usernames, and inactive accounts record `LOGIN_FAILED` with a NULL user ID,
  `system` username, and the attempted username in `resource_name`.
- `POST /logout` requires an authenticated user and records `LOGOUT` before
  deleting the session cookie and redirecting to `/login`. Desktop and mobile
  navigation submit POST forms. The existing `GET /logout` remains available for
  compatibility and follows the same authentication/audit flow.
- All three events use `resource_type="auth"` and retain the request's client IP
  and complete User-Agent. Passwords, session tokens, and request bodies are not
  passed to the audit service. Login checks only read the database, so no business
  write transaction needs committing before recording these events.
- Audit storage failures do not block login or logout. This integration covers
  form login, not individual HTTP Basic-authenticated requests or session expiry.

## Calling the service

Record successful changes **after** committing the business transaction:

```python
from app.modules.audit_service import AuditService

old_value = {"role": target.role.value, "is_active": target.is_active}
target.role = new_role
db.commit()

AuditService.log(
    db,
    action="UPDATE",
    resource_type="users",
    user=actor,
    resource_id=target.id,
    resource_name=target.username,
    old_value=old_value,
    new_value={"role": target.role.value, "is_active": target.is_active},
    request=request,
)
```

For failed/denied operations, first roll back any pending business changes and
pass `status="failed"` or `status="denied"`. Capture a resource's ID, name, and
safe old-value metadata before deleting it. Background tasks may omit `user`
and `request`: the stored identity is `system`, with nullable user/request fields.
Unauthenticated login attempts can put the attempted username in safe metadata;
never construct a fake persisted user or include the attempted password.

The writer uses a separate session bound to the caller's database engine. It
commits only the audit entry, never the caller's unit of work. SQLite allows
only one writer at a time: if the caller still holds a database transaction,
the service skips the entry with a warning rather than risking its transaction
or waiting for a lock. This also protects shared in-memory SQLite connections.
Call after commit/rollback to avoid that condition.

Audit failures, including invalid JSON values and database errors, emit a warning
without raising. Warnings contain the exception class only; exception messages
and SQL parameters are deliberately excluded. This is best-effort recording,
not an atomic outbox: audit storage failures or a crash between business commit
and audit commit can leave a missing event.

## Data handling

- Timestamps are assigned in UTC. SQLite returns timezone-naive stored datetimes;
  consumers must interpret those values as UTC.
- IP comes from `request.client.host`, not an untrusted forwarded header. User
  agent is retained in full. Proxy trust belongs in deployment configuration.
- Old/new dictionaries are copied and recursively redacted before JSON encoding.
  Redaction includes dictionaries inside lists/tuples, case/separator variations,
  password/private-key/token/secret/API-key fields, and encrypted fields.
- Always send minimal, explicitly selected metadata. Field redaction cannot
  detect a password embedded in arbitrary prose or a secret-bearing URL stored
  under an unrelated field name. Do not pass raw request bodies or ORM dumps.
- Credential changes should use `{"credential_name": "admin-ssh", "action":
  "password_updated"}`; key generation should use `{"key_generated": true,
  "key_type": "RSA"}`. Never pass actual passwords or private keys.
- `None` snapshots remain SQL NULL; empty dictionaries remain `{}`. Inputs are
  never modified. User deletion retains the historical username and sets the
  user foreign key to NULL when database foreign-key enforcement is enabled.

Run verification with:

```sh
.venv/bin/python -m pytest tests/test_audit_service.py tests/test_auth_audit.py tests/test_user_audit.py tests/test_device_audit.py tests/test_credential_audit.py tests/test_backup_audit.py -q
```
