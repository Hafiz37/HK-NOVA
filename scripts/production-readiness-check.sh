#!/bin/bash
set -euo pipefail

echo "📋 HK-NOVA Production Readiness Checklist"
echo "=========================================="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Counters
CHECKS_PASSED=0
CHECKS_FAILED=0
CHECKS_WARNING=0
CHECKS_TOTAL=0

check_pass() {
    echo -e "${GREEN}✅ PASS${NC}: $1"
    CHECKS_PASSED=$((CHECKS_PASSED + 1))
    CHECKS_TOTAL=$((CHECKS_TOTAL + 1))
}

check_fail() {
    echo -e "${RED}❌ FAIL${NC}: $1"
    CHECKS_FAILED=$((CHECKS_FAILED + 1))
    CHECKS_TOTAL=$((CHECKS_TOTAL + 1))
}

check_warn() {
    echo -e "${YELLOW}⚠️  WARN${NC}: $1"
    CHECKS_WARNING=$((CHECKS_WARNING + 1))
    CHECKS_TOTAL=$((CHECKS_TOTAL + 1))
}

section() {
    echo ""
    echo -e "${YELLOW}━━━ $1 ━━━${NC}"
}

# 1. Prerequisites
section "1. Prerequisites"

if command -v docker &> /dev/null; then
    DOCKER_VERSION=$(docker --version | grep -oP '\d+\.\d+\.\d+' | head -1)
    check_pass "Docker installed (version: $DOCKER_VERSION)"
else
    check_fail "Docker not installed"
fi

if command -v docker-compose &> /dev/null || docker compose version &> /dev/null; then
    check_pass "Docker Compose installed"
else
    check_fail "Docker Compose not installed"
fi

if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    check_pass "Node.js installed ($NODE_VERSION)"
else
    check_warn "Node.js not installed (optional for Docker deployment)"
fi

if command -v pnpm &> /dev/null; then
    PNPM_VERSION=$(pnpm --version)
    check_pass "pnpm installed ($PNPM_VERSION)"
else
    check_warn "pnpm not installed (optional for Docker deployment)"
fi

# 2. Configuration Files
section "2. Configuration Files"

if [ -f .env.production ]; then
    check_pass ".env.production exists"
    
    # Check for default values
    if grep -q "CHANGE_ME" .env.production; then
        check_fail ".env.production contains CHANGE_ME placeholders"
    else
        check_pass "No CHANGE_ME placeholders in .env.production"
    fi
    
    # Check for required keys
    REQUIRED_KEYS=(
        "DATABASE_URL"
        "ENCRYPTION_KEY"
        "JWT_SECRET"
        "AUDIT_HMAC_KEY"
        "BACKUP_ENCRYPTION_KEY"
    )
    
    for key in "${REQUIRED_KEYS[@]}"; do
        if grep -q "^${key}=" .env.production; then
            check_pass "$key configured"
        else
            check_fail "$key missing in .env.production"
        fi
    done
else
    check_fail ".env.production not found"
fi

if [ -f docker-compose.yml ]; then
    check_pass "docker-compose.yml exists"
else
    check_fail "docker-compose.yml not found"
fi

if [ -f Dockerfile ]; then
    check_pass "Dockerfile exists"
else
    check_fail "Dockerfile not found"
fi

# 3. Security
section "3. Security"

if [ -f .env.production ]; then
    # Check encryption key length
    ENCRYPTION_KEY=$(grep "^ENCRYPTION_KEY=" .env.production | cut -d'=' -f2 | tr -d '"' || echo "")
    if [ ${#ENCRYPTION_KEY} -ge 64 ]; then
        check_pass "Encryption key has sufficient length"
    else
        check_fail "Encryption key too short (need 64+ chars)"
    fi
    
    # Check JWT secret length
    JWT_SECRET=$(grep "^JWT_SECRET=" .env.production | cut -d'=' -f2 | tr -d '"' || echo "")
    if [ ${#JWT_SECRET} -ge 32 ]; then
        check_pass "JWT secret has sufficient length"
    else
        check_fail "JWT secret too short (need 32+ chars)"
    fi
fi

# Check if secrets are in .gitignore
if grep -q ".env.production" .gitignore; then
    check_pass ".env.production in .gitignore"
else
    check_fail ".env.production NOT in .gitignore (security risk!)"
fi

# 4. Database
section "4. Database"

if [ -d prisma ]; then
    check_pass "Prisma directory exists"
    
    if [ -f prisma/schema.prisma ]; then
        check_pass "Prisma schema exists"
    else
        check_fail "Prisma schema not found"
    fi
else
    check_fail "Prisma directory not found"
fi

# 5. Monitoring
section "5. Monitoring"

if [ -f monitoring/prometheus.yml ]; then
    check_pass "Prometheus configuration exists"
else
    check_warn "Prometheus configuration not found"
fi

if [ -d monitoring/grafana ]; then
    check_pass "Grafana configuration directory exists"
else
    check_warn "Grafana configuration directory not found"
fi

# 6. Backup & Recovery
section "6. Backup & Recovery"

if [ -f scripts/backup-db.sh ]; then
    check_pass "Database backup script exists"
else
    check_warn "Database backup script not found"
fi

if [ -f scripts/restore-db.sh ]; then
    check_pass "Database restore script exists"
else
    check_warn "Database restore script not found"
fi

# 7. Deployment Scripts
section "7. Deployment Scripts"

if [ -f scripts/deploy-production-docker.sh ]; then
    check_pass "Production deployment script exists"
    
    if [ -x scripts/deploy-production-docker.sh ]; then
        check_pass "Deployment script is executable"
    else
        check_warn "Deployment script not executable (run: chmod +x scripts/deploy-production-docker.sh)"
    fi
else
    check_fail "Production deployment script not found"
fi

if [ -f scripts/staging-smoke-test.sh ]; then
    check_pass "Smoke test script exists"
else
    check_warn "Smoke test script not found"
fi

# 8. Documentation
section "8. Documentation"

if [ -f PHASE5_DEPLOYMENT_GUIDE.md ]; then
    check_pass "Deployment guide exists"
else
    check_warn "Deployment guide not found"
fi

if [ -f RUNBOOK.md ]; then
    check_pass "Runbook exists"
else
    check_warn "Runbook not found"
fi

if [ -f README.md ]; then
    check_pass "README exists"
else
    check_warn "README not found"
fi

# 9. Disk Space
section "9. System Resources"

AVAILABLE_SPACE=$(df -BG . | tail -1 | awk '{print $4}' | sed 's/G//')
if [ "$AVAILABLE_SPACE" -ge 10 ]; then
    check_pass "Sufficient disk space (${AVAILABLE_SPACE}GB available)"
else
    check_warn "Low disk space (${AVAILABLE_SPACE}GB available, recommend 10GB+)"
fi

# 10. Network Ports
section "10. Network Ports"

REQUIRED_PORTS=(3000 3306 6379 9090 3001)
for port in "${REQUIRED_PORTS[@]}"; do
    if command -v netstat &> /dev/null; then
        if netstat -tuln | grep -q ":$port "; then
            check_warn "Port $port is already in use"
        else
            check_pass "Port $port is available"
        fi
    elif command -v ss &> /dev/null; then
        if ss -tuln | grep -q ":$port "; then
            check_warn "Port $port is already in use"
        else
            check_pass "Port $port is available"
        fi
    else
        check_warn "Cannot check port $port (no netstat/ss command)"
    fi
done

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Production Readiness Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Total Checks: $CHECKS_TOTAL"
echo -e "${GREEN}Passed: $CHECKS_PASSED${NC}"
echo -e "${YELLOW}Warnings: $CHECKS_WARNING${NC}"
echo -e "${RED}Failed: $CHECKS_FAILED${NC}"
echo ""

if [ $CHECKS_FAILED -eq 0 ]; then
    if [ $CHECKS_WARNING -eq 0 ]; then
        echo -e "${GREEN}✅ System is ready for production deployment!${NC}"
        exit 0
    else
        echo -e "${YELLOW}⚠️  System is mostly ready, but review warnings${NC}"
        exit 0
    fi
else
    echo -e "${RED}❌ System is NOT ready for production${NC}"
    echo "Please fix all failed checks before deploying."
    exit 1
fi
