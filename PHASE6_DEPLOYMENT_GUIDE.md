# 🚀 PHASE 6: Production Pilot & Deployment Guide

**Phase Type:** Operational Deployment  
**Duration:** 4 weeks (Week 7-10)  
**Prerequisites:** Phases 1-5 Complete ✅  
**Status:** Ready to Begin

---

## 📋 Phase 6 Overview

Phase 6 adalah fase deployment operasional ke production environment dengan real devices. Berbeda dengan Phases 1-5 yang fokus development, Phase 6 adalah execution plan untuk deployment bertahap.

**Timeline:**
- **Week 7:** Production Pilot (50 devices)
- **Week 8:** Scale to 150 devices
- **Week 9:** Scale to 300 devices
- **Week 10:** Full rollout (500+ devices)

---

## ⚠️ Important Notes

**Phase 6 is NOT a coding phase.** Ini adalah:
- ✅ Operational deployment procedures
- ✅ Day-by-day monitoring activities
- ✅ Real production environment
- ✅ Actual Mikrotik devices
- ❌ NOT writing new code
- ❌ NOT automated execution

**Requirements:**
- Production server (8+ cores, 16GB RAM, 250GB SSD)
- MySQL 8.0+ database
- 50-500 actual Mikrotik devices
- Operations team 24/7
- Network access to devices

---

## 🎯 Phase 6 Goals

### Week 7 Goals (Production Pilot)
- Deploy system to production
- Add 50 real devices gradually
- Validate system stability
- 99.9% uptime target
- No critical issues
- Zero data loss

### Week 8-10 Goals (Scale Up)
- Gradual scaling to 500+ devices
- Performance validation at each step
- Continuous monitoring
- Issue tracking and resolution
- Team training
- Documentation updates

---

## 📅 Week 7: Production Pilot (50 Devices)

### Pre-Deployment Checklist (Day 0)

**Infrastructure:**
- [ ] Production server provisioned
- [ ] MySQL installed and configured
- [ ] Node.js 18+ and pnpm installed
- [ ] PM2 installed globally
- [ ] Network access to devices verified
- [ ] Firewall rules configured

**Security:**
- [ ] All credentials generated
- [ ] .env.production configured
- [ ] File permissions set (chmod 600)
- [ ] SSH keys deployed
- [ ] Audit logging enabled

**Application:**
- [ ] Code deployed from main branch
- [ ] Dependencies installed
- [ ] Database migrations applied
- [ ] Application built successfully
- [ ] Workers started with PM2

**Validation:**
- [ ] Health checks passing
- [ ] API responding
- [ ] All workers online
- [ ] Database accessible
- [ ] Backup system working

**Documentation:**
- [ ] Team trained on system
- [ ] Runbook reviewed
- [ ] Emergency contacts documented
- [ ] Escalation procedures clear

---

### Day 1-2: Add First 20 Devices

**Morning (08:00):**
1. Review overnight logs (if system already running)
2. Check worker health: `./scripts/monitoring/worker-health.sh`
3. Verify database: `mysql -u root -p -e "SHOW PROCESSLIST;"`
4. System resources: `htop`

**Device Selection (20 devices):**
- Select diverse device types (routers, switches, OLTs)
- Mix of critical and non-critical
- Different network segments
- Known stable devices

**Adding Devices:**
```bash
# Via API
curl -X POST http://localhost:3000/api/devices \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Router-Core-01",
    "ip": "192.168.1.1",
    "type": "ROUTER",
    "location": "DC1",
    "credentials": {
      "sshUsername": "admin",
      "sshPassword": "encrypted_password",
      "snmpCommunity": "public",
      "snmpVersion": "v2c"
    }
  }'

# Or via Web UI
# Navigate to Devices → Add Device
```

**Monitoring (Every Hour):**
```bash
# Worker health
./scripts/monitoring/worker-health.sh

# Performance
curl http://localhost:3000/api/metrics | jq

# Queue status
curl http://localhost:3000/api/queue/metrics | jq

# Logs
pm2 logs --lines 50
```

**Evening (18:00):**
- Review error logs
- Check alert generation
- Verify backup execution
- Document any issues
- Update team on status

**Overnight:**
- Monitor alerts
- On-call engineer available
- Auto-monitoring scripts running

**Success Criteria (Day 1-2):**
- [ ] All 20 devices added successfully
- [ ] Devices showing status (UP/DOWN)
- [ ] ICMP polls working
- [ ] SNMP polls working
- [ ] No worker crashes
- [ ] No database errors
- [ ] CPU <70%, Memory <8GB

---

### Day 3-4: Add Next 20 Devices (Total 40)

**Pre-Check:**
```bash
# Verify system stable with first 20
./scripts/monitoring/worker-health.sh
pm2 list
curl http://localhost:3000/api/metrics | jq
```

**If Day 1-2 Stable:**
- Proceed with adding 20 more devices
- Follow same procedure as Day 1-2
- Monitor closely for any degradation

**If Issues Found:**
- STOP adding devices
- Troubleshoot issues first
- Document root cause
- Fix before proceeding
- May extend pilot timeline

**Monitoring Focus:**
- Performance trends
- Queue depth
- Error rates
- Response times
- Database connections

**Daily Activities:**
```bash
# Morning (08:00)
./scripts/monitoring/worker-health.sh
pm2 logs --err --lines 100 | grep -i "error"

# Midday (12:00)
curl http://localhost:3000/api/metrics | jq
curl http://localhost:3000/api/queue/metrics | jq

# Evening (18:00)
curl http://localhost:3000/api/alerts?status=ACTIVE | jq
pm2 list
```

**Success Criteria (Day 3-4):**
- [ ] All 40 devices operational
- [ ] No performance degradation
- [ ] Error rate <1%
- [ ] All alerts working correctly
- [ ] Backup system functional
- [ ] Team comfortable with operations

---

### Day 5-7: Add Final 10 Devices (Total 50)

**Week-Long Observation:**
- Add final 10 devices (total 50)
- Monitor for full 7 days
- Document all issues
- Fine-tune as needed
- Validate success criteria

**Full Week Monitoring:**
```bash
# Start performance monitoring (runs continuously)
./scripts/monitoring/performance-monitor.sh

# Check every 6 hours
watch -n 21600 './scripts/monitoring/worker-health.sh'
```

**Daily Operations Routine:**

**08:00 - Morning Check:**
```bash
# Health check
./scripts/monitoring/worker-health.sh

# Review overnight logs
pm2 logs --lines 200 | grep -E "ERROR|WARN"

# Database status
mysql -u root -p -e "SHOW STATUS LIKE 'Threads_connected';"

# Disk space
df -h
```

**12:00 - Midday Check:**
```bash
# System metrics
curl http://localhost:3000/api/metrics | jq

# Queue status
curl http://localhost:3000/api/queue/metrics | jq

# Resource usage
htop
```

**18:00 - Evening Check:**
```bash
# Active alerts
curl http://localhost:3000/api/alerts?status=ACTIVE | jq

# Worker status
pm2 list

# Error count
pm2 logs --err --lines 1000 | grep -c "ERROR"
```

**End of Week 7 Review:**

**Data to Collect:**
- Total uptime: __%
- Total errors: __
- Average CPU: __%
- Average memory: __GB
- Average API latency: __ms
- Devices added: 50
- Devices active: __
- Alerts generated: __
- Backups successful: __

**Go/No-Go Decision for Week 8:**
- [ ] Uptime ≥99.9%
- [ ] CPU <70%
- [ ] Memory stable <8GB
- [ ] Error rate <1%
- [ ] No critical bugs
- [ ] Team confident
- [ ] Documentation adequate

**If GO:** Proceed to Week 8 (150 devices)  
**If NO-GO:** Extend pilot, fix issues

---

## 📅 Week 8: Scale to 150 Devices

### Day 1: Add 50 Devices (Total 100)

**Pre-Scaling Check:**
```bash
# Verify Week 7 stable
./scripts/monitoring/worker-health.sh
curl http://localhost:3000/api/metrics | jq

# Check resource headroom
# CPU should be <50%, Memory <6GB
```

**Add 50 Devices:**
- Batch 1: 25 devices (morning)
- Monitor for 4 hours
- Batch 2: 25 devices (afternoon)
- Monitor overnight

**Monitoring Frequency:**
- Every 2 hours during business hours
- On-call overnight
- Performance monitor running continuously

**Success Criteria (Day 1):**
- [ ] All 100 devices operational
- [ ] CPU <70%
- [ ] Memory <8GB
- [ ] No worker crashes
- [ ] Queue depth <20
- [ ] API latency <500ms

---

### Day 3: Add 50 Devices (Total 150)

**Pre-Check:**
- Review 48-hour trend
- Verify stability
- Check performance metrics

**Add 50 More Devices:**
- Follow same procedure
- Monitor closely
- Document any issues

**Week 8 Focus:**
- Performance trends
- Resource utilization
- Queue efficiency
- Error patterns
- Optimization opportunities

**End of Week 8 Review:**

**Metrics:**
- Total devices: 150
- Uptime: __%
- CPU avg: __%
- Memory avg: __GB
- API P95: __ms
- Error rate: __%

**Go/No-Go for Week 9:**
- [ ] All metrics within targets
- [ ] No critical issues
- [ ] Performance stable
- [ ] Team ready for next phase

---

## 📅 Week 9: Scale to 300 Devices

### Strategy
- Add 150 devices over 7 days
- ~20-25 devices per day
- Continuous monitoring
- Daily performance reviews

### Daily Routine

**Each Morning:**
1. Health check all workers
2. Review overnight metrics
3. Check for any alerts
4. Verify backups completed
5. Plan device additions

**Device Addition:**
- Add 20-25 devices
- Monitor for 2-4 hours
- Verify no degradation
- Document any issues

**Each Evening:**
- Review day's metrics
- Check error logs
- Verify all devices active
- Update status report

**Monitoring:**
```bash
# Continuous monitoring
./scripts/monitoring/performance-monitor.sh

# Hourly checks
watch -n 3600 './scripts/monitoring/worker-health.sh'
```

**Week 9 Targets:**
- Total devices: 300
- Uptime: >99.9%
- CPU: <70%
- Memory: <8GB
- API P95: <500ms
- Error rate: <1%

---

## 📅 Week 10: Full Rollout (500+ Devices)

### Final Scale-Up

**Day 1-2:** Add 100 devices (Total 400)
- Monitor 24 hours
- Verify stability

**Day 3-5:** Add 100 devices (Total 500)
- Monitor 48 hours
- Full system validation

**Day 6-7:** Add remaining devices (500+)
- Final optimization
- Production stable

### Final Validation

**Performance Validation:**
```bash
# Run load test validation
./tests/load/run-tests.sh baseline 500 300

# API load test
npx tsx tests/load/api-load-test.ts

# Full system check
./scripts/monitoring/worker-health.sh
```

**Success Criteria:**
- [ ] All 500+ devices operational
- [ ] Uptime >99.9%
- [ ] CPU <70%
- [ ] Memory <8GB
- [ ] API P95 <500ms
- [ ] Error rate <1%
- [ ] All workers stable
- [ ] Backups working
- [ ] Alerts accurate
- [ ] Team fully trained

---

## 🚨 Incident Response Procedures

### Critical Incident (System Down)

**Immediate Actions:**
1. Check worker status: `pm2 list`
2. Check logs: `pm2 logs --err --lines 100`
3. Restart if needed: `pm2 restart all`
4. Verify database: `mysql -u root -p -e "SHOW PROCESSLIST;"`
5. Check disk space: `df -h`

**If System Won't Start:**
```bash
# Check configuration
cat .env.production | grep -v "PASSWORD\|SECRET\|KEY"

# Check database connection
mysql -u root -p -e "SELECT 1;"

# Check port availability
netstat -tulpn | grep 3000

# Review startup logs
pm2 logs --lines 500
```

### High CPU Usage (>90%)

**Actions:**
```bash
# Identify process
top -bn1 | head -20

# Reduce concurrency
# Edit .env.production
ICMP_CONCURRENCY_LIMIT=5
SNMP_CONCURRENCY_LIMIT=5

# Restart workers
pm2 restart all
```

### Memory Leak

**Actions:**
```bash
# Check memory per process
ps aux | grep node | awk '{print $2, $4, $11}' | sort -k2 -rn

# Restart leaking worker
pm2 restart <worker-name>

# Set memory limit
pm2 start ecosystem.config.js --max-memory-restart 1G
```

### Database Connection Exhaustion

**Actions:**
```sql
-- Check connections
SHOW PROCESSLIST;

-- Kill long-running queries
KILL <process_id>;

-- Increase limit (temporary)
SET GLOBAL max_connections = 300;
```

### Worker Crash Loop

**Actions:**
```bash
# Check logs
pm2 logs <worker-name> --err --lines 100

# Stop auto-restart temporarily
pm2 stop <worker-name>

# Fix issue, then restart
pm2 restart <worker-name>
```

---

## 📊 Daily Status Report Template

```
Date: YYYY-MM-DD
Phase: Week X, Day Y
Total Devices: XXX

Status: ✅ Green / ⚠️ Yellow / 🔴 Red

Metrics:
  - Uptime: XX.X%
  - CPU: XX%
  - Memory: X.XGB
  - API P95: XXXms
  - Error Rate: X.X%
  - Active Alerts: XX

Activities Today:
  - Added XX devices
  - Fixed X issues
  - Updated X configurations

Issues:
  - [None / List issues]

Action Items:
  - [Task 1]
  - [Task 2]

Next Day Plan:
  - Add XX devices
  - Monitor X metric
  - Review X component
```

---

## ✅ Week-End Review Checklist

**End of Each Week:**
- [ ] Review all metrics
- [ ] Document all issues
- [ ] Update runbook
- [ ] Team retrospective
- [ ] Go/No-Go decision
- [ ] Plan next week
- [ ] Update stakeholders

---

## 🎯 Final Success Criteria

**System Performance:**
- [ ] 500+ devices operational
- [ ] Uptime >99.9%
- [ ] CPU <70% average
- [ ] Memory <8GB stable
- [ ] API P95 <500ms
- [ ] Error rate <1%
- [ ] DB connections <150

**Operational:**
- [ ] All workers stable
- [ ] Backups completing successfully
- [ ] Alerts accurate and timely
- [ ] Monitoring functional
- [ ] Team fully trained
- [ ] Documentation complete

**Business:**
- [ ] No critical incidents
- [ ] Stakeholder satisfaction
- [ ] ROI targets met
- [ ] SLA compliance

---

## 📚 Phase 6 Documentation

**Key Documents:**
- START_HERE.md - Navigation
- QUICK_START_PRODUCTION.md - Deployment
- RUNBOOK.md - Daily operations
- PRODUCTION_READINESS_REPORT.md - System status
- PHASE5_TESTING_GUIDE.md - Testing procedures

**New Phase 6 Docs:**
- PHASE6_DEPLOYMENT_GUIDE.md - This document
- PHASE6_DAILY_CHECKLIST.md - Daily operations
- PHASE6_INCIDENT_RESPONSE.md - Emergency procedures

---

## 🎓 Team Training

**Before Week 7:**
- [ ] System architecture overview
- [ ] Daily operations training
- [ ] Monitoring tools training
- [ ] Incident response training
- [ ] Escalation procedures
- [ ] Documentation review

**Training Materials:**
- System architecture diagrams
- Video walkthroughs
- Hands-on exercises
- Emergency drills

---

## 📞 Support & Escalation

**Level 1: Operations Team**
- Daily monitoring
- Standard procedures
- Minor issues

**Level 2: On-Call Engineer**
- Worker crashes
- Performance issues
- Configuration changes

**Level 3: Development Team**
- Code bugs
- System design issues
- Major incidents

**Emergency Contact:**
- Operations Lead: [Phone/Email]
- On-Call Engineer: [Phone/Email]
- Development Team: [Phone/Email]
- Management: [Phone/Email]

---

## 🎉 Phase 6 Completion

**When is Phase 6 Complete?**

Phase 6 is complete when:
- ✅ All 500+ devices deployed
- ✅ System stable for 2 weeks
- ✅ All success criteria met
- ✅ Team fully operational
- ✅ No critical issues
- ✅ Stakeholder sign-off

**Handoff to Operations:**
- System documentation complete
- Team fully trained
- Procedures documented
- Support structure in place
- Continuous improvement plan

---

**Phase 6 Status:** ⏳ Ready to Begin  
**Prerequisites:** ✅ Phases 1-5 Complete  
**Next Action:** Begin Week 7 Pilot  

**Good luck with deployment!** 🚀
