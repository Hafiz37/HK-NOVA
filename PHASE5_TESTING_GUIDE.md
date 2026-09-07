# Phase 5: Load Testing & Optimization - Complete Guide

## 🎯 Overview

Phase 5 menyediakan tools untuk load testing dan monitoring system dengan 50-500+ devices, plus optimization guidelines berdasarkan hasil testing.

---

## 📦 What's Included

### 1. Test Device Generator
**File:** `scripts/testing/create-test-devices.ts`

Creates dummy devices for load testing.

**Usage:**
```bash
# Create 50 test devices
npx tsx scripts/testing/create-test-devices.ts --count=50 --clean

# Create 500 test devices with custom prefix
npx tsx scripts/testing/create-test-devices.ts --count=500 --prefix=LOAD-TEST

# See all options
npx tsx scripts/testing/create-test-devices.ts --help
```

**Features:**
- Deterministic IP assignment (10.0.0.1+)
- Device type distribution: 60% Router, 30% Switch, 10% OLT
- Batch creation (50 at a time for speed)
- Clean existing test devices before creating new ones

---

### 2. Load Testing Runner
**File:** `tests/load/run-tests.sh`

Orchestrates load testing scenarios.

**Usage:**
```bash
# Baseline test: 100 devices for 5 minutes
./tests/load/run-tests.sh baseline 100 300

# Capacity test: Gradual increase 50→500 devices
./tests/load/run-tests.sh capacity

# Soak test: 500 devices for 1 hour
./tests/load/run-tests.sh soak 500 3600

# Help
./tests/load/run-tests.sh help
```

**What it does:**
1. Creates test devices
2. Waits for workers to start polling
3. Collects metrics at regular intervals
4. Generates summary report

**Results location:** `tests/load/results/`

---

### 3. API Load Testing
**File:** `tests/load/api-load-test.ts`

Tests API endpoints under concurrent load.

**Usage:**
```bash
# Run API load tests
npx tsx tests/load/api-load-test.ts

# With custom API URL
API_URL=http://production-server:3000 npx tsx tests/load/api-load-test.ts
```

**Tests:**
- `GET /api/devices` - 100 requests, 10 concurrent
- `GET /api/metrics` - 100 requests, 10 concurrent
- `GET /api/alerts` - 100 requests, 10 concurrent
- `GET /api/queue/metrics` - 50 requests, 5 concurrent

**Success Criteria:**
- ✅ 99%+ success rate
- ✅ P95 latency < 500ms

---

### 4. Performance Monitor
**File:** `scripts/monitoring/performance-monitor.sh`

Real-time system monitoring during tests.

**Usage:**
```bash
# Start monitoring (updates every 5s)
./scripts/monitoring/performance-monitor.sh

# Custom output directory and interval
./scripts/monitoring/performance-monitor.sh ./my-metrics 10
```

**Monitors:**
- CPU usage (%)
- Memory usage (GB)
- Database connections
- Process count
- Network connections
- Disk I/O

**Output:**
- Real-time terminal display
- Log file with timestamps
- Auto-generated summary report (Ctrl+C)

---

### 5. Worker Health Check
**File:** `scripts/monitoring/worker-health.sh`

Checks and restarts workers if needed.

**Usage:**
```bash
# One-time health check
./scripts/monitoring/worker-health.sh

# Auto-restart failed workers
./scripts/monitoring/worker-health.sh --auto-restart

# Continuous monitoring (checks every 60s)
./scripts/monitoring/worker-health.sh --monitor --auto-restart
```

**Checks:**
- Worker process status
- CPU usage per worker
- Memory usage per worker
- Uptime

---

## 🧪 Testing Workflow

### Step 1: Prepare System
```bash
# Ensure all services are running
pnpm pm2:start

# Verify health
./scripts/monitoring/worker-health.sh
```

### Step 2: Run Baseline Test (50 Devices)
```bash
# Terminal 1: Start monitoring
./scripts/monitoring/performance-monitor.sh

# Terminal 2: Run baseline test
./tests/load/run-tests.sh baseline 50 300
```

**Monitor for:**
- CPU < 70%
- Memory stable (no leaks)
- No worker crashes
- Error rate < 1%

### Step 3: Run Capacity Test (50→500)
```bash
# This will test: 50, 100, 200, 300, 400, 500 devices
# Each stage runs for 5 minutes
./tests/load/run-tests.sh capacity
```

**Watch for:**
- Performance degradation at what count?
- Memory growth pattern
- Database connection usage
- Queue depth

### Step 4: Run API Load Test
```bash
npx tsx tests/load/api-load-test.ts
```

**Expected:**
- ✅ P95 < 500ms
- ✅ Success rate > 99%

### Step 5: Run Soak Test (Sustained Load)
```bash
# 500 devices for 1 hour
./tests/load/run-tests.sh soak 500 3600
```

**Look for:**
- Memory leaks (gradual increase)
- Worker stability
- Database connection leaks
- Disk space growth

---

## 📊 Analyzing Results

### Result Structure
```
tests/load/results/
└── baseline_100_devices_20260907_031923/
    ├── device-creation.log          # Device creation output
    ├── metrics_start.txt            # Initial system state
    ├── metrics_1.txt                # Metrics at interval 1
    ├── metrics_2.txt                # Metrics at interval 2
    ├── ...
    ├── metrics_end.txt              # Final system state
    ├── api_metrics_start.json       # API metrics at start
    ├── api_metrics_end.json         # API metrics at end
    ├── queue_metrics_end.json       # Queue status at end
    └── SUMMARY.txt                  # Test summary
```

### Key Metrics to Check

**1. CPU Usage**
```bash
# Compare start vs end
grep "Cpu(s)" results/*/SUMMARY.txt
```
- ✅ Good: < 70% average
- ⚠️ Warning: 70-85%
- ❌ Critical: > 85%

**2. Memory Usage**
```bash
# Check for leaks
grep "Mem:" results/*/metrics_*.txt
```
- ✅ Good: Stable over time
- ❌ Bad: Gradual increase (leak)

**3. Database Connections**
```bash
mysql -u root -p -e "SHOW STATUS LIKE 'Threads_connected';"
```
- ✅ Good: < 150 (out of 200 limit)
- ⚠️ Warning: 150-180
- ❌ Critical: > 180

**4. Queue Depth**
```bash
curl http://localhost:3000/api/queue/metrics | jq
```
- ✅ Good: pending < 5 per device
- ⚠️ Warning: pending 5-10
- ❌ Bad: pending > 10 (queue overflow)

---

## 🔧 Performance Optimization

### Problem 1: High CPU Usage

**Symptoms:**
- CPU > 80% sustained
- Workers slow to respond

**Solutions:**
```bash
# Reduce polling concurrency
# Edit .env.production
ICMP_CONCURRENCY_LIMIT=5  # Down from 10
SNMP_CONCURRENCY_LIMIT=5  # Down from 10

# Increase polling intervals
ICMP_POLL_INTERVAL=90000  # 90s instead of 60s
SNMP_POLL_INTERVAL=360000 # 6min instead of 5min

# Restart workers
pnpm pm2:restart
```

### Problem 2: Memory Leak

**Symptoms:**
- Memory usage increases over time
- Workers crash after hours

**Solutions:**
```bash
# Enable PM2 auto-restart on memory limit
pm2 start ecosystem.config.js --max-memory-restart 1G

# Check for leaks in code
# Add to workers:
setInterval(() => {
  if (global.gc) global.gc();
}, 300000); // Force GC every 5 min
```

### Problem 3: Database Connection Exhaustion

**Symptoms:**
- "Too many connections" errors
- Slow queries

**Solutions:**
```sql
-- Increase MySQL connection limit
SET GLOBAL max_connections = 300;

-- Check for connection leaks
SHOW PROCESSLIST;
```

```typescript
// Reduce Prisma connection pool
DATABASE_URL="mysql://...?connection_limit=15&pool_timeout=20"
```

### Problem 4: Queue Overflow

**Symptoms:**
- "Queue overflow" errors
- Operations delayed

**Solutions:**
```typescript
// In device-operation-queue.ts, increase limits:
ssh: {
  maxQueueSize: 20,  // Up from 10
}
```

Or reduce operation rate:
```bash
# Enable adaptive rate limiting (should already be on)
# It will auto-throttle busy devices
```

### Problem 5: Slow API Responses

**Symptoms:**
- P95 latency > 500ms
- Timeout errors

**Solutions:**
```bash
# Add database indexes
npx prisma migrate dev --name add_performance_indexes

# Enable query caching
ENABLE_QUERY_CACHE=true

# Optimize slow queries
pm2 logs api | grep "slow query"
```

---

## 🎯 Success Criteria (500 Devices)

### ✅ System Performance
- [ ] CPU < 70% average
- [ ] Memory stable (< 8GB, no leaks)
- [ ] P95 API latency < 500ms
- [ ] Error rate < 1%
- [ ] 99.9% uptime during test

### ✅ Worker Stability
- [ ] No worker crashes during 1-hour soak test
- [ ] All workers respond within 30s
- [ ] Graceful shutdown works

### ✅ Database Health
- [ ] Connection count < 150
- [ ] No slow queries (> 2s)
- [ ] No deadlocks

### ✅ Queue Performance
- [ ] Average wait time < 5s
- [ ] Queue depth < 10 per device
- [ ] No overflow for normal operations

---

## 📝 Example Test Schedule

### Day 1: Baseline (50-100 devices)
```bash
# Morning: 50 devices
./tests/load/run-tests.sh baseline 50 300

# Afternoon: 100 devices
./tests/load/run-tests.sh baseline 100 300

# Review results, adjust if needed
```

### Day 2: Capacity Test (100-300 devices)
```bash
# Run gradual increase
./tests/load/run-tests.sh capacity

# Monitor closely at each step
```

### Day 3: High Load (400-500 devices)
```bash
# Morning: 400 devices for 30 minutes
./tests/load/run-tests.sh baseline 400 1800

# Afternoon: 500 devices for 30 minutes
./tests/load/run-tests.sh baseline 500 1800
```

### Day 4: Soak Test (500 devices)
```bash
# Full day: 500 devices for 8 hours
./tests/load/run-tests.sh soak 500 28800

# Monitor throughout the day
# Check for memory leaks, connection leaks
```

### Day 5: API Load Test
```bash
# Test API under concurrent load
npx tsx tests/load/api-load-test.ts

# If passed, system is ready for production
```

---

## 🚨 Troubleshooting

### Test Failed: Device creation timeout
```bash
# Increase database timeout
DATABASE_URL="mysql://...?connect_timeout=30"

# Or reduce batch size in create-test-devices.ts
const batchSize = 25; // Down from 50
```

### Test Failed: Workers not polling
```bash
# Check worker logs
pm2 logs icmp-poller --lines 50
pm2 logs snmp-poller --lines 50

# Restart workers
pnpm pm2:restart
```

### Test Failed: Out of memory
```bash
# Increase system swap
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

### Test Failed: Disk full
```bash
# Clean old logs
pm2 flush

# Clean old metrics
npm run cleanup:old-metrics

# Increase log rotation
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

---

## 📚 Files Created

**Testing:**
- `scripts/testing/create-test-devices.ts` - Device generator
- `tests/load/run-tests.sh` - Load test orchestrator
- `tests/load/api-load-test.ts` - API load tester

**Monitoring:**
- `scripts/monitoring/performance-monitor.sh` - Real-time metrics
- `scripts/monitoring/worker-health.sh` - Worker health check

---

**Phase 5 Status:** ✅ **COMPLETE**

**Next:** Production Pilot (Phase 6)
- Deploy to production with 50 real devices
- Monitor for 7 days
- Gradually scale to 500+
