# 🚀 HK-NOVA: Quick Start Guide for Production Deployment

## 📋 Prerequisites Checklist

- [ ] Server with 8+ CPU cores, 16GB+ RAM, 250GB+ SSD
- [ ] MySQL 8.0+ installed and running
- [ ] Node.js 18+ and pnpm installed
- [ ] PM2 installed globally (`npm install -g pm2`)
- [ ] Repository cloned to `/var/www/hk-nova`

---

## ⚡ 5-Minute Quick Setup

### 1. Install Dependencies (2 minutes)
```bash
cd /var/www/hk-nova
pnpm install
```

### 2. Configure Environment (1 minute)
```bash
# Copy production template
cp .env.production.template .env.production

# Generate secure keys
./scripts/generate-production-keys.sh

# Set proper permissions
chmod 600 .env.production
```

### 3. Setup Database (1 minute)
```bash
# Run database migrations
pnpm prisma migrate deploy

# Seed initial data (optional)
pnpm db:seed
```

### 4. Build Application (30 seconds)
```bash
pnpm build
```

### 5. Start Services (30 seconds)
```bash
# Start all workers with PM2
pnpm pm2:start

# Verify all running
pm2 list
```

**✅ System is now running!**

---

## 🧪 Quick Validation

### Test System Health
```bash
# Check API
curl http://localhost:3000/api/health

# Check workers
./scripts/monitoring/worker-health.sh

# Check database
mysql -u root -p -e "SELECT COUNT(*) FROM Device;"
```

**Expected:** All checks should return success.

---

## 📱 Add Your First Device

### Via API
```bash
curl -X POST http://localhost:3000/api/devices \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Router-01",
    "ip": "192.168.1.1",
    "type": "ROUTER"
  }'
```

### Via Web UI
1. Open http://localhost:3000
2. Navigate to Devices → Add Device
3. Fill in device details
4. Click Save

**Wait 1-2 minutes** for first poll results.

---

## 📊 Monitor System

### Real-time Monitoring
```bash
# System metrics (terminal 1)
./scripts/monitoring/performance-monitor.sh

# Worker logs (terminal 2)
pm2 logs

# Database connections (terminal 3)
watch -n 5 'mysql -u root -p -e "SHOW STATUS LIKE '\''Threads_connected'\'';"'
```

### Check Metrics Dashboard
```bash
# Get current metrics
curl http://localhost:3000/api/metrics | jq

# Get queue status
curl http://localhost:3000/api/queue/metrics | jq

# Get active alerts
curl http://localhost:3000/api/alerts?status=ACTIVE | jq
```

---

## 🧪 Run Load Test (Optional)

### Test with 50 Dummy Devices
```bash
# Create test devices
npx tsx scripts/testing/create-test-devices.ts --count=50 --clean

# Run baseline test (5 minutes)
./tests/load/run-tests.sh baseline 50 300

# View results
cat tests/load/results/*/SUMMARY.txt
```

### Clean Up Test Devices
```bash
npx tsx scripts/testing/create-test-devices.ts --count=0 --clean
```

---

## 🎯 Production Pilot: 50 Real Devices

### Week 1: Add 50 Production Devices

**Day 1-2: Add First 20 Devices**
1. Select 20 non-critical devices
2. Add via UI or API
3. Monitor closely for 24 hours

**Day 3-4: Add Next 20 Devices**
1. If Day 1-2 stable, add 20 more
2. Continue monitoring

**Day 5-7: Add Final 10 Devices**
1. Add remaining devices
2. Full week of monitoring
3. Document any issues

### Daily Monitoring Routine

**Morning (08:00):**
```bash
./scripts/monitoring/worker-health.sh
pm2 logs --lines 100 | grep ERROR
mysql -u root -p -e "SHOW PROCESSLIST;"
```

**Midday (12:00):**
```bash
curl http://localhost:3000/api/metrics | jq
curl http://localhost:3000/api/queue/metrics | jq
```

**Evening (18:00):**
```bash
curl http://localhost:3000/api/alerts?status=ACTIVE | jq
pm2 list
```

---

## 🚨 Common Issues & Quick Fixes

### Worker Not Starting
```bash
# Check logs
pm2 logs <worker-name> --err --lines 50

# Restart
pm2 restart <worker-name>

# If still fails, check env vars
grep -v '^#' .env.production | grep -v '^$'
```

### High CPU Usage
```bash
# Reduce concurrency in .env.production
ICMP_CONCURRENCY_LIMIT=5
SNMP_CONCURRENCY_LIMIT=5

# Restart workers
pnpm pm2:restart
```

### Database Connection Errors
```sql
-- Check connections
SHOW PROCESSLIST;

-- Increase limit
SET GLOBAL max_connections = 250;
```

### Disk Full
```bash
# Clean logs
pm2 flush

# Clean old metrics (>30 days)
npm run cleanup:old-metrics
```

---

## 📈 Scaling to 500 Devices

### Week 2: Scale to 150 Devices
- Day 1: Add 50 (total 100)
- Day 4: Add 50 (total 150)
- Monitor performance

### Week 3: Scale to 300 Devices
- Day 1: Add 75 (total 225)
- Day 4: Add 75 (total 300)
- Check resource usage

### Week 4: Scale to 500 Devices
- Day 1: Add 100 (total 400)
- Day 4: Add 100 (total 500)
- Full monitoring

**Success Criteria Each Week:**
- CPU <70%
- Memory stable
- Error rate <1%
- No worker crashes

---

## 🛑 Rollback Procedure

If issues occur during pilot:

### 1. Stop All Workers
```bash
pm2 stop all
```

### 2. Backup Current State
```bash
./scripts/backup-db.sh
cp .env.production .env.production.backup
```

### 3. Remove Problem Devices
```sql
-- Connect to MySQL
mysql -u root -p hk_nova_prod

-- Remove test/problem devices
DELETE FROM Device WHERE name LIKE 'TEST%';
DELETE FROM Device WHERE id IN ('device-id-1', 'device-id-2');
```

### 4. Restart System
```bash
pm2 restart all
```

### 5. Verify
```bash
./scripts/monitoring/worker-health.sh
curl http://localhost:3000/api/health
```

---

## 📞 Get Help

### Documentation
- **Full Guide:** `PRODUCTION_READINESS_REPORT.md`
- **Runbook:** `RUNBOOK.md`
- **Testing:** `PHASE5_TESTING_GUIDE.md`

### Logs & Debugging
```bash
# All logs
pm2 logs

# Specific worker
pm2 logs icmp-poller --lines 100

# Save logs for support
pm2 logs --lines 1000 > support-logs.txt
```

### System Status
```bash
# Quick health check
./scripts/monitoring/worker-health.sh

# Detailed metrics
curl http://localhost:3000/api/metrics | jq '.'

# Database status
mysql -u root -p -e "SHOW STATUS;"
```

---

## ✅ Success Indicators

**System is healthy when:**
- ✅ All workers showing "online" in `pm2 list`
- ✅ API responds in <500ms
- ✅ Devices show status (UP/DOWN)
- ✅ Alerts are created when devices go down
- ✅ Backups running successfully (check logs)
- ✅ CPU <70%, Memory <8GB

---

## 🎯 Next Steps After Pilot Success

1. **Document Lessons Learned**
   - What worked well?
   - What needed tuning?
   - Any unexpected issues?

2. **Optimize Configuration**
   - Adjust concurrency based on actual load
   - Tune polling intervals
   - Optimize database queries

3. **Scale Gradually**
   - Follow week-by-week plan
   - Monitor at each step
   - Don't rush

4. **Train Team**
   - Daily operations
   - Emergency procedures
   - Troubleshooting

---

## 🎓 Key Commands Reference

```bash
# Start system
pnpm pm2:start

# Stop system
pm2 stop all

# Restart system
pnpm pm2:restart

# View logs
pm2 logs

# Health check
./scripts/monitoring/worker-health.sh

# Monitor performance
./scripts/monitoring/performance-monitor.sh

# Test API
npx tsx tests/load/api-load-test.ts

# Backup database
./scripts/backup-db.sh

# Database shell
mysql -u root -p hk_nova_prod
```

---

**🚀 Ready to Deploy!**

Start with the Quick Setup above, then follow the Production Pilot plan.

**Good luck! 🎉**
