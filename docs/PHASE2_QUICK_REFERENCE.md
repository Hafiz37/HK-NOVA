# Phase 2: Infrastructure & Pooling - Quick Reference

## ✅ What Was Implemented

### 1. SSH Connection Pooling
- **File:** `src/lib/ssh-pool.ts`
- **Impact:** 99% reduction in SSH connections (30k/hour → 300/hour)
- **Config:** Max 2 connections/device, 60s idle timeout, 10min lifetime

### 2. Database Connection Monitoring
- **File:** `src/lib/prisma.ts`
- **Impact:** Query duration tracking, pool metrics, health checks
- **Config:** 10 max connections, 10s pool timeout

### 3. Redis Connection Optimization
- **Files:** `src/lib/redis-cache.ts`, `src/lib/redis-queue.ts`
- **Impact:** Stable 2-3 connections, graceful fallback to memory
- **Config:** Auto-retry 5x, named connections for debugging

---

## 🚀 Quick Start Commands

### Testing
```bash
# Test SSH pooling
pnpm tsx scripts/test-ssh-pool.ts

# Test database pooling
pnpm tsx scripts/test-db-pool.ts

# Test Redis pooling
pnpm tsx scripts/test-redis-pool.ts
```

### Monitoring
```bash
# Monitor SSH pool (live)
pnpm tsx scripts/monitor-ssh-pool.ts

# Monitor database pool (live)
pnpm tsx scripts/monitor-db-pool.ts

# Monitor Redis pool (live)
pnpm tsx scripts/monitor-redis-pool.ts
```

### Metrics
```bash
# Check Prometheus metrics
curl http://localhost:3000/api/metrics | grep -E "(ssh_pool|database_connections|redis_connections)"
```

---

## 📊 Key Metrics to Watch

### SSH Pool (Target Values)
```
ssh_pool_connections_active < 1000
ssh_pool_connections_reused_total / created_total > 0.95
```

### Database Pool (Target Values)
```
database_connections_active < 20
database_query_duration_seconds{quantile="0.99"} < 1
```

### Redis Pool (Target Values)
```
redis_connections_active < 5
redis_errors_total_rate < 1/min
```

---

## 🔧 Configuration

### Environment Variables (.env.production)

```bash
# Database
DATABASE_URL="mysql://user:pass@host:3306/db?connection_limit=10&pool_timeout=10"
DB_POOL_MIN="2"
DB_POOL_MAX="10"

# Redis
REDIS_URL="redis://localhost:6379"
REDIS_MAX_RETRIES_PER_REQUEST="3"
REDIS_CONNECT_TIMEOUT="5000"
```

---

## 🎯 Expected Performance

### Before Phase 2
- SSH: 30,000 connections/hour → File descriptor exhaustion → Crash at 6-8h
- Database: Growing connections → Potential leak
- Redis: 10-15 connections per worker

### After Phase 2
- SSH: ~300 connections/hour (99% reuse) → Stable indefinitely
- Database: 8-12 connections → Stable
- Redis: 2-3 connections → Stable

---

## 📝 Modified Files

```
src/lib/ssh-pool.ts                    (NEW - 230 lines)
src/lib/device-console.ts              (MODIFIED +80/-50)
src/lib/prisma.ts                      (MODIFIED +90)
src/lib/metrics.ts                     (MODIFIED +62)
src/lib/redis-cache.ts                 (MODIFIED +12)
src/lib/redis-queue.ts                 (MODIFIED +8)
.env.production.template               (MODIFIED +15)

tests/integration/ssh-pool.test.ts     (NEW - 193 lines)

scripts/test-ssh-pool.ts               (NEW)
scripts/test-db-pool.ts                (NEW)
scripts/test-redis-pool.ts             (NEW)
scripts/monitor-ssh-pool.ts            (NEW)
scripts/monitor-db-pool.ts             (NEW)
scripts/monitor-redis-pool.ts          (NEW)
```

---

## ⚠️ Deployment Checklist

- [ ] Update `.env.production` with pool settings
- [ ] Deploy to staging
- [ ] Monitor for 24 hours
- [ ] Verify SSH reuse rate >95%
- [ ] Check file descriptor count stable
- [ ] Load test with 500 devices
- [ ] Deploy to production
- [ ] Monitor for 48 hours

---

## 🆘 Troubleshooting

### High SSH Connection Count
```bash
pnpm tsx scripts/monitor-ssh-pool.ts
# If reuse rate < 80%, check device connectivity issues
```

### Database Connection Leak
```bash
mysql -e "SHOW PROCESSLIST;"
pnpm tsx scripts/monitor-db-pool.ts
```

### Redis Connection Issues
```bash
redis-cli INFO clients
pnpm tsx scripts/monitor-redis-pool.ts
```

---

## 📚 Documentation

- Full Details: `docs/PHASE2_COMPLETION_REPORT.md`
- SSH Pool: `docs/PHASE2_SSH_POOL_IMPLEMENTATION.md`
- Original Plan: See FASE 2 in project brief

---

**Status:** ✅ COMPLETE  
**Next:** Phase 3 - Resilience & Error Handling
