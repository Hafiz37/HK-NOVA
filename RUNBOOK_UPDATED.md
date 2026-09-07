# HK-NOVA Operations Runbook
# Version: 2.0
# Last Updated: 2026-09-07

## Quick Reference

### Service URLs
- **Production App**: http://localhost:3000
- **Staging App**: http://localhost:3000 (staging server)
- **Grafana**: http://localhost:3001
- **Prometheus**: http://localhost:9090

### Emergency Contacts
- **Level 1 (Operations)**: ops@company.com
- **Level 2 (Development)**: dev@company.com  
- **Level 3 (DevOps/SRE)**: devops@company.com

---

## Common Operations

### Starting Services

#### Development Mode (Local)
```bash
# Start database and redis
pnpm db:migrate

# Start web server
pnpm dev

# Start workers (separate terminal)
pnpm pm2:start
```

#### Production Mode (Docker)
```bash
# Start all services
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f
```

### Stopping Services

#### Development
```bash
# Stop workers
pnpm pm2:stop

# Stop dev server (Ctrl+C)
```

#### Production (Docker)
```bash
# Stop gracefully
docker-compose stop

# Stop and remove containers
docker-compose down

# Stop and remove volumes (DANGER!)
docker-compose down -v
```

### Viewing Logs

#### Development (PM2)
```bash
# All workers
pnpm pm2:logs

# Specific worker
pm2 logs hk-nova-icmp-worker

# Last 100 lines
pm2 logs --lines 100

# Error logs only
pm2 logs --err
```

#### Production (Docker)
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f app

# Last 100 lines
docker-compose logs --tail=100 app

# Follow new logs
docker-compose logs -f --tail=0
```

---

## Health Monitoring

### Quick Health Check
```bash
# Application health
curl http://localhost:3000/api/health | jq

# Expected output:
# {
#   "status": "healthy",
#   "database": { "connected": true },
#   "redis": { "connected": true },
#   "uptime": 3600
# }
```

### Worker Status
```bash
# Check all workers
curl http://localhost:3000/api/workers/status | jq

# Check specific worker
curl http://localhost:3000/api/workers/status | jq '.[] | select(.name == "icmp-poller")'
```

### Metrics Check
```bash
# View all metrics
curl http://localhost:3000/api/metrics

# Check if up
curl -s http://localhost:3000/api/metrics | grep "up 1"

# Check request rate
curl -s http://localhost:3000/api/metrics | grep "http_requests_total"

# Check worker health
curl -s http://localhost:3000/api/metrics | grep "worker_healthy"
```

---

## Troubleshooting Guide

### Problem: Application Won't Start

**Symptoms:**
- Health check returns 502/503
- Container crashes immediately
- Connection refused errors

**Diagnosis:**
```bash
# Check logs
docker-compose logs app --tail=100

# Check container status
docker-compose ps

# Check port conflicts
netstat -tuln | grep 3000
```

**Solutions:**

1. **Database not ready:**
```bash
# Check MySQL
docker-compose logs mysql --tail=50
docker exec hk-nova-mysql mysqladmin ping

# Restart MySQL
docker-compose restart mysql

# Wait 10 seconds then restart app
sleep 10 && docker-compose restart app
```

2. **Port already in use:**
```bash
# Find process using port 3000
lsof -ti:3000

# Kill it (if safe)
kill $(lsof -ti:3000)

# Or change port in .env
# PORT=3001
```

3. **Migration issues:**
```bash
# Run migrations manually
docker-compose run --rm app pnpm db:migrate:prod

# Check migration status
docker-compose run --rm app pnpm prisma migrate status
```

### Problem: High Memory Usage

**Symptoms:**
- Container keeps restarting
- OOM (Out of Memory) errors
- Slow response times

**Diagnosis:**
```bash
# Check memory usage
docker stats

# Check application memory
curl http://localhost:3000/api/platform/health | jq .memory

# Check for memory leaks
docker-compose logs app | grep "memory"
```

**Solutions:**

1. **Restart workers:**
```bash
docker-compose restart app
```

2. **Increase memory limits:**
```yaml
# docker-compose.yml
services:
  app:
    deploy:
      resources:
        limits:
          memory: 2G  # Increase from 1G
```

3. **Check for memory leaks:**
```bash
# Monitor memory over time
watch -n 10 'curl -s http://localhost:3000/api/platform/health | jq .memory'
```

### Problem: Database Connection Issues

**Symptoms:**
- "Connection refused" errors
- "Too many connections" errors
- Slow queries

**Diagnosis:**
```bash
# Check MySQL status
docker-compose logs mysql --tail=50

# Check connections
docker exec hk-nova-mysql mysql -u root -p -e "SHOW PROCESSLIST;"

# Check connection pool
curl http://localhost:3000/api/metrics | grep database_connections
```

**Solutions:**

1. **Too many connections:**
```sql
-- Connect to MySQL
docker exec -it hk-nova-mysql mysql -u root -p

-- Check current connections
SHOW PROCESSLIST;

-- Kill idle connections
KILL <process_id>;

-- Increase max connections (if needed)
SET GLOBAL max_connections = 200;
```

2. **Connection pool exhausted:**
```bash
# Restart application
docker-compose restart app

# Check pool configuration in .env
# DATABASE_URL should include connection pool params:
# ?connection_limit=10&pool_timeout=10
```

### Problem: Workers Not Processing

**Symptoms:**
- No new data in dashboard
- Worker "lastRun" timestamp old
- Worker marked as unhealthy

**Diagnosis:**
```bash
# Check worker status
curl http://localhost:3000/api/workers/status | jq

# Check worker logs
docker-compose logs app | grep "worker"

# Check worker metrics
curl http://localhost:3000/api/metrics | grep "worker_"
```

**Solutions:**

1. **Restart application:**
```bash
docker-compose restart app
```

2. **Check worker errors:**
```bash
# View error logs
docker-compose logs app | grep -i "error" | tail -50
```

3. **Check cron schedules:**
```bash
# Verify worker intervals in ecosystem.config.js
cat ecosystem.config.js | grep -A 5 "worker"
```

### Problem: Redis Connection Failed

**Symptoms:**
- Cache miss every request
- "Redis connection refused"
- Slow API responses

**Diagnosis:**
```bash
# Check Redis status
docker-compose logs redis --tail=50

# Test Redis
docker exec hk-nova-redis redis-cli ping

# Check Redis metrics
docker exec hk-nova-redis redis-cli INFO
```

**Solutions:**

1. **Restart Redis:**
```bash
docker-compose restart redis

# Wait then restart app
sleep 5 && docker-compose restart app
```

2. **Clear Redis cache:**
```bash
# Flush all cache (DANGER in production!)
docker exec hk-nova-redis redis-cli FLUSHALL

# Or specific keys
docker exec hk-nova-redis redis-cli DEL "cache:*"
```

### Problem: High CPU Usage

**Symptoms:**
- Slow response times
- High load average
- CPU at 100%

**Diagnosis:**
```bash
# Check CPU usage
docker stats

# Check process CPU
top -b -n 1 | grep node

# Check application metrics
curl http://localhost:3000/api/metrics | grep cpu
```

**Solutions:**

1. **Identify bottleneck:**
```bash
# Check slow queries
docker-compose logs app | grep "slow query"

# Check worker lag
curl http://localhost:3000/api/workers/status | jq '.[].lag'
```

2. **Scale horizontally:**
```yaml
# docker-compose.yml
services:
  app:
    deploy:
      replicas: 2  # Run 2 instances
```

---

## Backup & Restore

### Manual Database Backup
```bash
# Run backup script
./scripts/backup-db.sh

# Or manually
docker exec hk-nova-mysql mysqldump \
  -u root -p \
  --single-transaction \
  hk_nova > backup-$(date +%Y%m%d).sql

# Compress
gzip backup-$(date +%Y%m%d).sql
```

### Restore Database
```bash
# Run restore script
./scripts/restore-db.sh backup-20260907.sql.gz

# Or manually
gunzip -c backup-20260907.sql.gz | \
  docker exec -i hk-nova-mysql mysql -u root -p hk_nova
```

### Verify Backup
```bash
# Check backup file
ls -lh /opt/hk-nova-backups/

# Test restore on staging
gunzip -c backup.sql.gz | head -100
```

---

## Security Operations

### Rotate Encryption Keys
```bash
# Run rotation script
pnpm tsx scripts/rotate-encryption-keys.ts

# Verify new key version
curl http://localhost:3000/api/metrics | grep key_version
```

### Review Audit Logs
```bash
# Check recent audit logs
curl http://localhost:3000/api/audit-logs?limit=50 | jq

# Check for suspicious patterns
curl http://localhost:3000/api/audit-logs/monitoring/patterns | jq

# Check failed logins
curl http://localhost:3000/api/audit-logs/analytics?hours=24 | jq .failedLogins
```

### Update Secrets
```bash
# Using AWS Secrets Manager
aws secretsmanager update-secret \
  --secret-id hk-nova/db-password \
  --secret-string "new_password_here"

# Restart application to load new secrets
docker-compose restart app
```

---

## Performance Optimization

### Database Optimization
```sql
-- Connect to MySQL
docker exec -it hk-nova-mysql mysql -u root -p

-- Analyze slow queries
SELECT * FROM mysql.slow_log ORDER BY query_time DESC LIMIT 10;

-- Optimize tables
OPTIMIZE TABLE Device, Alert, MetricHistory;

-- Update statistics
ANALYZE TABLE Device, Alert, MetricHistory;
```

### Redis Optimization
```bash
# Check memory usage
docker exec hk-nova-redis redis-cli INFO memory

# Check key count
docker exec hk-nova-redis redis-cli DBSIZE

# Clear old keys
docker exec hk-nova-redis redis-cli --scan --pattern "cache:*" | \
  xargs docker exec hk-nova-redis redis-cli DEL
```

### Application Optimization
```bash
# Check slow API endpoints
curl http://localhost:3000/api/metrics | grep http_request_duration_seconds_sum

# Enable query logging
# Add to .env: DATABASE_LOG_QUERIES=true

# Restart with profiling
NODE_ENV=production NODE_OPTIONS="--inspect=0.0.0.0:9229" docker-compose up
```

---

## Monitoring Dashboards

### Grafana Setup
```bash
# Access Grafana
open http://localhost:3001

# Default credentials
# Username: admin
# Password: admin (change on first login)

# Import dashboards
# 1. Go to Dashboards > Import
# 2. Upload: monitoring/grafana/dashboards/hk-nova-overview.json
```

### Key Metrics to Monitor

1. **Application Health**
   - Metric: `up`
   - Alert: < 1 for > 1 minute

2. **Request Rate**
   - Metric: `rate(http_requests_total[5m])`
   - Alert: > 1000 req/s

3. **Error Rate**
   - Metric: `rate(http_requests_total{status=~"5.."}[5m])`
   - Alert: > 5%

4. **Response Time**
   - Metric: `histogram_quantile(0.95, http_request_duration_seconds_bucket)`
   - Alert: P95 > 1s

5. **Worker Health**
   - Metric: `worker_healthy`
   - Alert: = 0 for any worker

---

## Deployment Procedures

### Deploy to Staging
```bash
# 1. Run readiness check
./scripts/production-readiness-check.sh

# 2. Deploy
./scripts/deploy-staging.sh deploy

# 3. Run smoke tests
./scripts/staging-smoke-test.sh

# 4. Monitor for 1 hour
docker-compose logs -f
```

### Deploy to Production
```bash
# 1. Verify staging success
./scripts/staging-smoke-test.sh

# 2. Create backup
./scripts/backup-db.sh

# 3. Run readiness check
./scripts/production-readiness-check.sh

# 4. Deploy (requires confirmation)
./scripts/deploy-production-docker.sh deploy

# 5. Monitor intensively for 1 hour
watch -n 10 'curl -s http://localhost:3000/api/health'

# 6. Run smoke tests
./scripts/smoke-test.sh
```

### Rollback Production
```bash
# Automatic rollback (if health checks fail)
# Script will handle this automatically

# Manual rollback
./scripts/deploy-production-docker.sh rollback

# Verify rollback
curl http://localhost:3000/api/health
docker-compose logs app --tail=50
```

---

## Incident Response

### Severity Levels

**P0 - Critical (15 min response)**
- Application completely down
- Data loss occurring
- Security breach detected

**P1 - High (1 hour response)**
- Major functionality unavailable
- Performance severely degraded
- Workers not processing

**P2 - Medium (4 hour response)**
- Minor functionality issues
- Performance slightly degraded
- Non-critical errors

**P3 - Low (Next business day)**
- Cosmetic issues
- Feature requests
- Documentation updates

### Incident Response Steps

1. **Acknowledge**
   - Confirm incident
   - Assess severity
   - Notify stakeholders

2. **Investigate**
   - Check logs
   - Review metrics
   - Identify root cause

3. **Mitigate**
   - Apply immediate fix
   - Or rollback to previous version
   - Verify service restoration

4. **Communicate**
   - Update stakeholders
   - Document timeline
   - Post incident report

5. **Post-Mortem**
   - Root cause analysis
   - Preventive measures
   - Update runbook

---

## Maintenance Windows

### Scheduled Maintenance
```bash
# 1. Announce maintenance (24h advance notice)

# 2. Create backup
./scripts/backup-db.sh

# 3. Put application in maintenance mode
# Add to .env: MAINTENANCE_MODE=true
docker-compose restart app

# 4. Perform maintenance
# - Database upgrades
# - Schema changes
# - Infrastructure updates

# 5. Test changes
./scripts/smoke-test.sh

# 6. Remove maintenance mode
# Remove from .env: MAINTENANCE_MODE=true
docker-compose restart app

# 7. Verify normal operation
curl http://localhost:3000/api/health
```

---

## Useful Commands Cheat Sheet

### Docker Commands
```bash
# Rebuild single service
docker-compose build app

# View resource usage
docker stats

# Execute command in container
docker-compose exec app /bin/sh

# View container logs
docker-compose logs -f app --tail=100

# Prune unused resources
docker system prune -af
```

### Database Commands
```bash
# MySQL shell
docker exec -it hk-nova-mysql mysql -u root -p

# Run SQL file
docker exec -i hk-nova-mysql mysql -u root -p hk_nova < script.sql

# Export database
docker exec hk-nova-mysql mysqldump -u root -p hk_nova > dump.sql
```

### Redis Commands
```bash
# Redis CLI
docker exec -it hk-nova-redis redis-cli

# Get key
docker exec hk-nova-redis redis-cli GET "key"

# Clear cache
docker exec hk-nova-redis redis-cli FLUSHDB
```

### Monitoring Commands
```bash
# Check health
curl http://localhost:3000/api/health | jq

# Check metrics
curl http://localhost:3000/api/metrics | grep -E "up|http_requests"

# Check workers
curl http://localhost:3000/api/workers/status | jq
```

---

## Change Log

**v2.0 - 2026-09-07**
- Added Docker deployment procedures
- Added container troubleshooting
- Added staging/production workflows
- Updated monitoring commands

**v1.0 - 2026-08-30**
- Initial runbook
- PM2 operations
- Basic troubleshooting

---

**For emergencies, escalate immediately to Level 3 (DevOps)**
