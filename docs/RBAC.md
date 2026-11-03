# RBAC implementation and verification

## Permission policy

This implementation follows the latest nine-phase specification. Operators may
create/edit/delete devices, credentials, schedules, backup records, groups and
notification channels, and run backups, retries, diagnostics resolution and
connection tests. Destination deletion and user management require admin. A
cascading location deletion also requires admin because it deletes a destination.
Viewers can read pages, lists, backup contents/downloads and analytics; all resource
mutations and editing forms reject viewers with HTTP 403. Every authenticated user
can change their own password on Profile.

## Authentication and request context

`app/security.py` resolves the current database user from a signed cookie or HTTP
Basic credentials. A shared FastAPI application dependency authenticates requests
and sets `request.state.user`; templates also receive `current_user` from a context
processor. Authentication uses the same `get_db` dependency as handlers so database
overrides apply consistently in tests. Middleware supplies security headers.

Each operational endpoint explicitly declares its read/operator/admin dependency.
Swagger, ReDoc and OpenAPI endpoints remain authenticated. Permission failures
return an HTML error page for browser routes and JSON for `/api/*`.

`AUTH_USERNAME` / `AUTH_PASSWORD` are only bootstrap inputs. Existing sessions
reload active status and role on every request. Old single-user cookies require
login again. User changes are logged with actor and target IDs. User API payloads
exclude hashes, and validation errors omit submitted password values.

SQLite user IDs use AUTOINCREMENT after revision `m3n4o5p6q7r8`; deleting the
highest-numbered account cannot cause its old cookie to identify a new account.
Revision `l2m3n4o5p6q7` creates users. The older config-change migration also creates
its missing notification table on fresh installs; already-applied installations
are unaffected by that repair.

## Verification commands

Run from the repository root:

```bash
source .venv/bin/activate
python -m pytest tests/test_rbac.py -v
python -m pytest tests/ -v
```

HTTP tests use fresh temporary SQLite databases, real bcrypt hashes and real
session authentication. They do not start production scheduling or write to the
configured deployment database. Backup flow/API tests also use these fixtures.
The firewall integration test is intentionally skipped without a physical instance.

Coverage includes login failure/inactive accounts, HTTP Basic, logout, signed-token
expiry/tampering, role changes on existing sessions, user CRUD, duplicate/invalid
payloads, self-protection, password changes, every operational write route for
viewer rejection, operator deletion boundaries, destination configuration filtering,
rate limiting, fresh Alembic upgrade, preservation of users during migration and
first-start/repeated-start admin provisioning.

## Browser walkthrough

The real application was served on localhost with a disposable SQLite database
and disabled background scheduling. Automated Chromium interaction verified:

- Admin sees user badges and creates, edits and deletes an account through the UI.
- Operator sees device actions and destination editing, lacks destination deletion,
  and receives an HTML 403 when opening user management.
- Viewer sees devices with View only and no admin navigation.
- Viewer changes their own password through Profile.
- Mobile Profile fits a 390px viewport and uses the fixed, role-aware bottom nav.
- Logout clears access; the next protected navigation returns to login.

The walkthrough captures desktop Users, viewer Devices, mobile Profile, and a
screen recording under `artifacts/rbac-qa`. `browser-results.json` records the
checks and JavaScript errors. The reproducible runner is
`python artifacts/rbac-qa/run_browser.py`; it requires Node Playwright, Chrome and
Playwright FFmpeg at the paths configured in the browser script.

## Operational limits

Production rollout requires restarting the existing application process. The
migration was applied to the active SQLite database after a local backup, but
verification uses disposable environments and does not restart a live service.

No physical-device backup, PostgreSQL end-to-end deployment, HTTPS reverse-proxy
configuration, or persistence across an actual browser process restart was
exercised by the UI walkthrough. Existing PostgreSQL limitations in legacy
connection/migration code remain. Password changes do not revoke existing signed
cookies; deactivate compromised accounts to block them. MFA, SSO, per-user login
lockout, per-session revocation and database audit history remain outside this scope.
