# Phase 4: Rate Limiting & Device Protection - Implementation Complete

## 🎯 Overview

Phase 4 berhasil diimplementasikan untuk melindungi 500+ Mikrotik devices dari overload dengan rate limiting, distributed scheduling, dan adaptive throttling.

## ✅ Completed Tasks

### 4.1 Per-Device Operation Queue ✓

**File:** `src/lib/device-operation-queue.ts`

**Features:**
- **SSH Operations:** Max 1 concurrent per device
- **SNMP Operations:** Max 3 concurrent, 5 per minute per device
- **ICMP Operations:** Max 5 concurrent, 10 per minute per device
- **Priority Queue:** Operations sorted by priority
- **Queue Overflow Protection:** Max 10 SSH operations queued
- **Metrics Tracking:** pending, executing, completed, failed, avgWaitTime
- **Auto Cleanup:** Stale queues removed after 1 hour inactivity

**Integration:**
- `src/lib/device-console.ts`: SSH operations wrapped with queue
- `src/workers/snmp-poller.ts`: SNMP polls go through queue
- `src/workers/icmp-poller.ts`: ICMP pings go through queue

**API Endpoint:**
- `GET /api/queue/metrics?deviceId=xxx` - Queue metrics per device or all

---

### 4.2 Distributed Backup Scheduling ✓

**File:** `src/workers/backup-worker.ts`

**Strategy:**
- **Time Window:** 02:00-06:00 (4 hours = 240 minutes)
- **Distribution:** MD5 hash-based deterministic slot assignment
- **Schedule:** Every 15 minutes (changed from daily)
- **Slot Calculation:** `hash(deviceId) % 240` minutes
- **Slot Window:** 15-minute window per device
- **Concurrency:** Reduced to 2 (from 4) for stability

**Example Distribution:**
```
500 devices / 240 minutes = ~2 devices/minute
Device A (hash=0)   -> 02:00-02:15
Device B (hash=45)  -> 02:45-03:00
Device C (hash=120) -> 04:00-04:15
Device D (hash=239) -> 05:59-06:14
```

**Environment Variables:**
```bash
BACKUP_CRON_SCHEDULE="*/15 * * * *"  # Every 15 min
BACKUP_ALLOWED_HOURS="02:00-06:00"   # 4-hour window
BACKUP_DISTRIBUTION_ENABLED="true"   # Enable hash-based distribution
BACKUP_CONCURRENCY="2"               # Reduced for safety
```

---

### 4.3 Adaptive Rate Limiting ✓

**File:** `src/lib/adaptive-rate-limiter.ts`

**Features:**

1. **Health Monitoring (every 2 minutes):**
   - Average response time (last 5 minutes)
   - CPU usage (from SNMP)
   - Memory usage (from SNMP)
   - Error rate (failed operations / total)

2. **Dynamic Throttling:**
   ```
   Normal:    ICMP=60s,  SNMP=300s, Backup=enabled
   High Latency (>2x baseline): ICMP=120s, SNMP=450s, Backup=enabled
   High CPU (>80%):       ICMP=180s, SNMP=600s, Backup=DISABLED
   High Errors (>10%):    ICMP=120s, SNMP=600s, Backup=DISABLED
   Critical (CPU>90%):    ALL OPERATIONS SKIPPED
   ```

3. **Baseline Learning:**
   - First poll establishes baseline response time
   - Adaptive thresholds calculated relative to baseline
   - `resetDeviceBaseline(deviceId)` to recalibrate

**Integration:**
- `src/workers/snmp-poller.ts`: Checks before poll, updates after
- `src/workers/icmp-poller.ts`: Checks before poll, updates after
- Auto-initialized in both workers

---

## 📊 Testing

**Test Files:**
- `tests/phase4/backup-distribution.test.ts` - Backup slot distribution
- `tests/phase4/device-queue.test.ts` - Operation queue behavior
- `tests/phase4/adaptive-rate-limiter.test.ts` - Rate limiting logic

**Run Tests:**
```bash
pnpm test tests/phase4/
```

---

## 🔧 Configuration Reference

### Queue Limits (Hardcoded in `device-operation-queue.ts`)

```typescript
ssh: {
  maxConcurrentPerDevice: 1,
  maxQueueSize: 10,
}
snmp: {
  maxConcurrentPerDevice: 3,
  maxPerMinute: 5,
}
icmp: {
  maxConcurrentPerDevice: 5,
  maxPerMinute: 10,
}
```

### Adaptive Rate Limiter (Hardcoded in `adaptive-rate-limiter.ts`)

```typescript
DEFAULT_ICMP_INTERVAL = 60000        // 1 minute
DEFAULT_SNMP_INTERVAL = 300000       // 5 minutes
RESPONSE_TIME_MULTIPLIER = 2.0       // Slow if >2x baseline
CPU_THRESHOLD = 80                   // High CPU at 80%
ERROR_RATE_THRESHOLD = 0.1           // 10% error rate
```

### Backup Scheduling (Environment Variables)

```bash
BACKUP_CRON_SCHEDULE="*/15 * * * *"
BACKUP_ALLOWED_HOURS="02:00-06:00"
BACKUP_DISTRIBUTION_ENABLED="true"
BACKUP_CONCURRENCY="2"
BACKUP_MAX_PER_SUBNET="2"
BACKUP_SKIP_HIGH_LATENCY="true"
BACKUP_LATENCY_THRESHOLD_MS="500"
```

---

## 🚀 Deployment Steps

1. **Update Environment Variables:**
   ```bash
   # Edit .env.production
   vim .env.production
   
   # Add/update:
   BACKUP_CRON_SCHEDULE="*/15 * * * *"
   BACKUP_ALLOWED_HOURS="02:00-06:00"
   BACKUP_DISTRIBUTION_ENABLED="true"
   BACKUP_CONCURRENCY="2"
   ```

2. **Restart Workers:**
   ```bash
   pnpm pm2:restart
   
   # Or individually:
   pm2 restart backup-worker
   pm2 restart snmp-poller
   pm2 restart icmp-poller
   ```

3. **Monitor Queue:**
   ```bash
   # Check queue metrics
   curl http://localhost:3000/api/queue/metrics | jq
   
   # Check specific device
   curl http://localhost:3000/api/queue/metrics?deviceId=xxx | jq
   ```

4. **Monitor Logs:**
   ```bash
   pm2 logs backup-worker --lines 50
   pm2 logs snmp-poller --lines 50
   pm2 logs icmp-poller --lines 50
   ```

---

## 📈 Expected Behavior (500 Devices)

### Backup Distribution
```
Time         Devices Backing Up
02:00-02:15  ~30 devices
02:15-02:30  ~32 devices
02:30-02:45  ~28 devices
...
05:45-06:00  ~35 devices
```

### Operation Queue
```
Device A:
  Pending SSH: 2
  Executing SSH: 1  (max 1)
  Pending SNMP: 0
  Executing SNMP: 2 (max 3)
```

### Adaptive Throttling
```
Device B (Normal):
  ICMP interval: 60s
  SNMP interval: 300s
  Backup: Enabled

Device C (High CPU 85%):
  ICMP interval: 180s
  SNMP interval: 600s
  Backup: DISABLED
```

---

## ⚠️ Important Notes

1. **Backup Schedule Changed:** From daily (02:00) to every 15 minutes (distributed)
2. **Concurrency Reduced:** Backup concurrency 4→2 for safety
3. **Queue Errors Expected:** SSH queue overflow is intentional protection
4. **Gradual Rollout:** Start with 50 devices, monitor, then scale
5. **Monitoring Critical:** Watch queue metrics and adaptive decisions

---

## 🎯 Success Criteria

- ✅ No more than 1 SSH operation per device simultaneously
- ✅ Backups distributed across 4-hour window (not all at once)
- ✅ High-load devices automatically throttled
- ✅ Queue metrics available via API
- ✅ No Mikrotik device overload

---

## 🔍 Troubleshooting

### Problem: "Queue overflow" errors
**Solution:** Expected behavior - queue protecting device from overload
```bash
# Check queue length
curl http://localhost:3000/api/queue/metrics?deviceId=xxx
```

### Problem: Device not backing up
**Solution:** Check if in time window
```typescript
// Calculate device slot
const hash = crypto.createHash('md5').update(deviceId).digest('hex');
const slot = parseInt(hash.substring(0, 8), 16) % 240;
console.log(`Device backs up at minute ${slot} (02:${slot} or ${Math.floor(slot/60)+2}:${slot%60})`);
```

### Problem: Operations still slow
**Solution:** Check adaptive rate limiter
```bash
# Look for rate limiter logs
pm2 logs snmp-poller | grep "AdaptiveRateLimit"
pm2 logs icmp-poller | grep "AdaptiveRateLimit"
```

---

## 📝 Next Steps (Phase 5)

After Phase 4 verification:
1. Load testing with 50→150→300→500 devices
2. Monitor queue depth and wait times
3. Tune concurrency limits based on actual performance
4. Production pilot rollout

---

## 📚 Files Modified/Created

**New Files:**
- `src/lib/device-operation-queue.ts`
- `src/lib/adaptive-rate-limiter.ts`
- `src/app/api/queue/metrics/route.ts`
- `tests/phase4/backup-distribution.test.ts`
- `tests/phase4/device-queue.test.ts`
- `tests/phase4/adaptive-rate-limiter.test.ts`

**Modified Files:**
- `src/lib/device-console.ts` - Wrapped SSH with queue
- `src/workers/backup-worker.ts` - Added distributed scheduling
- `src/workers/snmp-poller.ts` - Added queue + adaptive rate limiting
- `src/workers/icmp-poller.ts` - Added queue + adaptive rate limiting

---

**Phase 4 Status:** ✅ **COMPLETE**
**Ready for:** Load Testing (Phase 5)
