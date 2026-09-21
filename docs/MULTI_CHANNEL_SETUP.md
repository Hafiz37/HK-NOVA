# Multi-Channel Telegram Backup Setup Guide

## 📋 Overview

Guide ini menjelaskan cara setup multiple Telegram channels untuk backup network devices dengan requirement:
- **Device berbeda** → **Channel berbeda**
- **Semua device** → **Channel utama** (monitoring pusat)
- **Departmental isolation** untuk access control

---

## 🎯 Use Cases

### Scenario 1: Departmental Separation
```
Network Team Devices (A,B,C) → Network Channel + Main Channel
Security Team Devices (D,E,F) → Security Channel + Main Channel
Server Team Devices (G,H,I) → Server Channel + Main Channel
```

### Scenario 2: Location-Based
```
HQ Devices → HQ Channel + Main Channel
Branch Office 1 → Branch1 Channel + Main Channel
Branch Office 2 → Branch2 Channel + Main Channel
```

### Scenario 3: Criticality-Based
```
Critical Infrastructure → Critical Channel + Main Channel
Standard Equipment → Standard Channel + Main Channel
Lab/Test Devices → Test Channel + Main Channel
```

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────────────────┐
│              TELEGRAM BOT (HK-NOVA Backup Bot)               │
│              Token: 123456789:ABCdef...                      │
└──────────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┬─────────────┐
        │                   │                   │             │
        ▼                   ▼                   ▼             ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│ Main Channel │   │ Network Chan │   │ Security Chan│   │ Server Chan  │
│ (All Backup) │   │  (A,B,C)     │   │  (D,E,F)     │   │  (G,H,I)     │
│ Chat: -100111│   │ Chat: -100222│   │ Chat: -100333│   │ Chat: -100444│
└──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘
        ▲                   ▲                   ▲             ▲
        │                   │                   │             │
        └───────┬───────────┴───────┬───────────┴─────┬───────┘
                │                   │                 │
        ┌───────┴────────┐  ┌───────┴────────┐  ┌────┴────────┐
        │ Group: network │  │ Group: security│  │ Group: server│
        │ Dest: [1,2,3]  │  │ Dest: [1,2,4]  │  │ Dest: [1,2,5]│
        └────────────────┘  └────────────────┘  └───────────────┘
                │                   │                 │
        ┌───────┴────────┐  ┌───────┴────────┐  ┌────┴────────┐
        │Device A,B,C    │  │Device D,E,F    │  │Device G,H,I  │
        │router-core-01  │  │firewall-edge   │  │proxmox-host  │
        │switch-dist-01  │  │vpn-gateway     │  │linux-srv-01  │
        └────────────────┘  └────────────────┘  └───────────────┘
```

**Flow:**
1. Device backup triggered
2. System checks device's group
3. Group has list of destination IDs
4. System uploads to ALL destinations in parallel
5. Each Telegram destination = 1 channel

---

## 📝 Prerequisites

### 1. Telegram Requirements
- Telegram account
- Ability to create channels
- Admin rights on channels

### 2. System Requirements
- HK-NOVA v1.7.0+ (with Telegram destination)
- Database access (sqlite3)
- Network devices already added to HK-NOVA

### 3. Knowledge Requirements
- Basic SQL
- Understanding of Telegram channels
- HK-NOVA groups concept

---

## 🚀 Step-by-Step Implementation

## PHASE 1: Plan Your Channel Structure

### Step 1.1: Define Your Channels

**Main Channel (Required):**
- **Purpose:** Central monitoring for all backups
- **Members:** IT management, senior admins
- **Privacy:** Private
- **Name:** `HK-NOVA - All Backups`

**Departmental Channels (Optional, but recommended):**

| Channel Name | Purpose | Members | Devices |
|--------------|---------|---------|---------|
| HK-NOVA - Network Team | Network device backups | Network engineers | Routers, switches |
| HK-NOVA - Security Team | Security device backups | Security team | Firewalls, IDS/IPS |
| HK-NOVA - Server Team | Server backups | System admins | Proxmox, Linux |
| HK-NOVA - Remote Sites | Branch office devices | Site admins | Branch devices |

### Step 1.2: Map Devices to Channels

Create mapping document:

```
Channel Mapping Plan:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Main Channel (All Devices):
  - ALL devices backup here
  - Full visibility for management

Network Channel:
  Group: network-team
  Devices:
    - router-core-01 (192.168.1.1)
    - router-core-02 (192.168.1.2)
    - switch-dist-01 (192.168.2.1)
    - switch-access-* (multiple)

Security Channel:
  Group: security-team
  Devices:
    - firewall-edge (192.168.1.254)
    - vpn-gateway (192.168.1.253)
    - ids-sensor (192.168.3.10)

Server Channel:
  Group: server-team
  Devices:
    - proxmox-host-01 (192.168.10.1)
    - linux-srv-01 (192.168.10.10)
    - linux-srv-02 (192.168.10.11)
```

**Save this mapping** - you'll reference it during setup.

---

## PHASE 2: Setup Telegram Bot & Channels

### Step 2.1: Create Telegram Bot

1. Open Telegram, search **@BotFather**
2. Send: `/newbot`
3. Set name: `HK-NOVA Backup Bot`
4. Set username: `hknova_backup_bot` (must be unique, try variations if taken)
5. **SAVE the bot token:**
   ```
   Bot Token: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz
   ```

### Step 2.2: Create Main Channel

1. In Telegram: New Channel
2. **Name:** `HK-NOVA - All Backups`
3. **Description:**
   ```
   Central monitoring for all HK-NOVA device backups.
   All devices from all departments report here.
   ```
4. **Type:** Private
5. **Add bot as administrator:**
   - Channel Settings → Administrators → Add Administrator
   - Search: `@hknova_backup_bot`
   - Permissions: ✅ Post Messages, ✅ Delete Messages
   - Save

### Step 2.3: Create Departmental Channels

Repeat for each department:

**Network Channel:**
```
Name: HK-NOVA - Network Team
Description: Network infrastructure device backups (routers, switches)
Type: Private
Members: Add network team members
Bot: Add @hknova_backup_bot as admin
```

**Security Channel:**
```
Name: HK-NOVA - Security Team
Description: Security device backups (firewalls, VPN, IDS)
Type: Private
Members: Add security team members
Bot: Add @hknova_backup_bot as admin
```

**Server Channel:**
```
Name: HK-NOVA - Server Team
Description: Server infrastructure backups (Proxmox, Linux)
Type: Private
Members: Add server team members
Bot: Add @hknova_backup_bot as admin
```

### Step 2.4: Get Chat IDs for All Channels

**Method 1: Via Browser**

For EACH channel:

1. Send a test message to the channel (e.g., "Test - getting chat ID")
2. Open browser and visit:
   ```
   https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates
   ```
3. Find in the JSON response:
   ```json
   {
     "message": {
       "chat": {
         "id": -1001234567890,
         "title": "HK-NOVA - All Backups",
         "type": "channel"
       }
     }
   }
   ```
4. **Copy the negative number** (including the minus sign)

**Method 2: Using Python Script**

Save as `get_telegram_chat_ids.py`:

```python
import requests
import sys

def get_updates(bot_token):
    url = f"https://api.telegram.org/bot{bot_token}/getUpdates"
    response = requests.get(url)
    
    if response.status_code != 200:
        print(f"Error: {response.status_code}")
        return
    
    data = response.json()
    
    if not data.get('result'):
        print("No messages found. Send a message to your channels first!")
        return
    
    print("Found Chat IDs:")
    print("=" * 60)
    
    seen_chats = set()
    for update in data['result']:
        if 'channel_post' in update:
            chat = update['channel_post']['chat']
            chat_id = chat['id']
            chat_title = chat.get('title', 'Unknown')
            
            if chat_id not in seen_chats:
                print(f"Channel: {chat_title}")
                print(f"Chat ID: {chat_id}")
                print("-" * 60)
                seen_chats.add(chat_id)

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python get_telegram_chat_ids.py <BOT_TOKEN>")
        sys.exit(1)
    
    bot_token = sys.argv[1]
    get_updates(bot_token)
```

Run:
```bash
python get_telegram_chat_ids.py 123456789:ABCdefGHIjklMNOpqrsTUVwxyz
```

**Document all Chat IDs:**

```
Chat ID Mapping:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Bot Token: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz

Main Channel:    -1001111111111  (HK-NOVA - All Backups)
Network Channel: -1002222222222  (HK-NOVA - Network Team)
Security Channel: -1003333333333  (HK-NOVA - Security Team)
Server Channel:   -1004444444444  (HK-NOVA - Server Team)
```

⚠️ **IMPORTANT:** Keep this information secure! Treat chat IDs like passwords.

---

## PHASE 3: Configure HK-NOVA Database

### Step 3.1: Backup Current Database

```bash
cd /home/gopal-ichiro/Documents/magang/hk-nova_2
cp hk-nova.db hk-nova.db.backup-$(date +%Y%m%d-%H%M%S)
```

### Step 3.2: Create Telegram Destinations

**Connect to database:**
```bash
sqlite3 hk-nova.db
```

**Insert destinations:**
```sql
-- 1. Main Channel (All Backups)
INSERT INTO destinations (name, dest_type, enabled, config_json) 
VALUES (
  'Telegram - Main (All Backups)',
  'telegram',
  1,
  '{"bot_token": "123456789:ABCdefGHIjklMNOpqrsTUVwxyz", "chat_id": "-1001111111111", "compress": false, "max_file_size_mb": 45}'
);

-- 2. Network Team Channel
INSERT INTO destinations (name, dest_type, enabled, config_json) 
VALUES (
  'Telegram - Network Team',
  'telegram',
  1,
  '{"bot_token": "123456789:ABCdefGHIjklMNOpqrsTUVwxyz", "chat_id": "-1002222222222", "compress": false, "max_file_size_mb": 45}'
);

-- 3. Security Team Channel
INSERT INTO destinations (name, dest_type, enabled, config_json) 
VALUES (
  'Telegram - Security Team',
  'telegram',
  1,
  '{"bot_token": "123456789:ABCdefGHIjklMNOpqrsTUVwxyz", "chat_id": "-1003333333333", "compress": false, "max_file_size_mb": 45}'
);

-- 4. Server Team Channel
INSERT INTO destinations (name, dest_type, enabled, config_json) 
VALUES (
  'Telegram - Server Team',
  'telegram',
  1,
  '{"bot_token": "123456789:ABCdefGHIjklMNOpqrsTUVwxyz", "chat_id": "-1004444444444", "compress": false, "max_file_size_mb": 45}'
);
```

**Verify:**
```sql
SELECT id, name, dest_type, enabled FROM destinations ORDER BY id;
```

**Expected output:**
```
1|Local Storage|local|1
2|Telegram - Main (All Backups)|telegram|1
3|Telegram - Network Team|telegram|1
4|Telegram - Security Team|telegram|1
5|Telegram - Server Team|telegram|1
```

**Note the IDs** - you'll need them for groups configuration:
- Local = 1
- Main Channel = 2
- Network Channel = 3
- Security Channel = 4
- Server Channel = 5

### Step 3.3: Create/Update Groups

**Check existing groups:**
```sql
SELECT * FROM groups;
```

**Create groups with multi-channel destinations:**

```sql
-- Group 1: Network Team
-- Destinations: Local + Main + Network
INSERT OR REPLACE INTO groups (name, description, destination_ids, backup_engine) 
VALUES (
  'network-team',
  'Network infrastructure devices (routers, switches, etc.)',
  '[1, 2, 3]',
  'netmiko'
);

-- Group 2: Security Team
-- Destinations: Local + Main + Security
INSERT OR REPLACE INTO groups (name, description, destination_ids, backup_engine) 
VALUES (
  'security-team',
  'Security devices (firewalls, VPN gateways, IDS)',
  '[1, 2, 4]',
  'netmiko'
);

-- Group 3: Server Team
-- Destinations: Local + Main + Server
INSERT OR REPLACE INTO groups (name, description, destination_ids, backup_engine) 
VALUES (
  'server-team',
  'Server infrastructure (Proxmox, Linux servers)',
  '[1, 2, 5]',
  'netmiko'
);

-- Optional: Update default group to use Main channel
UPDATE groups 
SET destination_ids = '[1, 2]'
WHERE name = 'default';
```

**Verify:**
```sql
SELECT name, destination_ids, description FROM groups;
```

**Expected output:**
```
default|[1, 2]|Default group
network-team|[1, 2, 3]|Network infrastructure devices
security-team|[1, 2, 4]|Security devices
server-team|[1, 2, 5]|Server infrastructure
```

### Step 3.4: Assign Devices to Groups

**View current devices:**
```sql
SELECT id, hostname, ip_address, device_type, group FROM devices;
```

**Assign by device type (automatic):**
```sql
-- Network devices
UPDATE devices 
SET group = 'network-team'
WHERE device_type IN (
  'cisco_ios', 
  'cisco_nxos', 
  'cisco_xe',
  'juniper_junos',
  'arista_eos',
  'hp_procurve',
  'ruckus_fastiron'
);

-- Security devices
UPDATE devices 
SET group = 'security-team'
WHERE device_type IN (
  'pfsense',
  'opnsense',
  'fortinet'
);

-- Server devices
UPDATE devices 
SET group = 'server-team'
WHERE device_type IN (
  'proxmox',
  'linux'
);
```

**Or assign manually by hostname:**
```sql
-- Network Team
UPDATE devices SET group = 'network-team'
WHERE hostname IN (
  'router-core-01',
  'router-core-02',
  'switch-dist-01',
  'switch-access-01'
);

-- Security Team
UPDATE devices SET group = 'security-team'
WHERE hostname IN (
  'firewall-edge',
  'vpn-gateway-01',
  'ids-sensor'
);

-- Server Team
UPDATE devices SET group = 'server-team'
WHERE hostname IN (
  'proxmox-host-01',
  'linux-srv-01',
  'linux-srv-02'
);
```

**Verify assignment:**
```sql
SELECT 
  d.group,
  COUNT(d.id) as device_count,
  GROUP_CONCAT(d.hostname) as devices
FROM devices d
WHERE d.enabled = 1
GROUP BY d.group;
```

Exit sqlite:
```sql
.quit
```

---

## PHASE 4: Testing

### Step 4.1: Test Single Device Backup

**Test Network Team Device:**

```bash
cd /home/gopal-ichiro/Documents/magang/hk-nova_2
source .venv/bin/activate

python3 << 'EOF'
import asyncio
from app.database import SessionLocal
from app.models.device import Device
from app.modules.backup_service import run_backup_for_device

async def test_backup():
    db = SessionLocal()
    
    # Get a network-team device
    device = db.query(Device).filter(
        Device.group == 'network-team',
        Device.enabled == True
    ).first()
    
    if not device:
        print("No enabled device found in network-team group")
        return
    
    print(f"Testing backup for: {device.hostname}")
    print(f"Group: {device.group}")
    print(f"Expected destinations: Local + Main Channel + Network Channel")
    print("\nStarting backup...")
    
    backup = await run_backup_for_device(db, device)
    
    print(f"\nBackup Result:")
    print(f"  Status: {backup.status}")
    print(f"  Destinations: {backup.destination_type}")
    print(f"  Path: {backup.destination_path}")
    
    if backup.status == 'success':
        print("\n✅ Backup successful!")
        print("\nCheck Telegram channels:")
        print("  1. Main Channel - should see backup")
        print("  2. Network Channel - should see backup")
        print("  3. Security Channel - should NOT see backup")
        print("  4. Server Channel - should NOT see backup")
    else:
        print(f"\n❌ Backup failed: {backup.error_message}")
    
    db.close()

asyncio.run(test_backup())
EOF
```

### Step 4.2: Verify in Telegram

Open each channel and verify:

**Main Channel:**
✅ Should show backup from network device

**Network Channel:**
✅ Should show same backup

**Security Channel:**
❌ Should be empty (no network device backups)

**Server Channel:**
❌ Should be empty (no network device backups)

### Step 4.3: Test All Groups

**Create comprehensive test script:**

Save as `test_multi_channel.py`:

```python
import asyncio
from app.database import SessionLocal
from app.models.device import Device
from app.modules.backup_service import run_backup_for_device

async def test_all_groups():
    db = SessionLocal()
    
    groups_to_test = ['network-team', 'security-team', 'server-team']
    
    for group_name in groups_to_test:
        print(f"\n{'='*60}")
        print(f"Testing Group: {group_name}")
        print('='*60)
        
        device = db.query(Device).filter(
            Device.group == group_name,
            Device.enabled == True
        ).first()
        
        if not device:
            print(f"⚠️  No enabled device in {group_name}")
            continue
        
        print(f"Device: {device.hostname} ({device.ip_address})")
        print(f"Type: {device.device_type}")
        
        try:
            backup = await run_backup_for_device(db, device)
            
            if backup.status == 'success':
                print(f"✅ Backup successful")
                print(f"   Destinations: {backup.destination_type}")
            else:
                print(f"❌ Backup failed: {backup.error_message}")
        
        except Exception as e:
            print(f"❌ Error: {e}")
    
    db.close()
    
    print(f"\n{'='*60}")
    print("Testing Complete!")
    print('='*60)
    print("\nVerification Checklist:")
    print("  [ ] Main Channel has 3 backups (one from each group)")
    print("  [ ] Network Channel has 1 backup (network-team only)")
    print("  [ ] Security Channel has 1 backup (security-team only)")
    print("  [ ] Server Channel has 1 backup (server-team only)")
    print("\n✅ All channels should be isolated except Main")

asyncio.run(test_all_groups())
```

Run:
```bash
python test_multi_channel.py
```

### Step 4.4: Test Search Functionality

In each Telegram channel, test searches:

**In Main Channel:**
- Search `#backup` → should find all backups
- Search `#network_team` → only network devices
- Search `#security_team` → only security devices

**In Network Channel:**
- Search `#backup` → only network backups
- Search `#router_core_01` → specific device

**In Security Channel:**
- Search `#backup` → only security backups
- Search `#firewall` → firewall backups

---

## PHASE 5: Production Rollout

### Step 5.1: Update Documentation

Create internal wiki page or document:

```markdown
# HK-NOVA Multi-Channel Telegram Backup

## Channel Access

| Channel | Purpose | Access |
|---------|---------|--------|
| Main Channel | All device backups | IT Management only |
| Network Channel | Network team devices | Network engineers |
| Security Channel | Security devices | Security team |
| Server Channel | Server infrastructure | System administrators |

## Device Groups

| Group | Devices | Channels |
|-------|---------|----------|
| network-team | Routers, switches | Main + Network |
| security-team | Firewalls, VPN | Main + Security |
| server-team | Servers, Proxmox | Main + Server |

## Searching Backups

Use hashtags in Telegram search:
- `#backup` - All backups in current channel
- `#<hostname>` - Specific device (e.g., #router_core_01)
- `#<group>` - Group devices (e.g., #network_team)
- `#<type>` - Device type (e.g., #cisco_ios)
- `#<date>` - Date (e.g., #2026_09_15)

## Support

Contact: IT Admin Team
```

### Step 5.2: Configure Scheduled Jobs

**Via Web UI:**

1. Login to HK-NOVA
2. Go to **Jobs** page
3. Create/Edit job:
   - **Job Name:** Daily Network Backup
   - **Schedule:** `0 2 * * *` (2 AM daily)
   - **Devices:** Select all network-team devices
   - **Destinations:** Leave empty (use group defaults)
   - **Engine:** netmiko
4. Save

System will automatically use group's destination configuration.

**Verify job configuration:**
```sql
SELECT 
  j.name,
  j.schedule,
  j.enabled,
  COUNT(jd.device_id) as device_count
FROM jobs j
LEFT JOIN job_devices jd ON j.id = jd.job_id
GROUP BY j.id;
```

### Step 5.3: Monitor Initial Days

**First Week Checklist:**

Day 1:
- [ ] Verify all scheduled jobs run successfully
- [ ] Check Main Channel receives all backups
- [ ] Verify departmental channels get correct backups

Day 3:
- [ ] Confirm search functionality works
- [ ] Check file sizes and compression
- [ ] Verify hashtags are correct

Day 7:
- [ ] Review backup success rate
- [ ] Check for any errors in logs
- [ ] Collect user feedback from team members

**Monitor logs:**
```bash
tail -f server.log | grep -i telegram
```

---

## 📊 Verification & Troubleshooting

### Verification Queries

**1. Check destination configuration:**
```sql
SELECT 
  d.id,
  d.name,
  d.dest_type,
  d.enabled,
  json_extract(d.config_json, '$.chat_id') as chat_id
FROM destinations d
WHERE d.dest_type = 'telegram'
ORDER BY d.id;
```

**2. Check group-destination mapping:**
```sql
SELECT 
  g.name as group_name,
  g.destination_ids,
  COUNT(d.id) as device_count,
  GROUP_CONCAT(d.hostname) as sample_devices
FROM groups g
LEFT JOIN devices d ON d.group = g.name AND d.enabled = 1
GROUP BY g.name;
```

**3. Check recent backups by destination:**
```sql
SELECT 
  b.destination_type,
  COUNT(*) as backup_count,
  SUM(CASE WHEN b.status = 'success' THEN 1 ELSE 0 END) as success_count,
  MAX(b.timestamp) as last_backup
FROM backups b
WHERE b.timestamp > datetime('now', '-7 days')
GROUP BY b.destination_type;
```

**4. Device distribution by group:**
```sql
SELECT 
  d.group,
  d.device_type,
  COUNT(*) as count
FROM devices d
WHERE d.enabled = 1
GROUP BY d.group, d.device_type
ORDER BY d.group, d.device_type;
```

### Common Issues & Solutions

#### Issue 1: Backup not appearing in departmental channel

**Symptoms:**
- Backup appears in Main Channel
- Missing from departmental channel

**Diagnosis:**
```sql
-- Check device's group
SELECT hostname, group FROM devices WHERE hostname = 'problem-device';

-- Check group's destinations
SELECT name, destination_ids FROM groups WHERE name = 'device-group';

-- Check if destination is enabled
SELECT id, name, enabled FROM destinations WHERE id IN (...);
```

**Solutions:**
1. Verify device is in correct group
2. Verify group has correct destination_ids
3. Verify destination is enabled
4. Check bot is admin in channel

#### Issue 2: Bot "Unauthorized" Error

**Symptoms:**
- Logs show "401 Unauthorized"
- Backup fails for Telegram destinations

**Diagnosis:**
```bash
# Test bot token manually
curl -X GET "https://api.telegram.org/bot<TOKEN>/getMe"
```

**Solutions:**
1. Regenerate bot token via @BotFather
2. Update all Telegram destinations with new token:
```sql
UPDATE destinations 
SET config_json = json_set(
  config_json, 
  '$.bot_token', 
  'NEW_TOKEN_HERE'
)
WHERE dest_type = 'telegram';
```

#### Issue 3: Bot "Chat not found" Error

**Symptoms:**
- Logs show "400 Bad Request: chat not found"
- Specific channel failing

**Diagnosis:**
1. Verify bot is still in channel
2. Check chat_id is correct

**Solutions:**
1. Re-add bot to channel as admin
2. Get new chat_id via getUpdates
3. Update destination config:
```sql
UPDATE destinations 
SET config_json = json_set(
  config_json,
  '$.chat_id',
  'NEW_CHAT_ID'
)
WHERE name = 'Telegram - Channel Name';
```

#### Issue 4: Message "File too large"

**Symptoms:**
- Large configs fail to upload
- Error: "Request Entity Too Large"

**Solutions:**
1. Enable compression:
```sql
UPDATE destinations 
SET config_json = json_set(
  config_json,
  '$.compress',
  1
)
WHERE dest_type = 'telegram';
```

2. Or lower split size:
```sql
UPDATE destinations 
SET config_json = json_set(
  config_json,
  '$.split_size_mb',
  30
)
WHERE dest_type = 'telegram';
```

#### Issue 5: Duplicate Messages

**Symptoms:**
- Same backup appears multiple times in channel

**Diagnosis:**
```sql
-- Check if destination appears multiple times in group
SELECT name, destination_ids FROM groups;
```

**Solution:**
- Remove duplicate destination ID from group configuration

#### Issue 6: Wrong Channel Receiving Backups

**Symptoms:**
- Network backup appears in Security channel

**Diagnosis:**
```sql
-- Trace the configuration
SELECT 
  d.hostname,
  d.group,
  g.destination_ids,
  dest.name as destination_name
FROM devices d
JOIN groups g ON g.name = d.group
JOIN destinations dest ON json_extract(g.destination_ids, '$[*]')
WHERE d.hostname = 'problem-device';
```

**Solution:**
- Verify group has correct destination_ids
- Check device is assigned to correct group

### Debug Mode

Enable detailed logging:

**1. Edit .env:**
```bash
LOG_LEVEL=DEBUG
```

**2. Restart:**
```bash
./manage.sh restart
```

**3. Watch Telegram-specific logs:**
```bash
tail -f server.log | grep -i telegram
```

**4. Check upload attempts:**
```bash
grep "Telegram: Uploading" server.log | tail -20
```

---

## 🔒 Security Best Practices

### 1. Bot Token Security

**DO:**
- ✅ Keep bot token in database (encrypted)
- ✅ Use same bot for all channels (easier to manage)
- ✅ Rotate token every 6 months
- ✅ Never commit token to git

**DON'T:**
- ❌ Share bot token publicly
- ❌ Use bot token in URLs or logs
- ❌ Store token in plain text files

### 2. Channel Access Control

**Main Channel:**
- Restrict to IT management only
- Monitor member list regularly
- Enable admin approval for joins

**Departmental Channels:**
- Only add team members who need access
- Review membership quarterly
- Remove users when changing roles

### 3. Message Retention

**Configure channel settings:**
- Consider auto-delete after 30/90 days for compliance
- Or rely on retention policy in HK-NOVA

**HK-NOVA retention:**
```sql
-- Set retention policy on destinations
UPDATE destinations 
SET retention_config = '{"daily": 14, "weekly": 6, "monthly": 12}'
WHERE dest_type = 'telegram';
```

### 4. Audit Trail

**Monitor who accesses backups:**
- Telegram shows "viewed by" for messages
- Review channel stats regularly
- Enable 2FA for all admin accounts

---

## 📈 Advanced Configurations

### Configuration 1: Priority-Based Channels

**Use Case:** Different upload priority for critical vs non-critical

```sql
-- Critical Channel (immediate upload)
INSERT INTO destinations (name, dest_type, enabled, config_json) 
VALUES (
  'Telegram - Critical Priority',
  'telegram',
  1,
  '{"bot_token": "TOKEN", "chat_id": "CHAT_ID", "compress": false}'
);

-- Standard Channel (batch upload, compressed)
INSERT INTO destinations (name, dest_type, enabled, config_json) 
VALUES (
  'Telegram - Standard',
  'telegram',
  1,
  '{"bot_token": "TOKEN", "chat_id": "CHAT_ID", "compress": true}'
);

-- Groups
UPDATE groups SET destination_ids = '[1, 2, 3]' WHERE name = 'critical';
UPDATE groups SET destination_ids = '[1, 2, 4]' WHERE name = 'standard';
```

### Configuration 2: Geographic Channels

**Use Case:** Different channels for different locations

```sql
-- HQ Channel
INSERT INTO destinations (name, dest_type, enabled, config_json) 
VALUES ('TG-HQ', 'telegram', 1, '{"bot_token": "TOKEN", "chat_id": "HQ_CHAT"}');

-- Branch1 Channel
INSERT INTO destinations (name, dest_type, enabled, config_json) 
VALUES ('TG-Branch1', 'telegram', 1, '{"bot_token": "TOKEN", "chat_id": "BR1_CHAT"}');

-- Groups by location
INSERT INTO groups (name, destination_ids) VALUES
  ('hq-devices', '[1, 2, 3]'),
  ('branch1-devices', '[1, 2, 4]');
```

### Configuration 3: Time-Based Channels

**Use Case:** Different channels for different backup schedules

```sql
-- Daily Channel
INSERT INTO destinations (name, dest_type, enabled, config_json) 
VALUES ('TG-Daily', 'telegram', 1, '{"bot_token": "TOKEN", "chat_id": "DAILY_CHAT"}');

-- Weekly Channel (with compression for storage)
INSERT INTO destinations (name, dest_type, enabled, config_json) 
VALUES ('TG-Weekly', 'telegram', 1, '{"bot_token": "TOKEN", "chat_id": "WEEKLY_CHAT", "compress": true}');

-- Assign to different jobs
-- Daily job uses daily channel
-- Weekly job uses weekly channel
```

---

## 🔄 Maintenance Procedures

### Monthly Tasks

**1. Review Channel Membership**
```markdown
- [ ] Audit Main Channel members
- [ ] Review departmental channel access
- [ ] Remove departed team members
- [ ] Add new team members as needed
```

**2. Check Backup Success Rate**
```sql
SELECT 
  strftime('%Y-%m', timestamp) as month,
  destination_type,
  COUNT(*) as total,
  SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
  ROUND(100.0 * SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate
FROM backups
WHERE timestamp > datetime('now', '-30 days')
  AND destination_type LIKE '%telegram%'
GROUP BY month, destination_type;
```

**3. Verify Bot Status**
```bash
curl -X GET "https://api.telegram.org/bot<TOKEN>/getMe"
```

### Quarterly Tasks

**1. Rotate Bot Token**
```markdown
1. Create new bot token via @BotFather
2. Test new token
3. Update all destinations:
   UPDATE destinations 
   SET config_json = json_set(config_json, '$.bot_token', 'NEW_TOKEN')
   WHERE dest_type = 'telegram';
4. Monitor for 24 hours
5. Revoke old token via @BotFather
```

**2. Review Configuration**
```markdown
- [ ] Verify device-group assignments still correct
- [ ] Check if new groups needed
- [ ] Review channel purposes
- [ ] Update documentation
```

**3. Capacity Planning**
```sql
-- Check storage usage per channel
SELECT 
  destination_type,
  COUNT(*) as backup_count,
  SUM(file_size) / (1024*1024) as total_mb
FROM backups
WHERE timestamp > datetime('now', '-90 days')
GROUP BY destination_type;
```

### Annual Tasks

**1. Security Audit**
```markdown
- [ ] Review all bot permissions
- [ ] Audit channel admin list
- [ ] Check encryption settings
- [ ] Verify compliance requirements
```

**2. Disaster Recovery Test**
```markdown
- [ ] Test backup restoration from Telegram
- [ ] Verify main channel has all backups
- [ ] Test departmental channel isolation
- [ ] Document recovery procedure
```

---

## 📚 Reference

### Quick Command Cheat Sheet

**Database Operations:**
```bash
# Backup database
cp hk-nova.db hk-nova.db.backup-$(date +%Y%m%d)

# Connect to database
sqlite3 hk-nova.db

# List destinations
SELECT id, name, dest_type FROM destinations;

# List groups
SELECT name, destination_ids FROM groups;

# Check device assignments
SELECT group, COUNT(*) FROM devices GROUP BY group;
```

**Bot Operations:**
```bash
# Test bot
curl -X GET "https://api.telegram.org/bot<TOKEN>/getMe"

# Get updates (chat IDs)
curl -X GET "https://api.telegram.org/bot<TOKEN>/getUpdates"

# Send test message
curl -X POST "https://api.telegram.org/bot<TOKEN>/sendMessage" \
  -d "chat_id=CHAT_ID" \
  -d "text=Test message"
```

**Log Operations:**
```bash
# Watch Telegram logs
tail -f server.log | grep -i telegram

# Check errors
grep -i "error.*telegram" server.log | tail -20

# Count successful uploads today
grep "Telegram: Upload successful" server.log | grep $(date +%Y-%m-%d) | wc -l
```

### SQL Quick Reference

**Add new destination:**
```sql
INSERT INTO destinations (name, dest_type, enabled, config_json) 
VALUES ('Name', 'telegram', 1, '{"bot_token":"TOKEN","chat_id":"CHAT"}');
```

**Update group destinations:**
```sql
UPDATE groups 
SET destination_ids = '[1, 2, 3, 4]' 
WHERE name = 'group-name';
```

**Move device to different group:**
```sql
UPDATE devices 
SET group = 'new-group' 
WHERE hostname = 'device-name';
```

**Disable destination:**
```sql
UPDATE destinations 
SET enabled = 0 
WHERE name = 'destination-name';
```

### Telegram Bot Commands

In @BotFather:

- `/newbot` - Create new bot
- `/mybots` - Manage existing bots
- `/setname` - Change bot name
- `/setdescription` - Set bot description
- `/setuserpic` - Set bot avatar
- `/deletebot` - Delete bot
- `/token` - Get/regenerate bot token
- `/revoke` - Revoke bot token

---

## 🎓 Training Guide for Team Members

### For Network Team

**What you need to know:**
1. Your devices backup to 2 channels:
   - Main Channel (read-only, monitoring)
   - Network Channel (your team access)

2. Finding your backups:
   - Search `#network_team` in your channel
   - Search specific device: `#router_core_01`
   - Search by date: `#2026_09_15`

3. Downloading backups:
   - Click file in Telegram
   - Download to your device
   - File format: `.cfg` or `.cfg.gz`

4. Restoring configs:
   - Download file from Telegram
   - If `.cfg.gz`: `gunzip filename.cfg.gz`
   - Copy config to device as needed

### For Security Team

**Same as above, but:**
- Your channel: Security Channel
- Your hashtag: `#security_team`
- Your devices: Firewalls, VPN, IDS/IPS

### For IT Management

**Main Channel Access:**
1. You see ALL backups from all departments
2. Use hashtags to filter:
   - `#network_team` - Network devices only
   - `#security_team` - Security devices only
   - `#success` - Successful backups only
   - `#failed` - Failed backups (investigate)

3. Monitoring:
   - Check channel daily for backup activity
   - Investigate any `#failed` backups
   - Review trends weekly

---

## ✅ Completion Checklist

### Setup Phase
- [ ] Created Telegram bot via @BotFather
- [ ] Created Main Channel (private)
- [ ] Created departmental channels (private)
- [ ] Added bot as admin to all channels
- [ ] Obtained all chat IDs
- [ ] Documented bot token and chat IDs securely

### Configuration Phase
- [ ] Backed up HK-NOVA database
- [ ] Created Telegram destinations in database
- [ ] Created/updated groups with correct destination_ids
- [ ] Assigned devices to appropriate groups
- [ ] Verified configuration via SQL queries

### Testing Phase
- [ ] Tested single device backup
- [ ] Verified backup in Main Channel
- [ ] Verified backup in departmental channel
- [ ] Confirmed other channels don't see backup
- [ ] Tested search functionality with hashtags
- [ ] Tested all groups (network, security, server)

### Production Phase
- [ ] Updated internal documentation
- [ ] Configured scheduled jobs
- [ ] Trained team members on channel usage
- [ ] Monitored first week of backups
- [ ] Collected feedback from users
- [ ] Established maintenance procedures

### Security Phase
- [ ] Secured bot token (not in git)
- [ ] Restricted channel access
- [ ] Enabled 2FA for admins
- [ ] Documented security procedures
- [ ] Set up rotation schedule

---

## 📞 Support & Contact

### Getting Help

**For Technical Issues:**
1. Check [Troubleshooting](#verification--troubleshooting) section
2. Review logs: `tail -f server.log | grep telegram`
3. Check documentation: `docs/TELEGRAM_DESTINATION.md`

**For Configuration Questions:**
1. Review this guide
2. Check SQL queries in Reference section
3. Verify current configuration via database

**For Emergency Issues:**
1. Check bot status via @BotFather
2. Verify bot is admin in channels
3. Check HK-NOVA server logs
4. Contact IT Admin team

---

## 📝 Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-09-15 | Initial multi-channel setup guide |

---

## 🎉 Conclusion

You now have a fully functional multi-channel Telegram backup system!

**What you achieved:**
✅ Multiple Telegram channels for different teams
✅ Central Main Channel for monitoring
✅ Departmental isolation for access control
✅ Automatic backup distribution based on device groups
✅ Searchable backup archive with hashtags

**Next Steps:**
1. Monitor system for first week
2. Gather user feedback
3. Optimize based on usage patterns
4. Consider additional channels if needed

**Remember:**
- Main Channel = Complete visibility
- Departmental Channels = Team-specific access
- Groups control which devices go where
- Hashtags make searching easy

Happy backing up! 🚀
