# Changelog

All notable changes to HK-NOVA will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-09-21

### Initial Release

Network device configuration backup manager with automated scheduling and multi-vendor support.

#### Core Features
- **Multi-vendor support** - Cisco IOS/XE/XR/NX-OS, Nokia SR OS, Juniper JunOS, Arista EOS, HP/Aruba, Dell, MikroTik RouterOS, Brocade, pfSense, OPNsense, Proxmox VE (20+ device types)
- **5 backup engines** - Netmiko (SSH), SCP/SFTP, Oxidized REST API, pfSense/OPNsense API, Proxmox VE API
- **5 storage destinations** - Local filesystem, Git (GitHub/Gitea/Forgejo), SMB/CIFS, Telegram
- **Automated scheduling** - Cron-based jobs with APScheduler
- **Retention policies** - Grandfather-Father-Son (GFS) rotation with automated daily maintenance at 3:30 AM

#### Organization & Monitoring
- **Location management** - Physical site organization with auto-setup workflow (create location → auto-generate Telegram destination + device group)
- **Device groups** - Profile inheritance for destinations, backup engines, and notification channels
- **Configuration monitoring** - Lightweight drift detection with automatic backup trigger on configuration changes
- **Change detection** - SHA256 hash comparison with unified diff viewer
- **Backup history timeline** - Per-device history with "First / Changed / Unchanged" markers
- **Compare any two backups** - Unified diff viewer for arbitrary backup pairs
- **Analytics dashboard** - Interactive charts: backup trends (7/30/60/90 days), device status distribution, job success rates, storage growth, group-level insights, destination usage statistics

#### Integration & Notifications
- **Apprise notifications** - 80+ services supported (Slack, Discord, Telegram, email via Gmail/Outlook/SMTP relay)
- **Multi-channel Telegram** - Upload backups to multiple Telegram channels for departmental isolation with central visibility
- **REST API** - Full JSON API at `/api/v1/*` with rate limiting (30 req/min)
- **SSH Proxy / Jump Host** - Access remote devices through bastion hosts with separate proxy credentials
- **Import from Oxidized** - One-click device inventory import via REST API

#### Security
- **Encrypted credentials** - Fernet symmetric encryption at rest with SECRET_KEY self-test at startup
- **Cookie-based authentication** - 14-day sessions with HMAC-SHA256 signed tokens
- **Security headers** - Content-Security-Policy, X-Frame-Options: DENY, X-Content-Type-Options: nosniff
- **Path traversal protection** - Input validation and sanitization
- **Timing-safe comparisons** - Protection against timing attacks

#### User Interface
- **Web UI** - Bootstrap 5 dark theme with HTMX live updates
- **Responsive design** - Mobile-friendly with bottom navigation
- **Interactive charts** - ApexCharts with Day.js date formatting
- **Enhanced testing** - Multi-step destination validation with detailed diagnostics
- **Batch operations** - Select multiple devices/backups for bulk actions
- **Search & filter** - Advanced filtering on backups, devices, and job history
- **Pagination** - 10/25/50 items per page

#### Technical Stack
- **Backend** - FastAPI 0.115+, Python 3.11+, Uvicorn (ASGI)
- **Database** - SQLite with foreign key enforcement, Alembic migrations
- **ORM** - SQLAlchemy 2.0+
- **Scheduler** - APScheduler 3.10+ (async cron jobs)
- **SSH/Network** - Netmiko 4.4+ (multi-vendor), Paramiko (SSH/SCP), smbprotocol 1.16+
- **Git Integration** - GitPython (GitHub, Gitea, Forgejo)
- **HTTP Client** - httpx (async)
- **Notifications** - Apprise 1.9+
- **Validation** - Pydantic 2.0+ with pydantic-settings
- **Frontend** - Bootstrap 5, HTMX, Jinja2 templates, ApexCharts
- **Retention** - grandfatherson (GFS policy)
- **Deployment** - Docker + docker-compose, systemd service

#### Database Maintenance
- Automated daily maintenance job (3:30 AM):
  - Retention policy sweep
  - Stale backup cleanup
  - Job history purge (90 days)
  - Pruned record cleanup
  - SQLite VACUUM

---

## License

MIT License - Copyright (c) 2026 Hype Craft
