# HK-NOVA Quick Start Tutorial

Get from installation to automated backups in 10 minutes.

---

## Prerequisites

- Python 3.11+ or Docker
- Network access to devices you want to backup
- Device credentials (username/password or SSH key)
- For Telegram destination: Bot token from @BotFather (optional)

---

## Installation

### Option 1: Docker (Recommended)

1. **Create project directory:**
```bash
mkdir hk-nova && cd hk-nova
```

2. **Create docker-compose.yml:**
```yaml
version: '3.8'
services:
  hk-nova:
    image: your-registry/hk-nova:latest
    container_name: hk-nova
    ports:
      - "5005:5005"
    volumes:
      - ./data:/app/data
      - ./backups:/app/backups
    environment:
      - SECRET_KEY=your-32-char-secret-key-here
      - AUTH_PASSWORD=your-admin-password
      - TZ=Asia/Jakarta
    restart: unless-stopped
```

3. **Start the container:**
```bash
docker compose up -d
```

### Option 2: Local Installation

1. **Clone repository:**
```bash
git clone <your-repo-url>
cd hk-nova_2
```

2. **Configure environment:**
```bash
cp .env.example .env
nano .env  # Edit SECRET_KEY and AUTH_PASSWORD
```

3. **Run installer:**
```bash
chmod +x run.sh
./run.sh
```

The script will:
- Create Python virtual environment
- Install dependencies
- Initialize database
- Start the web server on port 5005

---

## First Steps

### 1. Login

1. Open browser to `http://localhost:5005` (or your server IP)
2. Default username: **admin**
3. Password: Value you set in `AUTH_PASSWORD` environment variable
4. Click **Login**

**Security Note:** Change default password immediately after first login via Settings.

### 2. Add Your First Credential

Credentials store authentication details for devices and are reusable across multiple devices.

1. Navigate to **Credentials** in the main menu
2. Click **Add Credential** button
3. Fill in the form:
   - **Name:** Descriptive name (e.g., "Network Admin Account")
   - **Username:** SSH username for your devices
   - **Password:** SSH password
   - **Enable Secret:** (Optional) For Cisco devices requiring enable mode
   - **SSH Key Path:** (Optional) Path to private key file instead of password
4. Click **Save**

Credentials are encrypted at rest using Fernet encryption.

### 3. Add Your First Device

1. Navigate to **Devices** → **Add Device**
2. Fill in device details:
   - **Hostname:** Display name (e.g., "core-switch-01")
   - **IP Address:** Management IP address
   - **Port:** SSH port (default: 22)
   - **Device Type:** Select from dropdown
     - Cisco IOS: `cisco_ios`
     - Cisco NX-OS: `cisco_nxos`
     - Nokia SR OS: `nokia_sros`
     - Arista EOS: `arista_eos`
     - Juniper JunOS: `juniper_junos`
     - MikroTik: `mikrotik_routeros`
     - See [docs/DEVICES.md](DEVICES.md) for full list
   - **Backup Engine:** 
     - **Netmiko** (recommended for most devices)
     - **SCP** (for devices with SCP file transfer)
     - **Oxidized** (if you have Oxidized instance)
     - **pfSense** (for pfSense/OPNsense firewalls)
     - **Proxmox** (for Proxmox VE hosts)
   - **Credential:** Select credential created in step 2
3. Click **Test Connection** to verify connectivity
   - Green success message: Device is reachable
   - Red error message: Check IP, credentials, network connectivity
4. Click **Save**

### 4. Configure a Destination

Destinations define where backups are stored. A local destination is pre-configured.

**View default local destination:**
1. Navigate to **Destinations**
2. You'll see "Local Backups" already configured
3. Default path: `/app/backups` (Docker) or `./backups` (local install)

**Optional: Add additional destinations**

**Git (GitHub/Gitea/Forgejo):**
1. Click **Add Destination**
2. Select type: **Git**
3. Configure:
   - Repository path
   - Remote URL (optional)
   - Authentication method (token, SSH key, or none)
4. Click **Save**

**SMB/CIFS (Network Share):**
1. Click **Add Destination**
2. Select type: **SMB**
3. Configure:
   - Server address
   - Share name
   - Username/password
   - Domain (optional)
4. Click **Test** to verify connectivity
5. Click **Save**

**Telegram:**
See [docs/TELEGRAM_DESTINATION.md](TELEGRAM_DESTINATION.md) for complete setup guide.

### 5. Manual Backup Test

Test backup functionality before setting up automation.

1. Navigate to **Devices**
2. Find your device in the list
3. Click the **backup icon** (floppy disk) next to device name
4. In the modal:
   - Select destination(s) where backup should be stored
   - Multiple destinations can be selected
5. Click **Run Backup**
6. Wait for completion (usually 5-30 seconds)
7. View result:
   - Green: Success
   - Red: Failure (click to see error details)

**View backup content:**
1. Navigate to **Backups**
2. Find your recent backup
3. Click **View** to see configuration text
4. Configuration is timestamped and includes hash for change detection

### 6. Schedule Automated Backups

Set up recurring backups to run automatically.

1. Navigate to **Jobs** → **Schedules**
2. Click **Add Schedule**
3. Configure schedule:
   - **Name:** Descriptive name (e.g., "Daily Network Backup")
   - **Cron Expression:** Define timing
     - Daily at 2 AM: `0 2 * * *`
     - Every 6 hours: `0 */6 * * *`
     - Weekly Sunday 3 AM: `0 3 * * 0`
     - Hourly: `0 * * * *`
   - **Enabled:** Check to activate
   - **Devices:** Select which devices to backup
     - All devices
     - Specific device group
     - Individual devices
   - **Destinations:** Select where to store backups
     - Local filesystem
     - Git repository
     - SMB share
     - Telegram channel
     - Multiple destinations simultaneously
   - **Notifications:** (Optional) Select notification channels for alerts
4. Click **Save**

**Next run time** is displayed on the dashboard and schedules page.

### 7. View Backup History

Monitor backup activity and compare configurations.

**Recent backups:**
1. Navigate to **Dashboard**
2. **Recent Backups** section shows last 10 backups with status

**Full backup history:**
1. Navigate to **Backups**
2. View all backups with:
   - Device name
   - Timestamp
   - Status (success/failure)
   - Configuration hash
   - Destination(s)
   - Size
3. **Search** by device name
4. **Filter** by status (success/failed/all)

**Per-device history:**
1. Go to **Devices**
2. Click device name
3. View timeline of all backups for that device
4. See "First / Changed / Unchanged" markers based on config hash

**Compare configurations:**
1. Navigate to **Backups** → **Device History**
2. Select two backups using checkboxes
3. Click **Compare**
4. View unified diff showing exact configuration changes

---

## Common Cron Examples

| Schedule | Cron Expression | Use Case |
|----------|----------------|----------|
| Daily at 2 AM | `0 2 * * *` | Standard daily backup |
| Every 6 hours | `0 */6 * * *` | High-frequency backup |
| Twice daily (2 AM, 2 PM) | `0 2,14 * * *` | Business hours coverage |
| Weekly Sunday 3 AM | `0 3 * * 0` | Weekly snapshot |
| Monthly (1st, 3 AM) | `0 3 1 * *` | Monthly archive |
| Hourly | `0 * * * *` | Critical infrastructure |
| Every 15 minutes | `*/15 * * * *` | Real-time monitoring |

**Cron format:** `minute hour day month weekday`
- Minute: 0-59
- Hour: 0-23 (24-hour format)
- Day: 1-31
- Month: 1-12
- Weekday: 0-7 (0 and 7 = Sunday)

---

## Next Steps

### Organize Devices

**Device Groups:**
- Create groups for departments, locations, or device types
- Navigate to **Groups** → **Add Group**
- Groups can define default destinations and notification channels
- Devices inherit group settings

**Locations:**
- Organize devices by physical site
- Navigate to **Locations** → **Add Location**
- Auto-generates Telegram destination + device group
- See [docs/LOCATION_MANAGEMENT.md](LOCATION_MANAGEMENT.md) for details

### Configure Notifications

Get alerts when backups succeed or fail.

1. Navigate to **Notifications**
2. Click **Add Notification Channel**
3. Choose service:
   - **Slack:** Webhook URL
   - **Discord:** Webhook URL
   - **Telegram:** Bot token + chat ID
   - **Email:** SMTP settings (Gmail, Outlook, corporate relay)
4. Click **Test** to verify
5. Add notification channel to backup schedules

See [docs/CONFIGURATION.md](CONFIGURATION.md) for email setup examples.

### Enable Analytics

Track backup trends and system health.

1. Navigate to **Analytics** → **Dashboard**
2. View charts:
   - Backup trends over time
   - Success rate metrics
   - Storage growth
   - Device status distribution
   - Group analytics

See [docs/ANALYTICS.md](ANALYTICS.md) for detailed guide.

### Use REST API

Automate operations via API.

**Example: Trigger backup via curl**
```bash
curl -X POST http://localhost:5005/api/v1/backups/trigger \
  -H "Content-Type: application/json" \
  -u admin:your-password \
  -d '{"device_ids": [1,2,3], "destination_ids": [1]}'
```

**Example: Get backup history**
```bash
curl -u admin:your-password \
  http://localhost:5005/api/v1/backups?limit=50
```

See [docs/API.md](API.md) for complete API reference.

### Advanced Features

**SSH Proxy / Jump Host:**
- Access devices through bastion hosts
- Configure in device edit form
- See [docs/DEVICES.md](DEVICES.md) for setup

**Config Monitoring:**
- Automatic change detection
- Triggers backup only when config changes
- Reduces unnecessary backups

**Multi-Destination:**
- Backup to multiple destinations simultaneously
- Example: Local + Git + Telegram
- Provides redundancy

**Import from Oxidized:**
- If you have existing Oxidized setup
- Navigate to **Devices** → **Import from Oxidized**
- One-click device inventory import

---

## Troubleshooting

### "No authentication methods available"

**Cause:** Credential missing both password and SSH key path

**Solution:**
1. Edit credential
2. Add either password or SSH key path
3. Save and test connection

### "Device unreachable"

**Cause:** Network connectivity issue

**Solution:**
1. Verify device IP address is correct
2. Check SSH port (default 22)
3. Test manual SSH: `ssh username@device-ip`
4. Verify firewall rules allow SSH
5. Check device is powered on and accessible

### "Enable mode failed" (Cisco devices)

**Cause:** Enable secret not configured

**Solution:**
1. Edit credential
2. Add **Enable Secret** value
3. Save credential
4. Retry backup

### "Authentication failed"

**Cause:** Incorrect username or password

**Solution:**
1. Verify credentials with manual SSH test
2. Check for account lockout on device
3. Update credential with correct values
4. For SSH key auth, verify key path and permissions

### SMB "Access denied"

**Cause:** Incorrect username format or permissions

**Solution:**
1. Try different username formats:
   - `DOMAIN\username`
   - `username@domain.com`
   - `username` (local account)
2. Verify share permissions on SMB server
3. Test SMB connection manually from server
4. Check domain/workgroup settings

### Telegram "Chat not found"

**Cause:** Bot not admin in channel or incorrect chat ID

**Solution:**
1. Add bot to channel
2. Promote bot to admin
3. Get correct chat ID (negative number for channels)
4. See [docs/TELEGRAM_DESTINATION.md](TELEGRAM_DESTINATION.md)

### Database errors after upgrade

**Cause:** Migration not applied

**Solution:**
```bash
# Docker
docker compose exec hk-nova alembic upgrade head

# Local
cd hk-nova_2
source .venv/bin/activate
alembic upgrade head
```

### "SECRET_KEY mismatch" warning

**Cause:** SECRET_KEY changed, existing credentials can't be decrypted

**Solution:**
1. Restore original SECRET_KEY from backup `.env`
2. If lost, credentials must be re-entered
3. See SECURITY.md for recovery steps

---

## Getting Help

**Documentation:**
- Installation: [docs/INSTALL.md](INSTALL.md)
- Configuration: [docs/CONFIGURATION.md](CONFIGURATION.md)
- Device setup: [docs/DEVICES.md](DEVICES.md)
- API reference: [docs/API.md](API.md)
- Security: [SECURITY.md](../SECURITY.md)

**Logs:**
- Docker: `docker compose logs -f hk-nova`
- Local: Check terminal output where `run.sh` was executed

**Support:**
- Check documentation first
- Review error messages carefully
- Report issues on GitHub repository
