#!/usr/bin/env bash
# ==============================================================================
# final-verification.sh — Comprehensive Final Verification for Phase 0-8
# ==============================================================================

set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${CYAN}${BOLD}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}${BOLD}║     HK-NOVA PHASE 0-8 FINAL VERIFICATION & READINESS CHECK   ║${NC}"
echo -e "${CYAN}${BOLD}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

PASS=0
FAIL=0
WARN=0

check_pass() {
  echo -e "  ${GREEN}✅${NC} $1"
  PASS=$((PASS + 1))
}

check_fail() {
  echo -e "  ${RED}❌${NC} $1"
  FAIL=$((FAIL + 1))
}

check_warn() {
  echo -e "  ${YELLOW}⚠️${NC}  $1"
  WARN=$((WARN + 1))
}

# Phase 0: Database & Configuration
echo -e "${BOLD}📊 PHASE 0: DATABASE & CONFIGURATION${NC}"
echo "----------------------------------------------------------------"

if grep -q "connection_limit=20" .env.production 2>/dev/null || grep -q "connection_limit" src/lib/prisma.ts; then
  check_pass "Connection pooling configured (20 max)"
else
  check_fail "Connection pooling NOT configured"
fi

if grep -q "SNMP_POLL_INTERVAL=\"\*/15 \* \* \* \*\"" .env.production 2>/dev/null; then
  check_pass "SNMP polling interval: 15 minutes (safe)"
else
  check_warn "SNMP polling interval not set to 15min"
fi

if grep -q "DEFAULT_SNMP_TIMEOUT=30000" .env.production 2>/dev/null; then
  check_pass "SNMP timeout: 30 seconds"
else
  check_warn "SNMP timeout not configured"
fi

echo ""

# Phase 1: Build & Dependencies
echo -e "${BOLD}🔨 PHASE 1: BUILD & DEPENDENCIES${NC}"
echo "----------------------------------------------------------------"

if [[ -d ".next" && -f ".next/BUILD_ID" ]]; then
  check_pass "Next.js production build exists"
else
  check_fail "Production build missing (run: pnpm build)"
fi

if [[ -d "node_modules/@prisma/client" ]]; then
  check_pass "Prisma client generated"
else
  check_fail "Prisma client missing (run: pnpm generate)"
fi

echo ""

# Phase 2: Security
echo -e "${BOLD}🔐 PHASE 2: SECURITY HARDENING${NC}"
echo "----------------------------------------------------------------"

ENV_PERM=$(stat -c %a .env.production 2>/dev/null || echo "000")
if [[ "${ENV_PERM}" == "600" ]]; then
  check_pass ".env.production permissions: 600 (secure)"
else
  check_fail ".env.production permissions: ${ENV_PERM} (should be 600)"
fi

if [[ -d "logs" ]]; then
  LOGS_PERM=$(stat -c %a logs 2>/dev/null || echo "000")
  if [[ "${LOGS_PERM}" == "700" ]]; then
    check_pass "Logs directory permissions: 700 (secure)"
  else
    check_warn "Logs directory permissions: ${LOGS_PERM} (should be 700)"
  fi
else
  check_warn "Logs directory does not exist"
fi

if pm2 describe pm2-logrotate &>/dev/null; then
  check_pass "PM2 log rotation configured"
else
  check_warn "PM2 log rotation not installed"
fi

echo ""

# Phase 3: Observability
echo -e "${BOLD}📈 PHASE 3: OBSERVABILITY & MONITORING${NC}"
echo "----------------------------------------------------------------"

SCRIPTS=("healthcheck.sh" "check-workers.sh" "check-backup.sh" "noc-status.sh")
for script in "${SCRIPTS[@]}"; do
  if [[ -x "scripts/${script}" ]]; then
    check_pass "Script executable: ${script}"
  else
    check_fail "Script missing or not executable: ${script}"
  fi
done

echo ""

# Phase 4: PM2 Workers
echo -e "${BOLD}⚙️  PHASE 4: PM2 WORKERS STATUS${NC}"
echo "----------------------------------------------------------------"

if command -v pm2 &>/dev/null; then
  CRITICAL_WORKERS=("hk-nova-web" "hk-nova-icmp-worker" "hk-nova-snmp-worker")
  for worker in "${CRITICAL_WORKERS[@]}"; do
    if pm2 describe "${worker}" 2>/dev/null | grep -q "status.*online"; then
      check_pass "Worker online: ${worker}"
    else
      check_fail "Worker NOT online: ${worker}"
    fi
  done
else
  check_fail "PM2 not installed or not in PATH"
fi

echo ""

# Phase 5: Evaluation Scripts
echo -e "${BOLD}📊 PHASE 5: EVALUATION SCRIPTS${NC}"
echo "----------------------------------------------------------------"

if [[ -f "scripts/evaluate-pilot.ts" ]]; then
  check_pass "Evaluation script exists"
else
  check_fail "Evaluation script missing"
fi

echo ""

# Phase 6: Backup System
echo -e "${BOLD}💾 PHASE 6: AUTOMATED BACKUP${NC}"
echo "----------------------------------------------------------------"

if [[ -f "scripts/verify-phase6.ts" ]]; then
  check_pass "Backup verification script exists"
else
  check_fail "Backup verification script missing"
fi

if [[ -f "scripts/backup-db.sh" && -x "scripts/backup-db.sh" ]]; then
  check_pass "Database backup script executable"
else
  check_fail "Database backup script missing or not executable"
fi

if [[ -d "backups" ]]; then
  BACKUP_COUNT=$(ls -1 backups/*.sql.gz 2>/dev/null | wc -l || echo 0)
  if (( BACKUP_COUNT > 0 )); then
    check_pass "Database backups exist: ${BACKUP_COUNT} files"
  else
    check_warn "No database backup files found"
  fi
else
  check_warn "Backup directory does not exist"
fi

echo ""

# Phase 7: ML Anomaly Detection
echo -e "${BOLD}🧠 PHASE 7: ML ANOMALY DETECTION${NC}"
echo "----------------------------------------------------------------"

if grep -q "ENABLE_ML_ANOMALY=\"true\"" .env.production 2>/dev/null; then
  check_pass "ML Anomaly Detection enabled"
else
  check_warn "ML Anomaly Detection disabled"
fi

if pm2 describe hk-nova-anomaly-worker 2>/dev/null | grep -q "status.*online"; then
  check_pass "Anomaly worker online"
else
  check_warn "Anomaly worker not online"
fi

echo ""

# Phase 8: HA/DR Scripts
echo -e "${BOLD}🛡️  PHASE 8: HIGH AVAILABILITY & DR${NC}"
echo "----------------------------------------------------------------"

HA_SCRIPTS=("nginx-hk-nova.conf" "setup-nginx-ssl.sh" "backup-offsite.sh" "setup-mysql-replication.sh")
for script in "${HA_SCRIPTS[@]}"; do
  if [[ -f "scripts/${script}" ]]; then
    check_pass "HA/DR script exists: ${script}"
  else
    check_fail "HA/DR script missing: ${script}"
  fi
done

echo ""

# Final Summary
echo -e "${CYAN}================================================================${NC}"
echo -e "${BOLD}FINAL VERIFICATION SUMMARY${NC}"
echo "----------------------------------------------------------------"
echo -e "  ${GREEN}Passed:${NC}  ${PASS}"
echo -e "  ${YELLOW}Warnings:${NC} ${WARN}"
echo -e "  ${RED}Failed:${NC}  ${FAIL}"
echo ""

if (( FAIL == 0 )); then
  echo -e "${GREEN}${BOLD}✅ ALL CRITICAL CHECKS PASSED${NC}"
  echo -e "${GREEN}System is READY for pilot deployment${NC}"
  EXIT_CODE=0
elif (( FAIL <= 2 )); then
  echo -e "${YELLOW}${BOLD}⚠️  MINOR ISSUES DETECTED${NC}"
  echo -e "${YELLOW}Review warnings before deployment${NC}"
  EXIT_CODE=1
else
  echo -e "${RED}${BOLD}❌ CRITICAL ISSUES DETECTED${NC}"
  echo -e "${RED}Fix failed checks before deployment${NC}"
  EXIT_CODE=2
fi

echo -e "${CYAN}================================================================${NC}"
exit ${EXIT_CODE}