# 🚨 Phase 6: Emergency & Incident Response Guide

## 📊 Incident Severity Levels

| Level | Name | Response Time | Description | Examples |
|-------|------|---------------|-------------|----------|
| **P1** | **CRITICAL** | <15 minutes | System completely down or unusable | All workers crashed, DB down, Web UI down |
| **P2** | **HIGH** | <30 minutes | Major feature broken, performance severely degraded | ICMP poller down, DB connections full |
| **P3** | **MEDIUM** | <2 hours | Minor feature broken, non-critical errors | SNMP poller down for 1 device type |
| **P4** | **LOW** | Next business day | Cosmetic issues, documentation errors | UI alignment bug, typo in alert message |

---

## 🚨 P1: Critical Incident Procedures

### Scenario 1: All Workers Crashed

**Symptoms:**
- Web UI shows no live data
- `pm2 list` shows workers stopped or errored
- Alerts not triggering

**Step-by-Step Resolution:**

1. **Assess Situation:**
   ```bash
   pm2 list
   pm2 logs --err --lines 100
   ```

2. **Check System Resources:**
   ```bash
   df -h      # Check disk space
   free -h    # Check memory
   top -bn1   # Check CPU
   ```

3. **Restart Workers:**
   ```bash
   # Try graceful restart
   pm2 restart all
   
   # If still failing, stop and start
   pm2 stop all
   sleep 5
   pm2 start ecosystem.config.js
   ```

4. **If Workers Still Crash:**
   ```bash
   # Check specific error
   pm2 logs icmp-poller --err --lines 200
   
   # Check database connection
   mysql -u root -p -e "SELECT 1;"
   
   # Verify environment variables
   cat .env.production | grep DATABASE_URL
   ```

5. **Emergency Rollback (if caused by code update):**
   ```bash
   git status
   git log -1
   # Revert to last working commit if needed
   ```

---

### Scenario 2: Database Outage/Crash

**Symptoms:**
- Workers logging "Connection refused" or "Too many connections"
- Web UI throwing 500 errors
- MySQL service stopped

**Step-by-Step Resolution:**

1. **Check MySQL Status:**
   ```bash
   sudo systemctl status mysql
   ```

2. **Start/Restart MySQL:**
   ```bash
   sudo systemctl start mysql
   # Or
   sudo systemctl restart mysql
   ```

3. **If MySQL Won't Start:**
   ```bash
   # Check error logs
   sudo tail -n 100 /var/log/mysql/error.log
   
   # Check disk space
   df -h /var/lib/mysql
   ```

4. **If "Too Many Connections":**
   ```sql
   -- Connect as root
   mysql -u root -p
   
   -- Increase limit temporarily
   SET GLOBAL max_connections = 300;
   
   -- View processes
   SHOW PROCESSLIST;
   
   -- Kill stuck queries
   KILL <process_id>;
   ```

5. **Restart Workers After DB Recovered:**
   ```bash
   pm2 restart all
   ```

---

### Scenario 3: Disk Full (100% Usage)

**Symptoms:**
- Database write errors
- Logs failing to write
- Workers crashing unpredictably

**Step-by-Step Resolution:**

1. **Identify Large Files/Directories:**
   ```bash
   df -h
   du -sh /var/log/* | sort -rh | head -10
   du -sh /var/www/hk-nova/logs/* | sort -rh | head -10
   ```

2. **Emergency Log Cleanup:**
   ```bash
   # Flush PM2 logs
   pm2 flush
   
   # Clean system logs (>7 days)
   sudo journalctl --vacuum-time=7d
   
   # Clean old backups (>30 days)
   find /var/backups/hk-nova -mtime +30 -delete
   ```

3. **Database Cleanup (if DB disk full):**
   ```sql
   -- Clean metrics older than 30 days
   DELETE FROM Metric WHERE timestamp < DATE_SUB(NOW(), INTERVAL 30 DAY);
   
   -- Clean resolved alerts older than 60 days
   DELETE FROM Alert WHERE status = 'RESOLVED' AND createdAt < DATE_SUB(NOW(), INTERVAL 60 DAY);
   ```

4. **Restart Services:**
   ```bash
   sudo systemctl restart mysql
   pm2 restart all
   ```

---

## ⚠️ P2: High Severity Procedures

### Scenario 1: CPU Usage >90% Sustained

**Resolution:**
```bash
# 1. Identify CPU hog
top -bn1 | head -20

# 2. Reduce worker concurrency in .env.production
ICMP_CONCURRENCY_LIMIT=5  # Reduced from 10
SNMP_CONCURRENCY_LIMIT=5  # Reduced from 10

# 3. Restart workers
pm2 restart all

# 4. Monitor CPU drop
top -bn1
```

---

### Scenario 2: Memory Leak (Memory >12GB)

**Resolution:**
```bash
# 1. Identify leaking process
ps aux | grep node | awk '{print $2, $4, $11}' | sort -k2 -rn

# 2. Restart specific worker
pm2 restart <worker-name>

# 3. Configure PM2 max memory restart
pm2 start ecosystem.config.js --max-memory-restart 1G
pm2 save
```

---

### Scenario 3: Queue Overflow Errors

**Resolution:**
```bash
# 1. Check queue metrics
curl http://localhost:3000/api/queue/metrics | jq

# 2. If single device overflowing, clear device queue
# (Use adaptive rate limiter reset or API)

# 3. If global, temporarily slow down polling
# Edit .env.production:
ICMP_POLL_INTERVAL=90000  # 90s instead of 60s
pm2 restart icmp-poller
```

---

## 📞 Escalation Contacts

### Primary On-Call Engineer
- **Name:** Lead DevOps
- **Phone:** +62-812-XXXX-XXXX
- **Telegram:** @devops_lead

### Database Administrator
- **Name:** DBA Lead
- **Phone:** +62-813-XXXX-XXXX
- **Telegram:** @dba_lead

### Development Lead
- **Name:** Lead Developer
- **Phone:** +62-814-XXXX-XXXX
- **Telegram:** @dev_lead

### Management Escalation
- **Name:** Technical Director
- **Phone:** +62-815-XXXX-XXXX

---

## 📋 Post-Incident Report Template

Create report for all P1 and P2 incidents within 24 hours:

```
INCIDENT POST-MORTEM REPORT
===========================

Incident ID: INC-YYYYMMDD-XX
Severity: P1 / P2
Date: YYYY-MM-DD
Duration: XX minutes (Start: HH:MM, End: HH:MM)
Lead Responder: Name

SUMMARY:
Brief description of what happened and business impact.

TIMELINE:
- HH:MM - Incident detected via alert / user report
- HH:MM - Initial response started
- HH:MM - Root cause identified
- HH:MM - Fix applied
- HH:MM - Service fully restored

ROOT CAUSE:
Detailed explanation of why the incident occurred.

RESOLUTION:
What actions were taken to resolve the incident.

PREVENTIVE ACTIONS:
1. [Action item 1 to prevent recurrence]
2. [Action item 2]
3. [Action item 3]

LESSONS LEARNED:
What went well, what could be improved.
```

---

**Keep this guide accessible on the production server!**
