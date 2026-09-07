# 🚀 HK-NOVA Phase 5 Quick Deploy Guide

## ⚡ Quick Start (5 Minutes)

### Prerequisites Check
```bash
# Verify Docker installed
docker --version

# Verify Docker Compose installed
docker-compose --version

# Check disk space (need 10GB+)
df -h .
```

### 1. Generate Production Keys (2 min)
```bash
# Generate all required secrets
./scripts/generate-production-keys.sh

# This creates secure random keys for:
# - ENCRYPTION_KEY (AES-256)
# - JWT_SECRET
# - AUDIT_HMAC_KEY
# - BACKUP_ENCRYPTION_KEY
```

### 2. Configure Environment (1 min)
```bash
# Copy template
cp .env.production.template .env.production

# Edit with your values
nano .env.production

# REQUIRED: Update these values
# - DATABASE_URL (MySQL connection string)
# - All *_KEY values (from generate-production-keys.sh)
# - OPERATOR_PASSWORD (minimum 16 characters)
```

### 3. Deploy to Staging (2 min)
```bash
# One command deployment
./scripts/deploy-staging.sh deploy

# Wait for startup (~90 seconds)
```

---

## 🧪 Staging Validation

### Run Smoke Tests
```bash
# Execute 30+ automated tests
./scripts/staging-smoke-test.sh

# Expected: All tests pass ✅
```

### Manual Verification
```bash
# Check health
curl http://localhost:3000/api/health | jq

# Check workers
curl http://localhost:3000/api/workers/status | jq

# Access UI
open http://localhost:3000

# View logs
docker-compose logs -f app
```

---

## 🏭 Production Deployment

### Pre-Deployment Checklist
```bash
# Run readiness check (60 checks)
./scripts/production-readiness-check.sh

# Should show: ✅ System is ready for production deployment!
```

### Deploy to Production
```bash
# Execute production deployment (requires confirmation)
./scripts/deploy-production-docker.sh deploy

# Type 'yes' when prompted
# Deployment takes ~10 minutes with safety checks
```

### Post-Deployment Validation
```bash
# Run continuous validation (1 hour)
./scripts/post-deploy-validation.sh

# Monitor in real-time:
# - Health checks every 30s
# - Worker status
# - Error rates
# - Memory usage
```

---

## 📊 Monitoring

### Access Dashboards
```bash
# Application
open http://localhost:3000

# Grafana (admin/admin)
open http://localhost:3001

# Prometheus
open http://localhost:9090

# Metrics API
curl http://localhost:3000/api/metrics
```

### Key Metrics to Watch
```bash
# Application up
curl -s http://localhost:3000/api/metrics | grep "up 1"

# Request rate
curl -s http://localhost:3000/api/metrics | grep http_requests_total

# Worker health
curl http://localhost:3000/api/workers/status | jq '.[] | {name, healthy}'

# Memory usage
curl http://localhost:3000/api/platform/health | jq .memory
```

---

## 🆘 Troubleshooting

### Application Won't Start
```bash
# Check logs
docker-compose logs app --tail=100

# Check database
docker exec hk-nova-mysql mysqladmin ping

# Check Redis
docker exec hk-nova-redis redis-cli ping

# Restart services
docker-compose restart
```

### High Memory Usage
```bash
# Check stats
docker stats

# Restart application
docker-compose restart app

# Monitor memory
watch -n 10 'curl -s http://localhost:3000/api/platform/health | jq .memory'
```

### Workers Not Running
```bash
# Check status
curl http://localhost:3000/api/workers/status | jq

# Check logs
docker-compose logs app | grep worker

# Restart
docker-compose restart app
```

---

## 🔄 Rollback

### Automatic Rollback
If health checks fail during deployment, the script automatically rolls back.

### Manual Rollback
```bash
# Rollback to previous version
./scripts/deploy-production-docker.sh rollback

# This will:
# 1. Stop current services
# 2. Restore database from backup
# 3. Start previous version
# 4. Verify health
```

---

## 📋 Common Commands

### View Status
```bash
docker-compose ps
```

### View Logs
```bash
# All services
docker-compose logs -f

# Application only
docker-compose logs -f app

# Last 100 lines
docker-compose logs --tail=100 app
```

### Restart Services
```bash
# Restart all
docker-compose restart

# Restart app only
docker-compose restart app
```

### Stop Services
```bash
# Stop gracefully
docker-compose stop

# Stop and remove containers
docker-compose down
```

---

## 🔐 Security Checklist

- [ ] All CHANGE_ME values replaced in .env.production
- [ ] Encryption keys are 32+ bytes (64 hex characters)
- [ ] JWT secret is 64+ bytes
- [ ] Operator password is 16+ characters
- [ ] .env.production NOT committed to git
- [ ] Database password is strong
- [ ] Firewall rules configured (if applicable)
- [ ] HTTPS enabled (if applicable)

---

## 📞 Get Help

### Check Documentation
- `PHASE5_IMPLEMENTATION_COMPLETE.md` - Full implementation guide
- `RUNBOOK_UPDATED.md` - Operations manual (750 lines)
- `PHASE5_DEPLOYMENT_GUIDE.md` - Detailed deployment procedures
- `FASE5_COMPLETION_REPORT.md` - Phase 5 summary

### Emergency Contacts
- **Operations**: ops@company.com
- **Development**: dev@company.com
- **DevOps**: devops@company.com

---

## 🎯 Success Criteria

### Staging Success ✅
- [ ] Docker images build successfully
- [ ] All containers start without errors
- [ ] Health checks pass (HTTP 200)
- [ ] Smoke tests pass (30/30)
- [ ] No errors for 1 hour
- [ ] Workers are healthy

### Production Success ✅
- [ ] Zero-downtime deployment
- [ ] All services healthy
- [ ] Metrics endpoint responsive
- [ ] No critical errors in 24h
- [ ] Performance within targets
- [ ] Monitoring dashboards working

---

## 🚦 Deployment Timeline

| Phase | Duration | Activity |
|-------|----------|----------|
| Staging Deploy | 5 min | Build & start services |
| Staging Tests | 2 min | 30+ automated tests |
| Staging Validation | 24 hours | Monitor stability |
| Production Deploy | 10 min | With safety checks |
| Production Validation | 48 hours | Intensive monitoring |
| **Total** | **3 days** | **Full deployment cycle** |

---

## 💡 Pro Tips

1. **Always test on staging first** - Never deploy directly to production
2. **Monitor for 1 hour** - Watch logs and metrics after deployment
3. **Keep backups** - Automated backups are created before each deployment
4. **Use health checks** - Verify `/api/health` returns 200 before proceeding
5. **Check worker status** - Ensure all workers are healthy after deployment

---

## 📈 Performance Targets

| Metric | Target | Command |
|--------|--------|---------|
| Health Check | < 100ms | `curl http://localhost:3000/api/health` |
| API Response (P95) | < 1s | Check metrics endpoint |
| Memory Usage | < 80% | Check platform health |
| Worker Lag | < 60s | Check worker status |
| Error Rate | < 1% | Check metrics |

---

## 🔧 Maintenance

### Weekly
- [ ] Check disk space: `df -h`
- [ ] Review error logs: `docker-compose logs --tail=100`
- [ ] Check worker health: `curl http://localhost:3000/api/workers/status`

### Monthly
- [ ] Rotate encryption keys: `pnpm tsx scripts/rotate-encryption-keys.ts`
- [ ] Review audit logs: `curl http://localhost:3000/api/audit-logs`
- [ ] Update dependencies: `pnpm update`
- [ ] Database optimization: Run OPTIMIZE TABLE

### Quarterly
- [ ] Security audit: `pnpm tsx scripts/security-audit.ts`
- [ ] Performance review: Load testing
- [ ] Backup restore test: Verify backups work
- [ ] Disaster recovery drill: Test rollback

---

**Version**: 1.0  
**Last Updated**: 2026-09-07  
**Status**: Production Ready ✅
