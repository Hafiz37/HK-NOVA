# HK-NOVA Multi-Channel Telegram - Quick Reference Card

## 🎯 Quick Start

### For System Administrators

**Setup Checklist:**
```bash
# 1. Create bot and channels
Visit: https://t.me/BotFather
Create: Main + Departmental channels
Get: Bot token + Chat IDs

# 2. Configure database
cd /home/gopal-ichiro/Documents/magang/hk-nova_2
sqlite3 hk-nova.db < docs/setup_multi_channel.sql
# Edit SQL file first with your tokens/chat IDs!

# 3. Test setup
python test_multi_channel_setup.py

# 4. Verify in Telegram
Check each channel for test backups
```

---

## 📱 Channel Structure

```
┌─────────────────────────────────────────────────────────┐
│  Main Channel (HK-NOVA - All Backups)                   │
│  Purpose: Central monitoring - ALL device backups       │
│  Access: IT Management only                             │
│  Receives: EVERY backup from every device               │
└─────────────────────────────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┬─────────────────┐
        │               │               │                 │
        ▼               ▼               ▼                 ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│  Network    │ │  Security   │ │   Server    │ │   Remote    │
│  Channel    │ │  Channel    │ │  Channel    │ │   Sites     │
│             │ │             │ │             │ │   Channel   │
│ Network     │ │ Security    │ │ Server      │ │ Branch      │
│ team only   │ │ team only   │ │ team only   │ │ admins      │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘
```

---

## 🔍 Searching Backups in Telegram

### Basic Search Commands

| Search Query | Results |
|--------------|---------|
| `#backup` | All backups in current channel |
| `#success` | Only successful backups |
| `#failed` | Only failed backups |
| `#<hostname>` | Specific device (e.g., `#router_core_01`) |
| `#<group>` | Group devices (e.g., `#network_team`) |
| `#<type>` | Device type (e.g., `#cisco_ios`) |
| `#<date>` | Specific date (e.g., `#2026_09_15`) |

### Advanced Search Examples

```
# Find all Cisco routers from network team
#network_team #cisco_ios

# Find yesterday's backups from firewall
#firewall #2026_09_14

# Find all failed backups from last week
#failed #2026_09

# Find specific device backups
#router_core_01
```

---

## 👥 User Roles & Access

### IT Management (Main Channel Access)
**Can See:** ALL backups from all devices
**Use For:**
- Daily monitoring of backup health
- Investigating failed backups
- Trend analysis across all teams
- Compliance reporting

**Quick Tasks:**
```
Search "#failed" → Investigate issues
Search "#network_team" → Check network backups
Search "#2026_09_15" → Today's backups
```

### Network Team (Network Channel Access)
**Can See:** ONLY network device backups (routers, switches)
**Use For:**
- Monitoring network equipment backups
- Downloading configs for changes
- Reviewing configuration history
- Quick restore access

**Quick Tasks:**
```
Search "#backup" → All my team's backups
Search "#router_core_01" → Specific router
Click file → Download config
```

### Security Team (Security Channel Access)
**Can See:** ONLY security device backups (firewalls, VPN, IDS)
**Use For:**
- Firewall configuration backups
- VPN gateway configs
- IDS/IPS rule backups
- Security audit trail

**Quick Tasks:**
```
Search "#firewall" → All firewall backups
Search "#vpn" → VPN gateway configs
Download → Restore/review configs
```

### Server Team (Server Channel Access)
**Can See:** ONLY server backups (Proxmox, Linux)
**Use For:**
- Proxmox host configurations
- Linux server configs
- VM backups (if applicable)
- Disaster recovery

**Quick Tasks:**
```
Search "#proxmox" → Proxmox hosts
Search "#linux" → Linux servers
Download → Config restore
```

---

## 📥 Downloading & Using Backups

### Download Process

**1. Find Backup:**
```
Open Telegram channel
Search: #router_core_01
Select: Latest backup file
```

**2. Download File:**
```
Click on file in Telegram
Choose "Download"
File saved to Downloads folder
```

**3. Extract (if compressed):**
```bash
# If file is .cfg.gz
gunzip router_core_01_2026-09-15_143025.cfg.gz

# Result: router_core_01_2026-09-15_143025.cfg
```

**4. View Config:**
```bash
# View file
cat router_core_01_2026-09-15_143025.cfg

# Or open in text editor
nano router_core_01_2026-09-15_143025.cfg
```

**5. Restore to Device:**
```bash
# Copy to device (example for Cisco)
# Method 1: SCP
scp config.cfg admin@router:/config/

# Method 2: Paste via SSH
ssh admin@router
# Paste config line by line
```

---

## 🔧 Common Tasks

### Task 1: Check Today's Backups
```
Channel: Main Channel
Search: #2026_09_15 (today's date)
Result: All backups from today
Check: Count vs expected device count
```

### Task 2: Find Failed Backups
```
Channel: Main Channel
Search: #failed
Result: All failed backups
Action: Investigate each failure
Check logs: tail -f server.log | grep failed
```

### Task 3: Download Router Config
```
Channel: Network Channel
Search: #router_core_01
Select: Latest backup
Click: Download
Save: To your computer
Use: For restore or comparison
```

### Task 4: Compare Two Configs
```
1. Download latest backup
2. Download older backup
3. Compare:
   diff old_config.cfg new_config.cfg
   
Or use GUI diff tool:
   meld old_config.cfg new_config.cfg
```

### Task 5: Check Device Backup History
```
Channel: Appropriate departmental channel
Search: #<devicename>
Result: All backups for that device
Review: Chronological history
```

---

## 🚨 Troubleshooting

### Problem: Backup Not Appearing in Channel

**Check:**
1. Is device enabled in HK-NOVA?
   ```sql
   SELECT hostname, enabled, group FROM devices 
   WHERE hostname = 'device-name';
   ```

2. Is device in correct group?
   ```sql
   SELECT d.hostname, d.group, g.destination_ids
   FROM devices d
   JOIN groups g ON g.name = d.group
   WHERE d.hostname = 'device-name';
   ```

3. Is bot still admin in channel?
   - Open channel settings
   - Check Administrators list
   - Re-add bot if needed

4. Check logs:
   ```bash
   tail -f server.log | grep -i telegram
   ```

### Problem: Can't Download File from Telegram

**Solutions:**
1. Check internet connection
2. Try Telegram Desktop instead of mobile
3. File might be too large - check size
4. Re-send file (re-run backup)

### Problem: Wrong Channel Receiving Backups

**Fix:**
1. Check device group assignment
2. Verify group's destination_ids
3. Update if needed:
   ```sql
   UPDATE devices SET group = 'correct-group'
   WHERE hostname = 'device-name';
   ```

### Problem: Bot Shows "Unauthorized"

**Fix:**
1. Get new token from @BotFather
2. Update database:
   ```sql
   UPDATE destinations 
   SET config_json = json_set(config_json, '$.bot_token', 'NEW_TOKEN')
   WHERE dest_type = 'telegram';
   ```
3. Restart HK-NOVA

---

## 📊 Monitoring Dashboard

### Daily Checks (IT Management)

**Morning:**
```
1. Open Main Channel
2. Search: #<yesterday's date>
3. Count backups
4. Check for #failed
5. Investigate failures
```

**Weekly:**
```
1. Review backup success rate
2. Check storage usage
3. Verify all devices backing up
4. Review channel access list
```

**Monthly:**
```
1. Audit channel membership
2. Review group assignments
3. Check for new devices
4. Verify bot token still valid
```

### Metrics to Track

```sql
-- Backup success rate (last 7 days)
SELECT 
  DATE(timestamp) as date,
  COUNT(*) as total,
  SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
  ROUND(100.0 * SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) / COUNT(*), 2) as rate
FROM backups
WHERE timestamp > datetime('now', '-7 days')
  AND destination_type LIKE '%telegram%'
GROUP BY DATE(timestamp);

-- Backups by channel
SELECT 
  destination_type,
  COUNT(*) as backup_count
FROM backups
WHERE timestamp > datetime('now', '-30 days')
GROUP BY destination_type;

-- Device backup coverage
SELECT 
  d.hostname,
  d.group,
  MAX(b.timestamp) as last_backup,
  COUNT(b.id) as backup_count_30d
FROM devices d
LEFT JOIN backups b ON b.device_id = d.id 
  AND b.timestamp > datetime('now', '-30 days')
WHERE d.enabled = 1
GROUP BY d.id
ORDER BY last_backup DESC;
```

---

## 🔐 Security Best Practices

### For All Users

**DO:**
- ✅ Keep Telegram app updated
- ✅ Enable 2FA on Telegram account
- ✅ Use strong password
- ✅ Lock phone/computer when away
- ✅ Report lost devices immediately

**DON'T:**
- ❌ Share channel links publicly
- ❌ Screenshot sensitive configs
- ❌ Forward backups to unauthorized users
- ❌ Leave Telegram logged in on shared computers
- ❌ Ignore failed backup notifications

### For Administrators

**Regular Tasks:**
- Review channel member list monthly
- Audit access permissions quarterly
- Rotate bot token every 6 months
- Monitor unusual download activity
- Keep backup of bot token secure

### Data Handling

**Device configs may contain:**
- ⚠️ Passwords and secrets
- ⚠️ SNMP community strings
- ⚠️ API keys
- ⚠️ VPN keys
- ⚠️ Encryption keys

**Therefore:**
- Use PRIVATE channels only
- Restrict access by role
- Don't share outside organization
- Delete when no longer needed
- Follow company data policies

---

## 📞 Support & Contacts

### Need Help?

**Configuration Issues:**
- Check: `/home/gopal-ichiro/Documents/magang/hk-nova_2/docs/MULTI_CHANNEL_SETUP.md`
- Run: `python test_multi_channel_setup.py`
- Review: `tail -f server.log | grep telegram`

**Telegram Bot Issues:**
- Visit: https://t.me/BotFather
- Check: Bot token validity
- Verify: Bot is admin in channels

**Database Issues:**
- Connect: `sqlite3 hk-nova.db`
- Verify: `SELECT * FROM destinations WHERE dest_type='telegram';`
- Check: `SELECT name, destination_ids FROM groups;`

**Emergency Contacts:**
- IT Management: [Your contact info]
- System Administrator: [Your contact info]
- On-Call Support: [Your contact info]

---

## 📚 Additional Resources

**Full Documentation:**
- Multi-Channel Setup: `docs/MULTI_CHANNEL_SETUP.md`
- Telegram Destination: `docs/TELEGRAM_DESTINATION.md`
- Main README: `README.md`

**SQL Scripts:**
- Setup: `docs/setup_multi_channel.sql`
- Verification queries: See MULTI_CHANNEL_SETUP.md

**Test Scripts:**
- Multi-channel test: `test_multi_channel_setup.py`
- Single device test: `test_telegram.py`

**Logs:**
- Main log: `server.log`
- Filter Telegram: `tail -f server.log | grep -i telegram`

---

## 🎓 Training Checklist

### For New Team Members

**Week 1:**
- [ ] Get Telegram account
- [ ] Join appropriate channel(s)
- [ ] Understand channel purpose
- [ ] Learn hashtag search
- [ ] Practice downloading backups

**Week 2:**
- [ ] Review backup schedule
- [ ] Understand caption format
- [ ] Learn to identify failures
- [ ] Practice config comparison
- [ ] Complete test restore

**Week 3:**
- [ ] Monitor daily backups
- [ ] Report issues if found
- [ ] Document common tasks
- [ ] Share knowledge with team
- [ ] Complete certification quiz

---

## 🔄 Quick Command Reference

### Database Queries
```sql
-- Check my group's destinations
SELECT name, destination_ids FROM groups WHERE name = 'network-team';

-- Find device group
SELECT hostname, group FROM devices WHERE hostname = 'router-01';

-- Recent backups
SELECT hostname, timestamp, status FROM backups 
JOIN devices ON backups.device_id = devices.id
WHERE timestamp > datetime('now', '-1 day')
ORDER BY timestamp DESC;
```

### Log Commands
```bash
# Watch live backups
tail -f server.log | grep "Backup complete"

# Check Telegram uploads
tail -f server.log | grep "Telegram: Upload"

# Find errors
grep -i "error.*telegram" server.log | tail -20
```

### System Commands
```bash
# Restart HK-NOVA
cd /home/gopal-ichiro/Documents/magang/hk-nova_2
./manage.sh restart

# Check status
./manage.sh status

# View recent logs
./manage.sh logs
```

---

**Document Version:** 1.0  
**Last Updated:** 2026-09-15  
**Maintained By:** HK-NOVA Team

---

**Print this page and keep at your desk for quick reference!**
