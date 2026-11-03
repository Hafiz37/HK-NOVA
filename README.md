# HK-NOVA

Network device configuration backup manager with automated scheduling and multi-vendor support.

**Version:** 1.0.0 | **License:** MIT

![Python](https://img.shields.io/badge/Python-3.11+-blue.svg)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-green.svg)
![License](https://img.shields.io/badge/License-MIT-yellow.svg)

---

## Features

- **Multi-vendor support** — Cisco, Nokia, Juniper, Arista, HP/Aruba, Dell, MikroTik, pfSense, Proxmox VE (20+ device types)
- **5 backup engines** — Netmiko (SSH), SCP/SFTP, Oxidized API, pfSense/OPNsense API, Proxmox VE
- **5 storage destinations** — Local, Git (GitHub/Gitea/Forgejo), SMB/CIFS, Telegram
- **Automated scheduling** — Cron-based jobs with APScheduler
- **Retention policies** — Grandfather-Father-Son (GFS) rotation with daily maintenance
- **Config monitoring** — Drift detection with automatic backup on changes
- **Analytics dashboard** — Backup trends, success rates, storage metrics
- **Notifications** — 80+ services via Apprise (Slack, Discord, Telegram, email)
- **REST API** — Full JSON API with rate limiting (30 req/min)
- **Security & Audit Logs** — database-backed users, three RBAC roles, bcrypt passwords, Fernet encrypted device credentials, HMAC-SHA256 sessions, and a comprehensive, tamper-resistant Audit Log system with streaming CSV export and viewer UI (see [docs/AUDIT_LOG.md](docs/AUDIT_LOG.md))

---

## Quick Start

### Docker (Recommended)

```bash
# Clone repository
git clone https://github.com/your-organization/hk-nova.git
cd hk-nova

# Create environment file
cp .env.example .env

# Generate SECRET_KEY and set password
python3 -c "from cryptography.fernet import Fernet; print(f'SECRET_KEY={Fernet.generate_key().decode()}')" >> .env
sed -i 's/AUTH_PASSWORD=.*/AUTH_PASSWORD=your-strong-password/' .env

# Start with Docker
docker compose up -d
```

Access at `http://localhost:5005` (username: `admin`, password: from .env)

### Local Installation

```bash
# Clone and setup
git clone https://github.com/your-organization/hk-nova.git
cd hk-nova

# Create virtual environment
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Configure
cp .env.example .env
python3 -c "from cryptography.fernet import Fernet; print(f'SECRET_KEY={Fernet.generate_key().decode()}')" >> .env
# Edit .env and change AUTH_PASSWORD

# Run
./run.sh
```

Access at `http://localhost:5005`

---

## Installation

### Requirements

- Python 3.11+ or Docker 20.10+
- 512MB RAM minimum (1GB+ recommended)
- Network access to devices via SSH/API

### Method 1: Docker

```bash
mkdir hk-nova && cd hk-nova
wget https://github.com/your-organization/hk-nova/archive/refs/tags/v1.0.0.tar.gz
tar -xzf v1.0.0.tar.gz --strip-components=1
cp .env.example .env
# Edit .env: change SECRET_KEY and AUTH_PASSWORD
docker compose up -d
```

### Method 2: Python Virtual Environment

```bash
# Install dependencies (Ubuntu/Debian)
sudo apt-get install python3.11 python3.11-venv git gcc libffi-dev

# Setup
git clone https://github.com/your-organization/hk-nova.git
cd hk-nova
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Configure
cp .env.example .env
# Edit .env: change SECRET_KEY and AUTH_PASSWORD

# Run
uvicorn app.main:app --host 0.0.0.0 --port 5005
```

### Method 3: System Service (systemd)

```bash
# Install
sudo curl -fsSL https://raw.githubusercontent.com/your-organization/hk-nova/main/install.sh | bash

# Configure
sudo nano /opt/hk-nova/.env

# Start service
sudo systemctl enable hk-nova
sudo systemctl start hk-nova
```

---

## Configuration

Edit `.env` file:

```bash
# Required
SECRET_KEY=your-fernet-key-here
AUTH_PASSWORD=your-strong-password

# Optional
DATABASE_URL=sqlite:///./hk-nova.db
BACKUP_DIR=./backups
LOG_LEVEL=INFO
HOST=0.0.0.0
PORT=5005
AUTH_USERNAME=admin
CORS_ORIGINS=*
TZ=America/Chicago
OXIDIZED_URL=http://localhost:8888
```

**Generate SECRET_KEY:**
```bash
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

---

## Supported Devices

| Vendor | Device Types |
|--------|--------------|
| **Cisco** | IOS, IOS-XE, IOS-XR, NX-OS, ASA |
| **Nokia** | SR OS (Classic CLI, MD-CLI) |
| **Arista** | EOS |
| **Juniper** | JunOS |
| **HP/Aruba** | ProCurve, Comware |
| **Dell** | OS6, OS9, OS10, Force10 |
| **Brocade/Ruckus** | ICX, FastIron |
| **MikroTik** | RouterOS |
| **Huawei** | VRP |
| **Extreme** | ExtremeXOS |
| **pfSense/OPNsense** | Firewall (API) |
| **Proxmox VE** | Virtualization (SSH) |

---

## Usage

### First Device Backup

1. Login at `http://localhost:5005` (admin / your-password)
2. **Credentials** → Add credential (SSH username/password)
3. **Devices** → Add device (hostname, type, credential)
4. Click **Test Connection** to verify
5. Click **Backup Now** to create first backup
6. **Schedules** → Add schedule for automated backups

### Storage Destinations

**Local (default):**
- Backups stored in `./backups` directory
- Optional gzip compression

**Git Repository:**
- Go to **Destinations** → Add Git destination
- Enter repo URL and credentials
- Automatic commits on each backup

**Telegram:**
- Create bot via @BotFather
- Add Telegram destination with bot token and chat ID
- Files split automatically if >50MB

**SMB/CIFS:**
- Add SMB destination with share path and credentials
- Optional compression

### Automated Scheduling

```
Cron Examples:
0 2 * * *     → Daily at 2:00 AM
0 */6 * * *   → Every 6 hours
0 0 * * 0     → Weekly on Sunday at midnight
0 3 1 * *     → Monthly on 1st at 3:00 AM
```

---

## REST API

**Base URL:** `http://localhost:5005/api/v1`

**Authentication:** HTTP Basic Auth using an active database user and their current password. `AUTH_*` is used only to create the first admin.

**Rate Limit:** 30 requests/minute

### Examples

```bash
# Trigger backup
curl -X POST http://localhost:5005/api/v1/devices/1/backup -u admin:password

# Get backup history
curl http://localhost:5005/api/v1/backups?device_id=1 -u admin:password

# Add device
curl -X POST http://localhost:5005/api/v1/devices \
  -u admin:password \
  -H "Content-Type: application/json" \
  -d '{
    "name": "router-01",
    "hostname": "192.168.1.1",
    "device_type": "cisco_ios",
    "backup_engine": "netmiko",
    "credential_id": 1
  }'

# Get analytics
curl http://localhost:5005/api/v1/analytics/backup-trends?days=30 -u admin:password
```

**API Endpoints:** `/devices`, `/credentials`, `/backups`, `/jobs`, `/schedules`, `/destinations`, `/locations`, `/groups`, `/notifications`, `/analytics`

Full API documentation: [docs/API.md](docs/API.md)

---

## Technology Stack

| Component | Technology |
|-----------|-----------|
| Backend | FastAPI 0.115+, Python 3.11+, Uvicorn |
| Database | SQLite, SQLAlchemy 2.0+, Alembic |
| Scheduler | APScheduler 3.10+ |
| SSH/Network | Netmiko 4.4+, Paramiko, smbprotocol |
| Security | Fernet encryption, HMAC-SHA256 |
| Frontend | Bootstrap 5, HTMX, Jinja2, ApexCharts |
| Notifications | Apprise 1.9+ |
| Retention | grandfatherson (GFS) |

---

## Management

### Docker Commands

```bash
# Start
docker compose up -d

# Stop
docker compose down

# View logs
docker compose logs -f

# Restart
docker compose restart

# Update
git pull && docker compose up -d --build
```

### systemd Commands

```bash
# Status
sudo systemctl status hk-nova

# Start/Stop
sudo systemctl start hk-nova
sudo systemctl stop hk-nova

# Restart
sudo systemctl restart hk-nova

# Logs
sudo journalctl -u hk-nova -f

# Enable on boot
sudo systemctl enable hk-nova
```

---

## Troubleshooting

**Can't login:**
Use the current database password. `AUTH_PASSWORD` only seeds an empty users table.
An administrator can check account status in **Users**; change your own password in **Profile**.
Legacy sessions from before the RBAC upgrade require a fresh login.

**Port already in use:**
```bash
# Check what's using port 5005
sudo lsof -i :5005
# Kill the process or change PORT in .env
```

**Backup fails:**
```bash
# Test SSH manually
ssh username@device-ip

# Check device type matches actual device
# Verify credentials in web UI
```

**Database locked:**
```bash
# Stop application
docker compose down  # or: sudo systemctl stop hk-nova

# Remove lock files
rm -f data/hk-nova.db-shm data/hk-nova.db-wal

# Restart
docker compose up -d  # or: sudo systemctl start hk-nova
```

**Permission errors:**
```bash
# Docker
sudo chown -R 1000:1000 ./data ./backups ./ssh_keys

# systemd
sudo chown -R hk-nova:hk-nova /opt/hk-nova

# SSH keys
chmod 700 ssh_keys && chmod 600 ssh_keys/*
```

---

## Upgrade

### Docker
```bash
cd ~/hk-nova
docker compose down
git pull
docker compose up -d
```

### Local
```bash
cd ~/hk-nova
source .venv/bin/activate
git pull
pip install -r requirements.txt --upgrade
./run.sh
```

### systemd
```bash
sudo systemctl stop hk-nova
cd /opt/hk-nova && sudo git pull
sudo -u hk-nova /opt/hk-nova/.venv/bin/pip install -r requirements.txt --upgrade
sudo systemctl start hk-nova
```

---

## Uninstall

### Docker
```bash
cd ~/hk-nova
docker compose down -v
cd .. && rm -rf hk-nova
```

### Local
```bash
rm -rf ~/hk-nova
```

### systemd
```bash
sudo /opt/hk-nova/uninstall.sh
# Or manually:
sudo systemctl stop hk-nova
sudo systemctl disable hk-nova
sudo rm /etc/systemd/system/hk-nova.service
sudo userdel -r hk-nova
sudo rm -rf /opt/hk-nova
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [docs/TUTORIAL.md](docs/TUTORIAL.md) | Step-by-step tutorial |
| [docs/INSTALL.md](docs/INSTALL.md) | Detailed installation guide |
| [docs/CONFIGURATION.md](docs/CONFIGURATION.md) | Configuration reference |
| [docs/DEVICES.md](docs/DEVICES.md) | Device setup guides |
| [docs/API.md](docs/API.md) | REST API reference |
| [SECURITY.md](SECURITY.md) | Security hardening guide |
| [CHANGELOG.md](CHANGELOG.md) | Version history |

---

## Changelog

### v1.0.0 (2026-09-20) - Initial Release

**Core:**
- Multi-engine backup system (Netmiko, SCP, Oxidized, pfSense/OPNsense, Proxmox VE)
- Support for 20+ device types across 10+ vendors
- 5 storage destinations (Local, Git, SMB, Telegram)
- Automated scheduling with APScheduler
- GFS retention policy with daily maintenance

**Features:**
- Location management with auto-setup workflow
- Device groups with profile inheritance
- Configuration monitoring with drift detection
- SHA256 change detection with diff viewer
- Analytics dashboard with interactive charts
- Apprise notifications (80+ services)
- REST API with rate limiting
- SSH proxy/jump host support

**Security:**
- Fernet credential encryption
- Cookie-based auth with HMAC-SHA256
- Security headers (CSP, X-Frame-Options)
- Path traversal protection

**Technical:**
- FastAPI 0.115+ with async ASGI
- SQLAlchemy 2.0+ ORM
- SQLite database with Alembic migrations
- Bootstrap 5 dark theme with HTMX
- ApexCharts analytics

---

## Backup Failure Handling

HK-NOVA includes an intelligent **Smart Retry, Auto-Fix, and Diagnostic Dashboard** system to handle and troubleshoot backup errors automatically.

### 1. Smart Retry Mechanism
- **Exponential Backoff**: Base delay of 2 seconds (Attempt 1: 2s, Attempt 2: 4s, Attempt 3: 8s; max 60s).
- **Max Retries**: 3 attempts per destination (`BACKUP_RETRY_MAX_ATTEMPTS`).
- **Rate Limit Handling**: Respects HTTP 429 `Retry-After` header cooldown automatically.
- **Smart Fallback**: If all configured remote destinations fail, HK-NOVA automatically executes an emergency fallback save to Local Storage.

### 2. Error Classification
- **Retry Allowed (Transient)**:
  - `network_timeout`: Socket / HTTP read/connect timeouts.
  - `network_connection`: Connection refused, reset, unreachable route.
  - `rate_limit`: API rate limits (e.g. Telegram 429).
  - `temporary_unavailable`: 502/503/504 temporary gateway/service errors.
  - `smb_temporary`: Transient SMB pipe or network disconnects.
- **No Retry (Permanent)**:
  - `auth_failure`: Invalid credentials, 401 Unauthorized, SSH key rejected.
  - `permission_denied`: 403 Forbidden, lack of write access on SMB or disk.
  - `invalid_config`: Missing required config parameters or bad format (400).
  - `disk_full`: ENOSPC or storage quota exhausted.
  - `invalid_params`: Value/Type errors.

### 3. Auto-Fix Strategies
Before retrying transient errors, HK-NOVA attempts automated remediations:
- **Rate Limit (Telegram)**: Cooldown based on `Retry-After` response header.
- **Network Timeout**: Progressively doubles timeout (`current * 2.0`, capped at 300s).
- **Git Push Conflict**: Pulls latest remote changes before retrying push.
- **SMB Hostname Resolution**: Automatically resolves DNS hostnames to IPv4 if name lookup fails.

### 4. Diagnostic Dashboard & Root Cause Analysis
- **Dashboard URL**: `/diagnostics`
- **Features**:
  - Filter failures by timeframe (`24h`, `7d`, `30d`) and status (`unresolved`, `all`).
  - Summary metrics: total failures, affected devices, most common error %, auto-fix success rate.
  - Error distribution bar chart with severity color coding.
  - Device detail view (`/diagnostics/device/{id}`) with root cause analysis, step-by-step remediation guide with copyable commands, failure timeline, and auto-fix history.
  - Actions: **Retry Backup Now**, **Mark as Resolved**, and **Download Diagnostic JSON**.

---

## Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

**Development:**
```bash
git clone https://github.com/your-organization/hk-nova.git
cd hk-nova
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
pytest tests/
```

---

## License

MIT License - see [LICENSE](LICENSE) file for details.

---

## Support

- **Documentation:** [docs/](docs/)
- **Issues:** [GitHub Issues](https://github.com/your-organization/hk-nova/issues)
- **Discussions:** [GitHub Discussions](https://github.com/your-organization/hk-nova/discussions)

---

<p align="center">
  <sub>Built with FastAPI, SQLAlchemy, and Bootstrap</sub>
</p>

## User Management

HK-NOVA authenticates active users from the `users` database table for both the
web login and HTTP Basic API calls. The header shows your name and role; use
**Profile** (`/profile`) to change your password.

- **Admin:** full access, including `/users`, user APIs and destination deletion.
- **Operator:** daily operations, including creating/editing/deleting devices,
  credentials, schedules, backups, groups and notification channels; may create,
  edit and test destinations. Cannot manage users or delete destinations.
- **Viewer:** read-only dashboard, analytics, diagnostics, devices, backup contents,
  downloads, schedules and resource lists. Cannot run backups/tests/retries, resolve
  failures, modify resources, or open editing forms. Destination API configuration
  is omitted for viewers.

Destination deletion through a cascading location deletion also requires admin.
All roles may change their own password. Role/status changes apply on the next
request, including to existing sessions. Hidden buttons accompany server-side
permission checks; directly calling a forbidden route returns HTTP 403.

Admins manage accounts through **Users → Add User / Edit / Delete**. Usernames are
immutable, unique, and contain 3–50 ASCII letters, digits, underscores or dashes.
New and changed passwords require at least 8 characters and at most 72 UTF-8 bytes;
12+ characters are recommended. Passwords are stored only as bcrypt hashes.
You cannot deactivate, delete or demote yourself, or remove the last active admin.
Deactivate accounts when access should be suspended; user deletion is permanent.

User API endpoints (admin only) are `GET/POST /api/users` and
`GET/PUT/DELETE /api/users/{id}`. Create returns 201; delete returns 204; missing
users return 404; duplicate names and account-protection failures return 400;
invalid payloads return 422; forbidden access returns 403. Responses never include
passwords or their hashes. Updates accept `full_name`, `role`, and `is_active` only.

```bash
# curl prompts for the current admin password.
curl -u admin http://localhost:5005/api/users
curl -u admin -X PUT http://localhost:5005/api/users/2 \
  -H 'Content-Type: application/json' -d '{"role":"operator"}'
```

### Upgrade and bootstrap

From the project root:

```bash
source .venv/bin/activate
pip install -r requirements.txt
# Back up the configured database before upgrading.
alembic upgrade head
./start.sh  # or ./run.sh
```

Revision `l2m3n4o5p6q7` adds `users`; `m3n4o5p6q7r8` prevents reuse of deleted
SQLite user IDs so an old session cannot identify a newly created account. On startup, `init_db()` seeds one active admin
from `AUTH_USERNAME` / `AUTH_PASSWORD` **only when users is empty**. Defaults are
`admin` / `admin`; set a strong password before the first start and change it via
Profile afterwards. Restart never resets existing users. Editing `AUTH_*` or using
legacy environment-password scripts cannot change an existing account.

Existing installations retain their devices, backups and encrypted credentials.
A code deployment and restart are required; old session cookies are invalidated
by the new token format. Keep the same `SECRET_KEY` and database during upgrade.
Alembic reads `DATABASE_URL` from the environment or `.env`. This deployment uses
SQLite; legacy application migrations still limit full PostgreSQL support.
See [installation guidance](docs/INSTALL.md#inisialisasi-tabel-users) and
[security guidance](SECURITY.md).

### RBAC verification

```bash
python -m pytest tests/test_rbac.py -v
python -m pytest tests/ -v
```

HTTP tests use isolated temporary databases. See [RBAC verification notes](docs/RBAC.md)
for browser checks and implementation limits.
