# REST API Reference

Operational API endpoints are under `/api/v1/`; user management is under `/api/users`.
Both accept HTTP Basic credentials for an active database user (or a signed web session).

## Authentication

`AUTH_USERNAME` / `AUTH_PASSWORD` only provision the initial admin when users is
empty. Requests authenticate against the stored account password. Missing/invalid
credentials return 401; insufficient roles return 403. Viewer requests are read-only;
operator/admin may mutate operational resources. Only admins manage users or delete
destinations, including cascading location deletion. Password changes use Profile.


```bash
AUTH="admin:your-password"
```

---

## Devices

```bash
# List all devices
curl -u "$AUTH" http://localhost:5005/api/v1/devices

# Create device
curl -u "$AUTH" -X POST http://localhost:5005/api/v1/devices \
  -H "Content-Type: application/json" \
  -d '{
    "hostname": "switch01",
    "ip_address": "192.0.2.1",
    "device_type": "cisco_ios",
    "credential_id": 1
  }'

# Get device
curl -u "$AUTH" http://localhost:5005/api/v1/devices/1

# Update device
curl -u "$AUTH" -X PUT http://localhost:5005/api/v1/devices/1 \
  -H "Content-Type: application/json" \
  -d '{"hostname": "switch01-updated"}'

# Delete device
curl -u "$AUTH" -X DELETE http://localhost:5005/api/v1/devices/1
```

---

## Backups

```bash
# List all backups
curl -u "$AUTH" http://localhost:5005/api/v1/backups

# Trigger backup for specific devices
curl -u "$AUTH" -X POST http://localhost:5005/api/v1/backups/trigger \
  -H "Content-Type: application/json" \
  -d '{"device_ids": [1, 2, 3]}'

# Get backup details
curl -u "$AUTH" http://localhost:5005/api/v1/backups/1
```

---

## Credentials

```bash
# List credentials
curl -u "$AUTH" http://localhost:5005/api/v1/credentials

# Create credential
curl -u "$AUTH" -X POST http://localhost:5005/api/v1/credentials \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ssh-admin",
    "username": "admin",
    "password": "secret"
  }'
```

---

## Schedules

```bash
# List schedules
curl -u "$AUTH" http://localhost:5005/api/v1/schedules

# Create schedule (cron-based)
curl -u "$AUTH" -X POST http://localhost:5005/api/v1/schedules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Nightly-2AM",
    "cron_expression": "0 2 * * *",
    "device_ids": [1, 2, 3],
    "destination_ids": [1]
  }'
```

---

## Destinations

```bash
# List destinations
curl -u "$AUTH" http://localhost:5005/api/v1/destinations

# Create destination
curl -u "$AUTH" -X POST http://localhost:5005/api/v1/destinations \
  -H "Content-Type: application/json" \
  -d '{
    "name": "local-backups",
    "dest_type": "local",
    "config_json": {"path": "./backups"}
  }'
```

---

## Retention

```bash
# Run retention sweep (applies GFS policies)
curl -u "$AUTH" -X POST http://localhost:5005/api/v1/retention/sweep
```

---

## Maintenance

```bash
# Run full DB maintenance (retention sweep, stale cleanup, history purge, VACUUM)
curl -u "$AUTH" -X POST http://localhost:5005/api/v1/maintenance/run
```

This runs automatically daily at 3:30 AM. Use this endpoint to trigger it manually.

---

## Job History

```bash
# List job runs
curl -u "$AUTH" http://localhost:5005/api/v1/jobs/history

# Get specific run details
curl -u "$AUTH" http://localhost:5005/api/v1/jobs/runs/1
```

## Users (admin only)

- `GET /api/users`: list users.
- `POST /api/users`: create (`username`, `password`, optional `full_name`, `role`, `is_active`); returns 201.
- `GET /api/users/{id}`: retrieve one user; 404 if missing.
- `PUT /api/users/{id}`: partial update of `full_name`, `role`, `is_active`.
- `DELETE /api/users/{id}`: delete; returns 204.

Username cannot be changed. New usernames allow 3–50 ASCII letters, digits,
underscores or dashes. Passwords require 8+ characters and at most 72 UTF-8 bytes.
The default role is viewer. No user response includes plaintext passwords or hashes.
Duplicate names and self-protection violations return 400; invalid schemas return
422. Self-deletion/deactivation/demotion and removing the last active admin are blocked.

```bash
# Prompt for the current admin password rather than storing it in shell history.
curl -u admin http://localhost:5005/api/users
curl -u admin -X PUT http://localhost:5005/api/users/2 \
  -H 'Content-Type: application/json' -d '{"is_active":false}'
```

Viewer responses from destination list/default-telegram APIs omit `config_json`.
