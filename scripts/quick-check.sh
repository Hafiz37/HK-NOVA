#!/bin/bash
# Quick deployment verification - Run this first!

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║          HK-NOVA FASE 5 - Quick Deployment Check              ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0

check() {
    if [ $? -eq 0 ]; then
        echo -e "  ${GREEN}✅${NC} $1"
        PASS=$((PASS + 1))
    else
        echo -e "  ${RED}❌${NC} $1"
        FAIL=$((FAIL + 1))
    fi
}

# Core files
echo "🔍 Checking Core Files..."
[ -f Dockerfile ] && check "Dockerfile exists" || check "Dockerfile exists"
[ -f docker-compose.yml ] && check "docker-compose.yml exists" || check "docker-compose.yml exists"
[ -f .dockerignore ] && check ".dockerignore exists" || check ".dockerignore exists"

# Scripts
echo ""
echo "📜 Checking Deployment Scripts..."
[ -x scripts/deploy-production-docker.sh ] && check "Production deployment script ready" || check "Production deployment script ready"
[ -x scripts/deploy-staging.sh ] && check "Staging deployment script ready" || check "Staging deployment script ready"
[ -x scripts/staging-smoke-test.sh ] && check "Smoke test script ready" || check "Smoke test script ready"
[ -x scripts/production-readiness-check.sh ] && check "Readiness check script ready" || check "Readiness check script ready"

# Documentation
echo ""
echo "📚 Checking Documentation..."
[ -f QUICK_DEPLOY_GUIDE_V2.md ] && check "Quick deploy guide exists" || check "Quick deploy guide exists"
[ -f RUNBOOK_UPDATED.md ] && check "Operations runbook exists" || check "Operations runbook exists"
[ -f FASE5_COMPLETION_REPORT.md ] && check "Completion report exists" || check "Completion report exists"

# Prerequisites
echo ""
echo "🔧 Checking Prerequisites..."
command -v docker &> /dev/null && check "Docker installed" || check "Docker installed"
command -v docker-compose &> /dev/null || docker compose version &> /dev/null && check "Docker Compose installed" || check "Docker Compose installed"

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "Checks Passed: ${GREEN}${PASS}${NC}"
echo -e "Checks Failed: ${RED}${FAIL}${NC}"
echo ""

if [ $FAIL -eq 0 ]; then
    echo -e "${GREEN}✅ System is ready for deployment!${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Read: cat START_HERE_FASE5.md"
    echo "  2. Deploy staging: ./scripts/deploy-staging.sh deploy"
    echo "  3. Run tests: ./scripts/staging-smoke-test.sh"
else
    echo -e "${RED}⚠️  Some checks failed. Please review.${NC}"
fi
echo ""
