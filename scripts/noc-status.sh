#!/usr/bin/env bash
# ==============================================================================
# noc-status.sh — Comprehensive 1-Command Dashboard Status for NOC Operations
# ==============================================================================

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo -e "${CYAN}${BOLD}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}${BOLD}║           HK-NOVA NOC - System Operations Dashboard           ║${NC}"
echo -e "${CYAN}${BOLD}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# 1. System Resources
echo -e "${BOLD}📊 SYSTEM RESOURCES${NC}"
echo "----------------------------------------------------------------"
MEM_TOTAL=$(free -h | awk '/^Mem:/ {print $2}')
MEM_USED=$(free -h | awk '/^Mem:/ {print $3}')
MEM_AVAIL=$(free -h | awk '/^Mem:/ {print $7}')
LOAD_AVG=$(uptime | awk -F'load average:' '{print $2}')

echo -e "  Memory Usage : ${GREEN}${MEM_USED}${NC} / ${MEM_TOTAL} (Available: ${GREEN}${MEM_AVAIL}${NC})"
echo -e "  Load Average :${CYAN}${LOAD_AVG}${NC}"
echo ""

# 2. PM2 Workers
echo -e "${BOLD}⚙️  PM2 WORKERS STATUS${NC}"
echo "----------------------------------------------------------------"
if command -v pm2 &>/dev/null; then
  pm2 jlist 2>/dev/null | node -e '
    const list = JSON.parse(fs.readFileSync(0, "utf-8"));
    if (!list || list.length === 0) {
      console.log("  (No PM2 workers active)");
      process.exit(0);
    }
    list.forEach(app => {
      const status = app.pm2_env.status === "online" ? "\x1b[32mONLINE\x1b[0m" : "\x1b[31m" + app.pm2_env.status.toUpperCase() + "\x1b[0m";
      const mem = Math.round((app.monit.memory || 0) / 1024 / 1024) + "MB";
      const cpu = (app.monit.cpu || 0) + "%";
      console.log(`  - ${app.name.padEnd(35)} : ${status.padEnd(20)} [CPU: ${cpu}, RAM: ${mem}]`);
    });
  ' || echo "  Unable to parse PM2 list"
else
  echo -e "  ${YELLOW}PM2 CLI not installed or inactive in PATH.${NC}"
fi
echo ""

# 3. HTTP Health
echo -e "${BOLD}🌐 HTTP & API HEALTH${NC}"
echo "----------------------------------------------------------------"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "http://localhost:3000/login" || echo "000")
if [[ "${HTTP_CODE}" == "200" || "${HTTP_CODE}" == "302" ]]; then
  echo -e "  Web Application (http://localhost:3000/login) : ${GREEN}✅ ONLINE (HTTP ${HTTP_CODE})${NC}"
else
  echo -e "  Web Application (http://localhost:3000/login) : ${RED}❌ DOWN (HTTP ${HTTP_CODE})${NC}"
fi
echo ""

# 4. Database & Backups
echo -e "${BOLD}💾 DATABASE & BACKUPS${NC}"
echo "----------------------------------------------------------------"
LATEST_BACKUP=$(ls -t "${PROJECT_ROOT}/backups"/*.sql.gz 2>/dev/null | head -1 || true)
if [[ -n "${LATEST_BACKUP}" ]]; then
  SIZE=$(du -h "${LATEST_BACKUP}" | cut -f1)
  NAME=$(basename "${LATEST_BACKUP}")
  echo -e "  Latest DB Backup : ${GREEN}✅ ${NAME} (${SIZE})${NC}"
else
  echo -e "  Latest DB Backup : ${YELLOW}⚠️ No backup files found in backups/${NC}"
fi
echo ""

echo -e "${CYAN}================================================================${NC}"
