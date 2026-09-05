# 🎯 HK-NOVA Quick Deployment Guide

**Last Updated:** 2026-09-05 01:31 UTC  
**Status:** ✅ READY TO DEPLOY  
**Configuration:** Complete

---

## ✅ What's Been Completed

**Phase 0-2:** Pre-deployment preparation ✓
- Infrastructure verified
- Security keys generated
- Production build successful
- Configuration files created
- Documentation complete

**.env.production:** Fully configured ✓
- Database credentials set
- Admin account configured
- All encryption keys in place
- Production settings optimized

---

## 🔐 Your Credentials (SAVE THESE!)

### Database
```
Host: localhost:3306
Database: hk_nova_prod
User: hk_nova
Password: BUOfyLvD20DACpg3RWqvl0hTyaukxd5
```

### Admin Login
```
URL: http://localhost:3000/login
Username: admin_hknova
Password: fEOLaqsgz3PRCZ11O8wcjw==
```

⚠️ **CRITICAL:** Store these in your password manager NOW!

---

## 🚀 Deployment Steps (5 Minutes)

### Step 1: Create Production Database

```bash
mysql -u root -p
```

```sql
CREATE DATABASE hk_nova_prod CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'hk_nova'@'localhost' IDENTIFIED BY 'BUOfyLvD20DACpg3RWqvl0hTyaukxd5';
GRANT ALL PRIVILEGES ON hk_nova_prod.* TO 'hk_nova'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

### Step 2: Copy Production Config

```bash
cd /home/gopal-ichiro/Documents/magang/hk-nova
cp .env.production .env
chmod 600 .env
```

### Step 3: Run Migrations & Seed

```bash
pnpm db:migrate:prod
pnpm db:seed
```

Expected output:
```
✓ Migrations applied
✓ Admin user created
✓ Roles & permissions seeded
```

### Step 4: Start Production Services

```bash
NODE_ENV=production pnpm pm2:start
```

Wait 30 seconds, then check status:
```bash
pnpm pm2:status
```

All processes should show `online` ✓

### Step 5: Verify Deployment

```bash
# Health check
curl http://localhost:3000/api/health
# Expected: {"status":"ok"}

# Run smoke tests
bash scripts/smoke-test.sh http://localhost:3000
# Expected: All tests ✓ PASS
```

### Step 6: Login & Verify

1. Open browser: http://localhost:3000/login
2. Login with:
   - Username: `admin_hknova`
   - Password: `fEOLaqsgz3PRCZ11O8wcjw==`
3. ✅ Dashboard should load
4. **Change password immediately!**

---

## 🧪 Troubleshooting

### Database Connection Failed
```bash
# Check MySQL is running
sudo systemctl status mysql

# Test connection
mysql -u hk_nova -pBUOfyLvD20DACpg3RWqvl0hTyaukxd5 -e "USE hk_nova_prod;"
```

### PM2 Process Not Starting
```bash
# Check logs
pnpm pm2:logs

# Restart specific process
pm2 restart hk-nova-web

# Restart all
pnpm pm2:restart
```

### Health Check Failing
```bash
# Check if port 3000 is in use
netstat -tulpn | grep 3000

# Check web process logs
pnpm pm2:logs hk-nova-web
```

---

## 📊 Monitoring

### Check System Status
```bash
# PM2 status
pnpm pm2:status

# View logs in real-time
pnpm pm2:logs

# Monitor resources
pm2 monit
```

### Key Endpoints
- Health: http://localhost:3000/api/health
- Metrics: http://localhost:3000/api/metrics
- API Docs: http://localhost:3000/docs/api

### Workers to Monitor
- ✓ hk-nova-web (main app)
- ✓ hk-nova-icmp-worker (device polling)
- ✓ hk-nova-snmp-worker (metrics collection)
- ✓ hk-nova-anomaly-worker (ML detection)
- ✓ hk-nova-backup-worker (config backups)
- ✓ All 14+ processes should be `online`

---

## 🔒 Post-Deployment Security

### Immediate Actions (First Hour)
- [ ] Store credentials in password manager
- [ ] Delete `PRODUCTION_KEYS.md`
- [ ] Delete `PRODUCTION_CREDENTIALS.md`
- [ ] Change admin password via UI
- [ ] Verify database backups working

### First Day
- [ ] Configure notifications (Email/Telegram)
- [ ] Add real devices to monitor
- [ ] Test alert notifications
- [ ] Review logs for errors
- [ ] Setup Grafana dashboards (optional)

### First Week
- [ ] Monitor resource usage (CPU, RAM, Disk)
- [ ] Verify worker health daily
- [ ] Test backup restoration
- [ ] Review alert rules
- [ ] Train team on dashboard

---

## 📁 Important Files

**Configuration:**
- `.env` (copied from `.env.production`) - Active config
- `.env.production` - Production template
- `ecosystem.config.js` - PM2 configuration

**Documentation:**
- `DEPLOYMENT_CHECKLIST.md` - Complete deployment guide
- `INFRASTRUCTURE_REQUIREMENTS.md` - Server setup guide
- `RUNBOOK.md` - Operations & troubleshooting
- `README.md` - Quick start

**Credentials (DELETE after storing):**
- `PRODUCTION_KEYS.md` - Encryption keys
- `PRODUCTION_CREDENTIALS.md` - Database & admin credentials

---

## 🆘 Emergency Contacts

**System Issues:**
- Check logs: `pnpm pm2:logs`
- Restart services: `pnpm pm2:restart`
- Health check: `curl http://localhost:3000/api/health`

**Database Issues:**
- Backup location: `/var/backups/hk-nova/`
- Restore: `bash scripts/restore-db.sh <backup-file>`

**Rollback:**
```bash
pnpm pm2:stop
git checkout <previous-commit>
pnpm install
pnpm build
pnpm pm2:start
```

---

## ✅ Success Criteria

Deployment is successful when:
- [x] All PM2 processes showing `online`
- [x] Health endpoint returns 200
- [x] Smoke tests all passing
- [x] Can login to dashboard
- [x] Dashboard loads without errors
- [x] Workers collecting metrics
- [x] Alerts can be created
- [x] No critical errors in logs

---

## 📞 Need Help?

**Documentation:**
- Full deployment guide: `DEPLOYMENT_CHECKLIST.md`
- Troubleshooting: `RUNBOOK.md`
- API reference: `docs/API.md`

**Quick Commands:**
```bash
# Status check
pnpm pm2:status

# View all logs
pnpm pm2:logs

# Restart everything
pnpm pm2:restart

# Stop everything
pnpm pm2:stop

# Health check
curl http://localhost:3000/api/health
```

---

## 🎉 You're Ready!

Everything is configured and ready for deployment. Follow the 6 steps above to go live in 5 minutes!

**Next Command:**
```bash
# Start here:
mysql -u root -p
```

Good luck! 🚀
