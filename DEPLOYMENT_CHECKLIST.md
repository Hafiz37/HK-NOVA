# 🚀 HK-NOVA Production Deployment Checklist

**Document Version:** 1.0  
**Last Updated:** 2026-09-05  
**Status:** Ready for Phase 3 Deployment

---

## ✅ Phase 0: Pre-Deployment Assessment - COMPLETED

### System Status
- [x] Node.js 20.20.2 installed and verified
- [x] pnpm 10.34.5 installed and verified
- [x] MySQL 8.0.46 running
- [x] Redis server available (PONG response)
- [x] PM2 7.0.3 installed globally
- [x] Git repository clean (no uncommitted changes)
- [x] Build artifacts present (.next/ directory: 1.8GB)
- [x] Dependencies installed (node_modules: 1.9GB)

### Project Analysis Summary
- **Total API Endpoints:** 132
- **Database Models:** 71
- **Background Workers:** 16
- **Dashboard Pages:** 20
- **Test Files:** 37
- **Test Coverage:** 70%+
- **Documentation Files:** 31

---

## ✅ Phase 1: Security & Configuration - COMPLETED

### Phase 1.1: Encryption Keys Generated ✅
- [x] ENCRYPTION_KEY (32 bytes hex) - Generated
- [x] BACKUP_ENCRYPTION_KEY (32 bytes hex) - Generated
- [x] AUDIT_HMAC_KEY (32 bytes hex) - Generated
- [x] JWT_SECRET (64 bytes hex) - Generated
- [x] Keys documented in `PRODUCTION_KEYS.md`
- [x] Keys stored in `.env.production`

**⚠️ ACTION REQUIRED:**
- [ ] **Store keys in password manager** (1Password/LastPass/Bitwarden)
- [ ] **Delete `PRODUCTION_KEYS.md`** after keys are safely stored
- [ ] **Never commit these keys to git**

### Phase 1.2: Production Environment Configuration ✅
- [x] `.env.production` file created
- [x] File permissions set to 600 (secure)
- [x] All critical variables configured
- [x] Added to `.gitignore`

**⚠️ BEFORE DEPLOYMENT - UPDATE THESE VALUES:**

```bash
# In .env.production, change:
DATABASE_URL="mysql://hk_nova:CHANGE_THIS_PASSWORD@localhost:3306/hk_nova_prod"
OPERATOR_PASSWORD="CHANGE_THIS_TO_STRONG_PASSWORD_MIN_16_CHARS"

# Configure notification channels:
TELEGRAM_BOT_TOKEN="your-actual-bot-token"
TELEGRAM_CHAT_ID="your-actual-chat-id"
SMTP_HOST="your-smtp-server"
SMTP_USER="your-email"
SMTP_PASS="your-app-password"
```

### Phase 1.3: Infrastructure Documentation ✅
- [x] Infrastructure requirements documented (`INFRASTRUCTURE_REQUIREMENTS.md`)
- [x] Server specifications defined (min & recommended)
- [x] Software stack documented
- [x] Security requirements outlined
- [x] Database configuration templates
- [x] Redis configuration templates
- [x] Monitoring setup guidelines
- [x] Cost estimation provided

---

## ✅ Phase 2: Build & Validation - COMPLETED

### Phase 2.1: Dependencies & Build ✅
- [x] Dependencies verified (pnpm list)
- [x] Prisma Client generated
- [x] Production build successful
- [x] Build size: 1.8GB
- [x] Zero TypeScript errors (build completed)
- [x] All routes compiled (132 API endpoints)

### Phase 2.2: Code Quality Validation ✅
- [x] ESLint checked (minor warnings only, no blocking errors)
- [x] TypeScript compilation passed
- [x] Test suite executed (some tests skipped, expected in dev env)
- [x] No critical issues found

**Known Non-Blocking Issues:**
- Some ESLint warnings (`@typescript-eslint/no-unused-vars`)
- Test environment variables needed for full test coverage
- These do not block production deployment

### Phase 2.3: Documentation Review ✅
- [x] `PRODUCTION_KEYS.md` - Security keys documented
- [x] `.env.production` - Production configuration template
- [x] `INFRASTRUCTURE_REQUIREMENTS.md` - Complete infrastructure guide
- [x] `DEPLOYMENT_CHECKLIST.md` - This checklist
- [x] Existing docs reviewed (README, RUNBOOK, DEPLOYMENT)

---

## 🔄 Phase 3: Production Deployment (NEXT STEPS)

### Pre-Deployment Preparation

#### 3.1: Server Setup
- [ ] Provision production server (min: 4 CPU, 8GB RAM, 100GB SSD)
- [ ] Install Ubuntu 22.04 LTS (or approved OS)
- [ ] Configure firewall (UFW)
- [ ] Setup SSH access with key-based auth
- [ ] Create dedicated user for application (`hk-nova`)

#### 3.2: Software Installation
```bash
# Run on production server:
# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install pnpm
corepack enable
corepack prepare pnpm@latest --activate

# Install MySQL 8.0
sudo apt install -y mysql-server
sudo mysql_secure_installation

# Install Redis
sudo apt install -y redis-server
sudo systemctl enable redis-server

# Install PM2
npm install -g pm2

# Install Nginx (optional)
sudo apt install -y nginx
```

- [ ] Node.js 20 installed
- [ ] pnpm installed
- [ ] MySQL 8.0 installed & secured
- [ ] Redis installed & running
- [ ] PM2 installed globally
- [ ] Nginx installed (if using reverse proxy)

#### 3.3: Database Setup
```sql
-- In MySQL shell:
CREATE DATABASE hk_nova_prod CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'hk_nova'@'localhost' IDENTIFIED BY 'STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON hk_nova_prod.* TO 'hk_nova'@'localhost';
FLUSH PRIVILEGES;
```

- [ ] Production database created
- [ ] Dedicated database user created (not root)
- [ ] Strong password set
- [ ] Privileges granted
- [ ] Connection tested

#### 3.4: Application Deployment
```bash
# Clone repository
cd /var/www
git clone https://github.com/Hafiz37/HK-NOVA.git hk-nova
cd hk-nova

# Copy production environment
cp .env.production .env

# IMPORTANT: Edit .env and update:
# - DATABASE_URL with actual credentials
# - OPERATOR_PASSWORD with strong password
# - Notification channel credentials
nano .env

# Set secure permissions
chmod 600 .env

# Install dependencies
pnpm install --frozen-lockfile

# Generate Prisma Client
pnpm generate

# Run database migrations
pnpm db:migrate:prod

# Seed initial data (admin user, roles)
pnpm db:seed

# Build application
NODE_ENV=production pnpm build
```

- [ ] Repository cloned to `/var/www/hk-nova`
- [ ] `.env` configured with production values
- [ ] File permissions secured (600)
- [ ] Dependencies installed
- [ ] Prisma Client generated
- [ ] Database migrations applied
- [ ] Seed data loaded
- [ ] Production build completed

#### 3.5: PM2 Service Setup
```bash
# Start all services
NODE_ENV=production pnpm pm2:start

# Check status
pnpm pm2:status

# Save PM2 process list
pm2 save

# Setup auto-restart on boot
pm2 startup
# Follow the command output and run the generated command

# Monitor logs
pnpm pm2:logs
```

- [ ] PM2 services started (14+ processes)
- [ ] All processes showing "online" status
- [ ] PM2 process list saved
- [ ] Startup script configured
- [ ] Logs verified (no critical errors)

#### 3.6: Nginx Reverse Proxy (Optional but Recommended)
```bash
# Create Nginx config
sudo nano /etc/nginx/sites-available/hk-nova

# Enable site
sudo ln -s /etc/nginx/sites-available/hk-nova /etc/nginx/sites-enabled/

# Test config
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx

# Setup SSL with Let's Encrypt
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d noc.yourdomain.com
```

- [ ] Nginx virtual host configured
- [ ] Site enabled
- [ ] Configuration tested
- [ ] Nginx reloaded
- [ ] SSL certificate installed
- [ ] HTTPS working
- [ ] HTTP redirects to HTTPS

---

## 🧪 Phase 4: Testing & Validation

### 4.1: Smoke Tests
```bash
# Run automated smoke tests
bash scripts/smoke-test.sh http://localhost:3000
```

**Expected Results:**
- [ ] Health check: ✓ PASS (HTTP 200)
- [ ] Prometheus metrics: ✓ PASS (HTTP 200)
- [ ] Login page: ✓ PASS (HTTP 200)
- [ ] API Documentation: ✓ PASS (HTTP 200)
- [ ] Protected endpoints: ✓ PASS (HTTP 401 - unauthorized)
- [ ] Platform health JSON: ✓ PASS
- [ ] All tests: ✓ PASSED

### 4.2: Functional Testing

#### Authentication
- [ ] Login with production admin credentials → Success
- [ ] Dashboard loads → Success
- [ ] Logout → Success
- [ ] Invalid credentials rejected → Success

#### Device Management
- [ ] Add test device → Success
- [ ] Device appears in list → Success
- [ ] Test connection → Shows UP/DOWN status
- [ ] Edit device → Success
- [ ] Delete device → Success

#### Monitoring
- [ ] Wait 1-2 minutes for ICMP worker cycle
- [ ] ICMP metrics appearing → Success
- [ ] Device status updates (UP/DOWN) → Success
- [ ] Real-time SSE updates working → Success
- [ ] Charts rendering → Success

#### Alerts
- [ ] Create alert rule → Success
- [ ] Alert triggers correctly → Success
- [ ] Notification delivered (Telegram/Email) → Success
- [ ] Alert acknowledgment → Success
- [ ] Alert resolution → Success

#### Workers
- [ ] Access `/dashboard/platform-monitoring`
- [ ] All 14+ workers showing "healthy" → Success
- [ ] Metrics being collected → Success
- [ ] Check logs: `pnpm pm2:logs` → No errors

### 4.3: Performance Testing
```bash
# Basic load test with curl
for i in {1..100}; do
  curl -s http://localhost:3000/api/health > /dev/null &
done
wait

# Check response times
curl -w "@-" -o /dev/null -s http://localhost:3000/api/health <<'EOF'
time_namelookup:  %{time_namelookup}\n
time_connect:  %{time_connect}\n
time_total:  %{time_total}\n
EOF
```

- [ ] System handles 100 concurrent requests
- [ ] Response time < 500ms (p95)
- [ ] No memory leaks observed
- [ ] CPU usage < 70% average
- [ ] Memory usage < 80%

---

## 📊 Phase 5: Monitoring Setup

### 5.1: Prometheus (Optional but Recommended)
```bash
# Verify metrics endpoint
curl http://localhost:3000/api/metrics

# Expected output: Prometheus metrics format
# http_requests_total{...}
# alert_active_count{...}
# device_status_changes_total{...}
```

- [ ] Metrics endpoint accessible
- [ ] Metrics in valid Prometheus format
- [ ] All 31+ metrics available

### 5.2: Grafana Dashboards (Optional)
- [ ] Grafana installed
- [ ] Prometheus data source configured
- [ ] HK-NOVA dashboards imported
- [ ] Alerts configured

### 5.3: Log Management
```bash
# Setup PM2 log rotation
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
```

- [ ] Log rotation configured
- [ ] Old logs being rotated/compressed
- [ ] Logs accessible via `pnpm pm2:logs`

### 5.4: Database Backup
```bash
# Test database backup
bash scripts/backup-db.sh

# Setup cron job
crontab -e
# Add: 0 2 * * * /var/www/hk-nova/scripts/backup-db.sh >> /var/backups/backup.log 2>&1
```

- [ ] Backup script tested
- [ ] Backup created successfully
- [ ] Cron job scheduled (2 AM daily)
- [ ] Backup restoration tested (IMPORTANT!)

---

## 🔒 Security Hardening Checklist

### File Permissions
- [ ] `.env` file permissions: 600 (owner read/write only)
- [ ] Application directory: 755
- [ ] Backup directory: 700
- [ ] Logs directory: 755

### Firewall Configuration
```bash
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS
sudo ufw enable
```

- [ ] Firewall enabled
- [ ] Only necessary ports open
- [ ] Port 3000 NOT exposed externally (use Nginx proxy)

### SSL/TLS
- [ ] SSL certificate installed
- [ ] HTTPS enabled
- [ ] HTTP redirects to HTTPS
- [ ] Security headers configured
- [ ] Certificate auto-renewal setup

### Access Control
- [ ] Default admin password changed
- [ ] Strong password policy enforced
- [ ] SSH key-based auth enabled
- [ ] Root login disabled
- [ ] Unnecessary services disabled

---

## 🎯 Go-Live Checklist

### Final Pre-Launch Checks
- [ ] All configuration values in `.env` reviewed
- [ ] All default credentials changed
- [ ] Encryption keys securely stored
- [ ] Database backups working
- [ ] Monitoring dashboards ready
- [ ] Alert notifications tested
- [ ] Team trained on dashboard usage
- [ ] Runbook reviewed by team
- [ ] Emergency contacts documented
- [ ] Rollback procedure documented

### Launch
- [ ] All services running (`pnpm pm2:status`)
- [ ] Health check passing
- [ ] Smoke tests passing
- [ ] Functional tests passing
- [ ] No errors in logs
- [ ] Monitoring active

### Post-Launch (First 24 Hours)
- [ ] Monitor logs every 2 hours
- [ ] Check worker health
- [ ] Verify alerts are triggering
- [ ] Monitor system resources (CPU, RAM, Disk)
- [ ] Verify database backups
- [ ] Check notification delivery
- [ ] Review error logs

### Post-Launch (First Week)
- [ ] Daily log review
- [ ] Daily health check
- [ ] Monitor alert volume
- [ ] Review performance metrics
- [ ] Check disk space usage
- [ ] Verify backup integrity
- [ ] Gather user feedback

---

## 🆘 Emergency Procedures

### Rollback Procedure
```bash
# Stop services
pnpm pm2:stop

# Restore database
bash scripts/restore-db.sh /var/backups/hk-nova-db/backup_YYYYMMDD.sql

# Checkout previous version
git checkout <previous-commit-hash>
pnpm install
pnpm build

# Restart services
pnpm pm2:start
```

### Critical Issue Response
1. **System Down**
   - Check PM2 status: `pnpm pm2:status`
   - Check logs: `pnpm pm2:logs`
   - Restart services: `pnpm pm2:restart`

2. **Database Issues**
   - Check connections: `mysql -u hk_nova -p`
   - Check disk space: `df -h`
   - Review slow queries: Check `/var/log/mysql/slow-query.log`

3. **High Resource Usage**
   - Check processes: `htop`
   - Check PM2 memory: `pm2 monit`
   - Restart specific worker: `pm2 restart <worker-name>`

4. **Alert Storm**
   - Check maintenance windows
   - Review alert rules thresholds
   - Temporarily disable non-critical alerts

---

## 📞 Contacts & Support

### Emergency Contacts
- **System Admin:** [Add contact]
- **Database Admin:** [Add contact]
- **Network Team:** [Add contact]
- **Security Team:** [Add contact]
- **On-Call Engineer:** [Add contact]

### Documentation References
- Architecture: `docs/ARCHITECTURE.md`
- Deployment: `docs/DEPLOYMENT.md`
- Runbook: `RUNBOOK.md`
- API Docs: `docs/API.md`
- ML Documentation: `docs/ML_ANOMALY_DETECTION.md`

---

## 📝 Deployment Sign-Off

**Pre-Deployment Review:**
- [ ] Technical Lead approval
- [ ] Security review completed
- [ ] Infrastructure ready
- [ ] Team trained
- [ ] Documentation complete

**Deployment Executed By:** _________________  
**Date:** _________________  
**Time:** _________________  

**Post-Deployment Verification:**
- [ ] All services online
- [ ] Smoke tests passed
- [ ] Functional tests passed
- [ ] Monitoring active
- [ ] Team notified

**Sign-Off:**
- [ ] Technical Lead: _________________
- [ ] Operations: _________________
- [ ] Security: _________________

---

## 🎉 Success Criteria

**Deployment is considered successful when:**
1. ✅ All 14+ PM2 processes running (status: online)
2. ✅ Health check endpoint returns HTTP 200
3. ✅ All smoke tests passing
4. ✅ User can login and access dashboard
5. ✅ ICMP worker collecting metrics
6. ✅ Alerts triggering and notifications delivered
7. ✅ No critical errors in logs
8. ✅ System stable for 24 hours
9. ✅ Database backups working
10. ✅ Monitoring dashboards active

---

**Document Maintained By:** DevOps Team  
**Version:** 1.0  
**Last Review:** 2026-09-05  
**Next Review:** After Phase 3 Deployment
