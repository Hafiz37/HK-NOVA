# Telegram Destination

Upload backup files as documents to Telegram chat/channel with rich metadata captions for easy search and retrieval.

## Features

- 📤 **File upload** — Backups sent as documents (not text messages)
- 📝 **Rich captions** — Full device and backup metadata with each file
- 🔍 **Searchable** — Hashtags for easy search: `#backup #hostname #group #devicetype`
- 📦 **Compression support** — Optional gzip compression
- ✂️ **Auto-split** — Large files (>50MB) automatically split into parts
- 🔒 **Encrypted tokens** — Bot tokens encrypted in database
- 🔄 **Retry logic** — Automatic retry with exponential backoff for network failures
- 🎯 **Multi-format** — Supports text configs (.cfg) and binary archives (.tar.gz, .zip)

## Setup

### 1. Create Telegram Bot

1. Open Telegram and search for [@BotFather](https://t.me/BotFather)
2. Send `/newbot` command
3. Follow instructions to set bot name and username
4. Copy the bot token (format: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)

### 2. Get Chat ID

**For Private Chat:**
1. Search for [@userinfobot](https://t.me/userinfobot) on Telegram
2. Start the bot and it will show your Chat ID

**For Channel:**
1. Create a channel or use existing one
2. Add your bot as administrator
3. Send a message to the channel
4. Visit: `https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getUpdates`
5. Look for `"chat":{"id":-100XXXXXXXXX}` in the JSON response

**For Group:**
1. Create a group or use existing one
2. Add your bot to the group
3. Make the bot an admin (required for file operations)
4. Follow same steps as channel to get chat ID

### 3. Configure Destination in HK-NOVA

**Via Database (SQL):**

```sql
INSERT INTO destinations (name, dest_type, enabled, config_json) 
VALUES (
  'Telegram Backup Channel',
  'telegram',
  1,
  '{"bot_token": "123456789:ABCdefGHIjklMNOpqrsTUVwxyz", "chat_id": "-100123456789", "compress": false, "max_file_size_mb": 45, "split_size_mb": 40}'
);
```

**Note:** Bot token will be automatically encrypted when processed by the application.

### 4. Configure Device/Group to Use Telegram

- Edit device or group
- Select "Telegram Backup Channel" in destination selection
- Run backup manually or wait for scheduled job

## Configuration Options

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `bot_token` | string | ✅ Yes | - | Telegram Bot API token from @BotFather |
| `chat_id` | string | ✅ Yes | - | Target chat/channel ID (starts with `-` for groups/channels) |
| `compress` | boolean | No | `false` | Enable gzip compression for text configs |
| `max_file_size_mb` | integer | No | `45` | Maximum file size before splitting (MB) |
| `split_size_mb` | integer | No | `40` | Chunk size for split files (MB) |

## Caption Format

Each uploaded file includes a rich caption with full metadata:

```
🟢 BACKUP SUCCESS: router-core-01

━━━━━━━━━━━━━━━━━━━━━━━
📅 2026-09-15 14:25:30 UTC
   (2026-09-15 22:25:30 WIB)
🔑 Hash: abc123def456...
📦 Size: 15.2 KB
🏷️ Group: production
🖥️ Type: cisco_ios
📍 IP: 192.168.1.1
🔌 Port: 22
🌐 Proxy: 10.0.0.5
✅ Enabled: Yes
📝 Notes: Core router - Building A
━━━━━━━━━━━━━━━━━━━━━━━
#backup #router_core_01 #production #cisco_ios #success #2026_09_15
```

### Caption Indicators

- 🟢 **Green** — Backup successful
- 🔴 **Red** — Backup failed
- 📅 **Timestamp** — Shows both UTC and local timezone (from `TZ` env var)
- 🔑 **Hash** — SHA256 hash (first 12 chars) for change detection
- 📦 **Size** — File size in human-readable format
- **Hashtags** — For easy searching in Telegram

## Filename Convention

Files are named using the pattern:

```
{group}_{hostname}_{timestamp}.cfg
```

Examples:
- `production_router-core-01_2026-09-15_142530.cfg`
- `production_router-core-01_2026-09-15_142530.cfg.gz` (compressed)
- `production_proxmox-host_2026-09-15_142530.tar.gz` (binary backup)

For split files:
- `production_router-core-01_2026-09-15_142530.cfg.gz.001`
- `production_router-core-01_2026-09-15_142530.cfg.gz.002`
- `production_router-core-01_2026-09-15_142530.cfg.gz.003`

## Searching Backups in Telegram

Use Telegram's search feature with hashtags:

| Search Query | Results |
|--------------|---------|
| `#backup` | All backups |
| `#router_core_01` | All backups for specific device |
| `#production` | All backups in production group |
| `#cisco_ios` | All Cisco IOS device backups |
| `#success` | Only successful backups |
| `#failed` | Only failed backups |
| `#2026_09_15` | All backups from specific date |

**Combine hashtags:**
- `#production #cisco_ios` — Production Cisco devices
- `#router_core_01 #2026_09` — Specific device in September 2026

## File Size Limits

Telegram Bot API has a **50 MB file size limit** per upload.

**Automatic Handling:**
- Files ≤ 45 MB: Uploaded as single file
- Files > 45 MB: Automatically split into parts

**Split File Example:**
```
[PART 1/3] production_router-core-01
📦 Size: 40.0 MB
#backup #part1of3

[PART 2/3] production_router-core-01
📦 Size: 40.0 MB
#backup #part2of3

[PART 3/3] production_router-core-01
📦 Size: 15.8 MB
#backup #part3of3
```

To reconstruct split files:
```bash
cat production_router-core-01_*.001 > backup.cfg.gz
cat production_router-core-01_*.002 >> backup.cfg.gz
cat production_router-core-01_*.003 >> backup.cfg.gz
gunzip backup.cfg.gz
```

## Supported Backup Types

### Text Configs
- Cisco IOS/NX-OS/IOS-XE
- MikroTik RouterOS
- Juniper JunOS
- Nokia SR OS
- HP/Aruba, Dell, etc.

**Upload:** As `.cfg` or `.cfg.gz` file

### Binary Archives
- Proxmox VE backups (tar.gz)

**Upload:** As `.tar.gz` file  
**Caption:** Includes file list from archive manifest

## Error Handling

### Network Errors
- Automatic retry: 3 attempts with exponential backoff (1s, 2s, 4s)
- Rate limit handling: Respects `Retry-After` header

### Common Errors

**"Unauthorized" (401)**
- Invalid bot token
- Solution: Regenerate token via @BotFather

**"Chat not found" (400)**
- Invalid chat_id or bot not added to chat
- Solution: Verify bot is member of target chat/channel

**"File too large" (400)**
- File > 50 MB and split failed
- Solution: Lower `split_size_mb` or use compression

**Partial Success**
- Telegram upload fails but local/git succeeds
- Backup marked as success with warning in logs

## Message Deletion

Telegram destination supports deletion via retention policy:

**Requirements:**
- Bot must be **admin** in the target channel/group
- Private chats: Always allowed

**Behavior:**
- Successful: Message deleted from Telegram
- Failed: Warning logged (not critical error)

## Security Considerations

⚠️ **Important Security Notes:**

1. **Bot Token Storage**
   - Tokens encrypted in database using Fernet (AES)
   - Encryption key from `SECRET_KEY` in `.env`
   - Never commit `.env` to version control

2. **Message Privacy**
   - Telegram messages are **NOT end-to-end encrypted** (except Secret Chats which don't support bots)
   - Use **private channel** with restricted access
   - Avoid public groups/channels for sensitive configs

3. **Sensitive Data**
   - Device configs may contain passwords, SNMP communities, API keys
   - **Recommendation:** Use private channel, restrict members
   - **Advanced:** Implement config sanitization before backup

4. **Access Control**
   - Make bot admin with minimal permissions (only "Post Messages" and "Delete Messages")
   - Regularly audit channel member list
   - Enable 2FA on Telegram accounts with access

## Comparison with Other Destinations

| Feature | Local | Git | SMB | Telegram |
|---------|-------|-----|-----|----------|
| File Storage | ✅ | ✅ | ✅ | ✅ |
| Searchable | ❌ | ⚠️ (via git log) | ❌ | ✅ (hashtags) |
| Remote Access | ❌ | ✅ | ✅ | ✅ |
| Version Control | ❌ | ✅ | ❌ | ⚠️ (manual) |
| Mobile Access | ❌ | ⚠️ (web) | ❌ | ✅ (native app) |
| Setup Complexity | ⭐ | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ |
| File Size Limit | None | ~100 MB | None | 50 MB |

**Use Cases:**
- **Primary backup:** Local or Git (version control)
- **Off-site backup:** SMB or Telegram
- **Quick access:** Telegram (mobile app)
- **Long-term archive:** Git or Local with retention policy

## Troubleshooting

### Test Upload Script

Save as `test_telegram.py`:

```python
import asyncio
import os
import sys
sys.path.insert(0, '/path/to/hk-nova_2')

from app.modules.destinations.telegram import TelegramDestination
from datetime import datetime, timezone

async def test():
    telegram = TelegramDestination()
    
    config = {
        "bot_token": "YOUR_BOT_TOKEN",
        "chat_id": "YOUR_CHAT_ID",
        "compress": False,
        "_device_meta": {
            "hostname": "test-device",
            "ip_address": "192.168.1.1",
            "device_type": "cisco_ios",
            "group": "test",
            "port": 22,
            "proxy_host": None,
            "enabled": True,
            "notes": "Test backup",
        },
        "_backup_meta": {
            "hash": "test123",
            "size": 100,
            "timestamp": datetime.now(timezone.utc),
            "status": "success",
        }
    }
    
    result = await telegram.save(
        hostname="test-device",
        config_text="! Test config\nhostname test-device\n",
        config=config
    )
    print(f"✅ Upload successful: {result}")

asyncio.run(test())
```

Run:
```bash
export TELEGRAM_BOT_TOKEN='123456789:ABC...'
export TELEGRAM_CHAT_ID='-100123456789'
python test_telegram.py
```

### Enable Debug Logging

Edit `.env`:
```bash
LOG_LEVEL=DEBUG
```

Restart application:
```bash
./manage.sh restart
```

Check logs:
```bash
tail -f server.log | grep -i telegram
```

## Integration with Other Features

### With Retention Policy
- Telegram messages deleted when backup record pruned
- Requires bot admin rights

### With Notifications
- Separate from Apprise notifications
- Notifications = job status alerts
- Destination = actual backup storage

### With Scheduled Jobs
- Select Telegram destination in job configuration
- Multiple destinations: upload to local + git + telegram simultaneously

## FAQ

**Q: Can I use multiple Telegram destinations?**  
A: Yes, create multiple destination entries with different chat_ids (e.g., one for production, one for staging).

**Q: Does compression save Telegram storage?**  
A: No, Telegram doesn't charge for storage. Compression mainly saves bandwidth and reduces upload time.

**Q: Can I download backups from Telegram?**  
A: Yes, click the file in Telegram chat to download. For split files, download all parts and concatenate.

**Q: What happens if bot is removed from channel?**  
A: Future uploads will fail. Existing files remain in channel. Re-add bot and backups resume.

**Q: Can I use Telegram as primary storage?**  
A: Not recommended. Use local/git as primary, Telegram as convenient remote copy for quick access.

**Q: How to migrate bot token?**  
A: Update destination config_json with new token. Old messages remain accessible.

## Related Documentation

- [docs/CONFIGURATION.md](CONFIGURATION.md) — Environment variables, secrets
- [docs/DEVICES.md](DEVICES.md) — Device setup and supported types
- [SECURITY.md](../SECURITY.md) — Security best practices

---

**Need help?** Open an issue on GitHub or check the troubleshooting section above.
