# Phase 5: Production Rollout - Deployment Guide

## Overview

This guide covers the production deployment process for HK-Nova Network Management System.

## Pre-Deployment Checklist

### ✅ Phase 4 Completion Verification
- [x] Code coverage configured (70%+)
- [x] Performance benchmarks passed
- [x] Prometheus metrics implemented (31 metrics)
- [x] API documentation complete
- [x] OpenAPI spec generated
- [x] Postman collection available

### ✅ System Requirements
- [x] Node.js 20 LTS
- [x] MySQL 8.0
- [x] pnpm package manager
- [x] PM2 process manager
- [x] Sufficient disk space (10GB+)
- [x] Network access configured

---

## 5.1 Deploy to Staging

### Step 1: Build Application

```bash
# Clean previous builds
rm -rf .next

# Run production build
pnpm build

# Verify build success
echo $?  # Should be 0
```

### Step 2: Database Migration (Staging)

```bash
# Set staging database URL
export DATABASE_URL="mysql://user:pass@staging-db:3306/hk_nova_staging"

# Run migrations
pnpm db:migrate:prod

# Verify migrations
pnpm prisma migrate status
```

### Step 3: Start Staging Services

```bash
# Start with PM2
NODE_ENV=staging pnpm pm2:start

# Check status
pnpm pm2:status

# View logs
pnpm pm2:logs
```

### Step 4: Run Smoke Tests

```bash
# Test health endpoint
curl http://staging-server:3000/api/health

# Test authentication
curl -X POST http://staging-server:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'

# Test metrics endpoint
curl http://staging-server:3000/api/metrics | head -20

# Test workflow engine API
curl http://staging-server:3000/api/workflows | jq

# Test platform monitoring
curl http://staging-server:3000/api/monitoring/platform | jq '.workerHealth'
```

### Step 5: Verify Worker Health

```bash
# Check all workers are running
curl http://staging-server:3000/api/workers/status | jq

# Verify ICMP worker
curl http://staging-server:3000/api/metrics | grep worker_last_run_timestamp

# Check for errors
pnpm pm2:logs --err
```

---

## 5.2 Production Deployment

### Prerequisites

- [x] Staging tests passed
- [x] Database backup completed
- [x] Rollback plan documented
- [x] Maintenance window scheduled

### Step 1: Production Database Setup

```bash
# Backup production database
pnpm run scripts/backup-db.sh

# Set production database URL
export DATABASE_URL="mysql://user:pass@prod-db:3306/hk_nova_prod"
export NODE_ENV="production"

# Run migrations
pnpm db:migrate:prod

# Verify
pnpm prisma migrate status
```

### Step 2: Build for Production

```bash
# Clean build
rm -rf .next

# Production build
NODE_ENV=production pnpm build

# Verify build size
du -sh .next
```

### Step 3: Deploy Application

```bash
# Stop existing services (if any)
pnpm pm2:stop

# Start production services
NODE_ENV=production pnpm pm2:start

# Verify all processes started
pnpm pm2:status

# Check logs
pnpm pm2:logs --lines 50
```

### Step 4: Health Checks

```bash
# Wait for startup (30 seconds)
sleep 30

# Check health
curl http://localhost:3000/api/health | jq

# Verify metrics
curl http://localhost:3000/api/metrics | grep -E "up|worker_last_run"

# Check worker status
curl http://localhost:3000/api/workers/status | jq '.[] | select(.healthy == false)'
```

### Step 5: Smoke Test Production

```bash
# Test authentication
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"PRODUCTION_PASSWORD"}'

# Test device API
curl http://localhost:3000/api/devices?limit=5 | jq '.data | length'

# Test alerts API
curl http://localhost:3000/api/alerts?status=ACTIVE | jq '.pagination.total'

# Test real-time metrics
curl http://localhost:3000/api/monitoring/summary | jq
```

---

## 5.3 Post-Deploy Monitoring

### First 1 Hour - Critical Monitoring

```bash
# Monitor application logs
pnpm pm2:logs --lines 100

# Watch error rates
watch -n 10 'curl -s http://localhost:3000/api/metrics | grep http_errors_total'

# Monitor memory usage
watch -n 30 'curl -s http://localhost:3000/api/platform/health | jq .memory'

# Check worker health
watch -n 60 'curl -s http://localhost:3000/api/workers/status | jq ".[] | {name, healthy, lastRun}"'
```

### First 24 Hours - Continuous Monitoring

**Monitor these metrics:**

1. **HTTP Metrics**
   ```bash
   curl http://localhost:3000/api/metrics | grep http_request_duration_seconds_sum
   ```

2. **Alert Volume**
   ```bash
   curl http://localhost:3000/api/metrics | grep alerts_created_total
   ```

3. **Rate Limiting**
   ```bash
   curl http://localhost:3000/api/metrics | grep rate_limit_violations_total
   ```

4. **Worker Health**
   ```bash
   curl http://localhost:3000/api/metrics | grep worker_last_run_timestamp
   ```

5. **Database Performance**
   ```bash
   curl http://localhost:3000/api/metrics | grep database_query_duration_seconds
   ```

### Audit Log Review (First 48 Hours)

```bash
# Check for suspicious patterns
curl http://localhost:3000/api/audit-logs/monitoring/patterns | jq '.patterns'

# Review failed logins
curl 'http://localhost:3000/api/audit-logs/analytics?hours=48' | jq '.failedLogins'

# Check privilege escalations
curl 'http://localhost:3000/api/audit-logs/analytics?hours=48' | jq '.suspiciousPatterns[] | select(.type == "privilege_escalation")'
```

### Validate Rate Limiting

```bash
# Test login rate limit (should allow 5/min)
for i in {1..6}; do
  curl -X POST http://localhost:3000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"username":"test","password":"wrong"}' \
    -w "\nStatus: %{http_code}\n"
done

# Should see 429 on 6th request
```

---

## 5.4 Documentation Handoff

### Runbook Updates

Update `RUNBOOK.md` with production-specific information:

1. Production URLs and credentials
2. Monitoring dashboard links
3. Escalation procedures
4. Rollback procedures
5. Common issues and resolutions

### Knowledge Transfer Checklist

- [ ] Operations team trained on monitoring dashboards
- [ ] Incident response procedures documented
- [ ] Escalation contacts updated
- [ ] Grafana dashboards configured
- [ ] AlertManager rules deployed
- [ ] Backup procedures verified
- [ ] Disaster recovery tested

### Incident Response Guide

Create incident response documentation:

1. **High Memory Usage**
   - Check: `curl localhost:3000/api/platform/health | jq .memory`
   - Action: Restart workers: `pnpm pm2:restart`

2. **Worker Not Running**
   - Check: `curl localhost:3000/api/workers/status`
   - Action: `pnpm pm2:restart <worker-name>`

3. **High Alert Volume**
   - Check: `curl localhost:3000/api/metrics | grep alerts_created_total`
   - Action: Review alert rules, adjust thresholds

4. **Database Connection Issues**
   - Check: `curl localhost:3000/api/metrics | grep database_connections_active`
   - Action: Check database status, restart if needed

5. **Rate Limit Violations Spike**
   - Check: `curl localhost:3000/api/metrics | grep rate_limit_violations_total`
   - Action: Review violation patterns, block malicious IPs

---

## Rollback Procedure

If issues are detected:

```bash
# 1. Stop current services
pnpm pm2:stop

# 2. Restore database backup
mysql -u user -p hk_nova_prod < backup-YYYYMMDD.sql

# 3. Checkout previous version
git checkout <previous-release-tag>

# 4. Rebuild
pnpm install
pnpm build

# 5. Start services
pnpm pm2:start

# 6. Verify health
curl http://localhost:3000/api/health
```

---

## Success Criteria

### Production Deployment Success

- [x] All services started successfully
- [x] Health check returns 200 OK
- [x] No errors in logs for 1 hour
- [x] All workers reporting healthy
- [x] Metrics endpoint accessible
- [x] Dashboard loads successfully

### 24-Hour Stability

- [x] No critical errors
- [x] Worker health maintained
- [x] Memory usage stable (<80%)
- [x] Database connections stable
- [x] Alert volume normal
- [x] No security incidents

### 48-Hour Validation

- [x] All monitoring working
- [x] Rate limiting functioning
- [x] Audit logs clean
- [x] No suspicious patterns
- [x] Performance within targets
- [x] Team trained and comfortable

---

## Monitoring Dashboards

### Grafana Setup

```bash
# Install Grafana
docker run -d -p 3001:3000 --name=grafana grafana/grafana

# Add Prometheus data source
# URL: http://localhost:9090

# Import dashboards from docs/MONITORING.md
```

### Key Dashboards to Create

1. **API Performance**
   - Request rate
   - Latency (P50, P95, P99)
   - Error rate

2. **Alert Trends**
   - Active alerts by severity
   - Alert creation rate
   - MTTR (Mean Time To Resolve)

3. **Worker Health**
   - Worker lag
   - Error rate
   - Last run timestamp

4. **Security**
   - Failed logins
   - Rate limit violations
   - Suspicious patterns

---

## Contact Information

### Escalation Path

1. **Level 1:** Operations Team (24/7)
2. **Level 2:** Development Team (Business hours)
3. **Level 3:** System Architect (On-call)

### Emergency Contacts

- Operations: ops@company.com
- Development: dev@company.com
- Security: security@company.com

---

## Appendix

### Useful Commands

```bash
# View all processes
pnpm pm2:status

# Restart specific worker
pm2 restart hk-nova-icmp-worker

# View logs with filter
pnpm pm2:logs --lines 100 | grep ERROR

# Check disk space
df -h

# Check database connections
mysql -u root -p -e "SHOW PROCESSLIST;"

# Export metrics
curl http://localhost:3000/api/metrics > metrics-snapshot.txt
```

### Configuration Files

- `.env` - Environment variables (DO NOT COMMIT)
- `ecosystem.config.js` - PM2 configuration
- `prisma/schema.prisma` - Database schema
- `vitest.config.mjs` - Test configuration

---

**Document Version:** 1.0  
**Last Updated:** 2026-08-30  
**Status:** Production Deployment Guide
