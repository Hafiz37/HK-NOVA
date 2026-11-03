# HK-NOVA Audit Log System

## Overview
The HK-NOVA Audit Log system provides a tamper-resistant, comprehensive activity tracking mechanism for security, compliance, and operational forensics. It automatically records all user and system operations across all HK-NOVA resource types without interrupting business transactions.

---

## What is Recorded
Each audit log entry captures:
1. **Timestamp**: Exact UTC time of the action (`timestamp`).
2. **Actor Context**: 
   - `user_id`: Foreign key referencing `users(id)` (`ON DELETE SET NULL` preserves records even if a user account is deleted).
   - `username`: Historical username snapshot at the time of the event.
3. **Action Context**:
   - `action`: Operation performed (e.g. `CREATE`, `UPDATE`, `DELETE`, `LOGIN_SUCCESS`, `LOGIN_FAILED`, `LOGOUT`, `TEST`, `RUN`, `DELETE_HISTORY`, `BATCH_DELETE`, `ADD_DEVICES`).
   - `resource_type`: Type of resource (`auth`, `users`, `devices`, `credentials`, `backups`, `destinations`, `groups`, `schedules`, `locations`, `notifications`).
   - `resource_id`: Primary key of the affected resource (if applicable).
   - `resource_name`: Human-readable identifier or name of the resource.
4. **Change Tracking & Metadata**:
   - `old_value`: JSON snapshot of critical resource fields prior to the operation.
   - `new_value`: JSON snapshot of fields after the operation or relevant action metadata.
   - **Automatic Secret Redaction**: Passwords, API tokens, bot tokens, SSH private keys, and authorization secrets are strictly filtered and replaced with `***REDACTED***`.
5. **Request Context**:
   - `ip_address`: Client IP address (supports IPv4 and IPv6 up to 45 chars).
   - `user_agent`: HTTP `User-Agent` string.
6. **Status**:
   - `success`: Action completed successfully.
   - `failed`: Action encountered an error or execution failure.
   - `denied`: Access control or authentication denial.

---

## Resources & Tracked Actions
- **Authentication (`auth`)**: `LOGIN_SUCCESS`, `LOGIN_FAILED`, `LOGOUT`
- **Users (`users`)**: `CREATE`, `UPDATE`, `DELETE`, `PASSWORD_CHANGE`
- **Devices (`devices`)**: `CREATE`, `UPDATE`, `DELETE`, `BATCH_EDIT`, `IMPORT`, `TEST_CONNECTION`
- **Credentials (`credentials`)**: `CREATE`, `UPDATE`, `DELETE`, `GENERATE_SSH_KEY`
- **Backups (`backups`)**: `TRIGGER`, `DELETE`, `BATCH_DELETE`
- **Destinations (`destinations`)**: `CREATE`, `UPDATE`, `DELETE`, `TEST`
- **Groups (`groups`)**: `CREATE`, `UPDATE`, `DELETE`
- **Schedules (`schedules`)**: `CREATE`, `UPDATE`, `DELETE`, `RUN`, `DELETE_HISTORY`
- **Locations (`locations`)**: `CREATE`, `UPDATE`, `DELETE`, `TEST_BACKUP`, `ADD_DEVICES`
- **Notifications (`notifications`)**: `CREATE`, `UPDATE`, `DELETE`, `TEST`

---

## Accessing the Audit Log Viewer
- **URL**: `/audit-logs`
- **Access Control**: **Administrators only** (`role == 'admin'`).
  - Requests from non-admin roles (`operator` or `viewer`) receive a strict `403 Forbidden` response.
- **Navigation**: Accessible directly from the top navigation bar or user profile dropdown menu under **Audit Logs** (`bi-shield-check`).

---

## Filtering and CSV Export

### Filtering
The viewer includes a collapsible filter panel supporting:
- **Date Range**: Filter by starting date (`date_from`) and ending date (`date_to`) up to the current date.
- **Action**: Filter by operation type (populated dynamically).
- **Resource Type**: Filter by resource category.
- **Username**: Filter by username with autocomplete datalist.
- **Keyword Search**: Substring search across resource names, IP addresses, and JSON payloads.
- **Pagination**: Configurable page sizes (25, 50, 100, 200 entries per page).

### Details Modal
Clicking **Details** opens a modal displaying full request context and side-by-side JSON comparison of `old_value` and `new_value`.

### CSV Export
- Click **Export CSV** to download all records matching the current filters.
- Implemented using streamed HTTP response generation (`StreamingResponse`) with batched database cursor reads, ensuring zero memory spikes even when exporting tens of thousands of records.

---

## Retention & Database Storage
- Audit entries are stored in the `audit_logs` table.
- Primary key uses `AUTOINCREMENT` to ensure IDs are monotonically increasing and never reused.
- Audit records are retained permanently for historical compliance.
- User deletions preserve the audit trail via `ON DELETE SET NULL`, leaving `username` intact for historical reporting.

---

## Security Best Practices
1. **Admin Only**: Never grant non-admin users access to the `/audit-logs` routes or export endpoints.
2. **Payload Protection**: Never bypass `AuditService.redact_sensitive_fields()` when passing custom dictionaries into audit events.
3. **Audit Resilience**: Business transactions commit independently of audit logging. SQLite write locks are carefully handled to prevent locking issues.

---

## Troubleshooting
- **Audit Logs Not Writing**:
  - Verify disk space on the volume hosting `hk-nova.db`.
  - Check file permissions to ensure the running process can write to the database and SQLite journal files.
  - Review application logs tagged `hk-nova.audit`.
- **Database Schema Upgrades**:
  - The audit log table is automatically provisioned via migration `v18_audit_logs` during application startup (`init_db()`).

