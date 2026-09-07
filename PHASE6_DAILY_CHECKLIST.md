# 📋 Phase 6: Daily Operational Checklist

## 🌅 Morning Routine (08:00 - 09:00)

### 1. System Health Check
```bash
# Check worker status
./scripts/monitoring/worker-health.sh

# View PM2 status
pm2 list

# Check API health
curl http://localhost:3000/api/health
```

**Pass Criteria:**
- [ ] All workers showing "online"
- [ ] API returning status 200
- [ ] Zero worker restarts in last 12 hours

---

### 2. Review Overnight Logs
```bash
# Check for errors in last 12 hours
pm2 logs --err --lines 200 | grep -i "error"

# Check worker-specific logs
pm2 logs icmp-poller --lines 50
pm2 logs snmp-poller --lines 50
pm2 logs backup-worker --lines 50
```

**Pass Criteria:**
- [ ] No uncaught exceptions
- [ ] No database connection errors
- [ ] Error count <10 for non-critical errors

---

### 3. Database Status Check
```bash
# Check database connections
mysql -u root -p -e "SHOW STATUS LIKE 'Threads_connected';"

# Check process list
mysql -u root -p -e "SHOW PROCESSLIST;"
```

**Pass Criteria:**
- [ ] Active connections <150
- [ ] No locked queries
- [ ] No queries running >10s

---

### 4. Disk & Resource Check
```bash
# System resources
htop

# Disk usage
df -h
```

**Pass Criteria:**
- [ ] CPU <70%
- [ ] Memory <8GB
- [ ] Disk usage <80%

---

### 5. Backup Verification
```bash
# Check backup files
ls -lh /var/backups/hk-nova/ | tail -10

# Verify backup worker logs
pm2 logs backup-worker --lines 100 | grep -i "completed"
```

**Pass Criteria:**
- [ ] Daily backups created
- [ ] File sizes normal (>1MB)
- [ ] Backup worker showing successful cycles

---

## ☀️ Midday Routine (12:00 - 13:00)

### 1. Metrics Check
```bash
# System metrics
curl http://localhost:3000/api/metrics | jq

# Queue status
curl http://localhost:3000/api/queue/metrics | jq
```

**Pass Criteria:**
- [ ] Polling rates normal
- [ ] Queue depths <10 per device
- [ ] Average wait times <5s

---

### 2. Active Alerts Review
```bash
# Check active alerts
curl http://localhost:3000/api/alerts?status=ACTIVE | jq
```

**Pass Criteria:**
- [ ] Critical alerts <5
- [ ] All alerts acknowledged or investigated
- [ ] No false positive floods

---

### 3. Device Addition (if scheduled)
- [ ] Select scheduled devices
- [ ] Verify IP and credentials
- [ ] Add via UI or API
- [ ] Monitor for 30 minutes
- [ ] Verify polling working

---

## 🌆 Evening Routine (18:00 - 19:00)

### 1. End-of-Day Health Check
```bash
# Health check
./scripts/monitoring/worker-health.sh

# Review day's performance
./scripts/monitoring/performance-monitor.sh
```

**Pass Criteria:**
- [ ] System stable all day
- [ ] No performance degradation
- [ ] Memory stable

---

### 2. Daily Metrics Recording
Record in daily log:
- Total devices: ____
- Active devices: ____
- System CPU avg: ____%
- Memory avg: ____GB
- Total alerts: ____
- Errors logged: ____

---

### 3. Overnight Preparation
- [ ] On-call engineer designated
- [ ] Emergency contact info verified
- [ ] Automated monitoring active
- [ ] Backup schedule active

---

## 📊 Weekly Routine (Every Monday)

- [ ] Full system log review
- [ ] Database maintenance (OPTIMIZE TABLES)
- [ ] Clean old log files: `pm2 flush`
- [ ] Review performance trends
- [ ] Weekly status report to management
- [ ] Go/No-Go decision for next phase

---

## 🚨 Emergency Checks (If System Unstable)

```bash
# 1. Quick worker restart
pm2 restart all

# 2. Check resource hog
top -bn1 | head -20

# 3. Check network connectivity
ping -c 4 192.168.1.1

# 4. Check database
mysql -u root -p -e "SHOW STATUS LIKE 'Threads_connected';"

# 5. Review critical logs
pm2 logs --err --lines 500
```

---

**Keep this checklist available in the operations room!**
