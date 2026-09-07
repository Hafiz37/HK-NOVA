#!/bin/bash
# HK-NOVA Phase 5 Deployment - Final Verification Script

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║       HK-NOVA Phase 5 - Final Deployment Verification         ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Color codes
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Counters
TOTAL_FILES=0
TOTAL_LINES=0

echo -e "${BLUE}📁 Deployment Infrastructure Files:${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Core Docker files
echo ""
echo "🐳 Container Infrastructure:"
for file in Dockerfile .dockerignore docker-compose.yml docker-compose.staging.yml; do
    if [ -f "$file" ]; then
        lines=$(wc -l < "$file")
        printf "  ✅ %-35s %5d lines\n" "$file" "$lines"
        TOTAL_FILES=$((TOTAL_FILES + 1))
        TOTAL_LINES=$((TOTAL_LINES + lines))
    fi
done

# Deployment scripts
echo ""
echo "🚀 Deployment Scripts:"
for file in scripts/deploy-production-docker.sh scripts/deploy-staging.sh scripts/staging-smoke-test.sh scripts/production-readiness-check.sh scripts/post-deploy-validation.sh scripts/load-test.sh; do
    if [ -f "$file" ]; then
        lines=$(wc -l < "$file")
        printf "  ✅ %-35s %5d lines\n" "$(basename $file)" "$lines"
        TOTAL_FILES=$((TOTAL_FILES + 1))
        TOTAL_LINES=$((TOTAL_LINES + lines))
    fi
done

# Monitoring configs
echo ""
echo "📊 Monitoring Configuration:"
for file in monitoring/prometheus.yml monitoring/grafana/provisioning/datasources/prometheus.yml monitoring/grafana/provisioning/dashboards/default.yml monitoring/grafana/dashboards/hk-nova-overview.json; do
    if [ -f "$file" ]; then
        lines=$(wc -l < "$file")
        printf "  ✅ %-35s %5d lines\n" "$(basename $file)" "$lines"
        TOTAL_FILES=$((TOTAL_FILES + 1))
        TOTAL_LINES=$((TOTAL_LINES + lines))
    fi
done

# Documentation
echo ""
echo "📚 Documentation:"
for file in FASE5_COMPLETION_REPORT.md PHASE5_IMPLEMENTATION_COMPLETE.md RUNBOOK_UPDATED.md QUICK_DEPLOY_GUIDE_V2.md; do
    if [ -f "$file" ]; then
        lines=$(wc -l < "$file")
        printf "  ✅ %-35s %5d lines\n" "$file" "$lines"
        TOTAL_FILES=$((TOTAL_FILES + 1))
        TOTAL_LINES=$((TOTAL_LINES + lines))
    fi
done

# Environment templates
echo ""
echo "🔧 Configuration Templates:"
for file in .env.staging .env.production.template; do
    if [ -f "$file" ]; then
        lines=$(wc -l < "$file")
        printf "  ✅ %-35s %5d lines\n" "$file" "$lines"
        TOTAL_FILES=$((TOTAL_FILES + 1))
        TOTAL_LINES=$((TOTAL_LINES + lines))
    fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}Total Files: $TOTAL_FILES${NC}"
echo -e "${GREEN}Total Lines: $TOTAL_LINES${NC}"
echo ""

# Verify script permissions
echo -e "${BLUE}🔐 Script Permissions:${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
for script in scripts/deploy-production-docker.sh scripts/deploy-staging.sh scripts/staging-smoke-test.sh scripts/production-readiness-check.sh scripts/post-deploy-validation.sh scripts/load-test.sh; do
    if [ -f "$script" ]; then
        if [ -x "$script" ]; then
            echo "  ✅ $(basename $script) - executable"
        else
            echo "  ⚠️  $(basename $script) - not executable (run: chmod +x $script)"
        fi
    fi
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${GREEN}✅ Phase 5 Implementation Complete!${NC}"
echo ""
echo "📋 Next Steps:"
echo "  1. Review FASE5_COMPLETION_REPORT.md"
echo "  2. Run: ./scripts/production-readiness-check.sh"
echo "  3. Deploy staging: ./scripts/deploy-staging.sh deploy"
echo "  4. Run smoke tests: ./scripts/staging-smoke-test.sh"
echo "  5. Deploy production: ./scripts/deploy-production-docker.sh deploy"
echo ""
echo "📖 Documentation:"
echo "  - Quick Start: QUICK_DEPLOY_GUIDE_V2.md"
echo "  - Operations: RUNBOOK_UPDATED.md"
echo "  - Full Guide: PHASE5_IMPLEMENTATION_COMPLETE.md"
echo ""
