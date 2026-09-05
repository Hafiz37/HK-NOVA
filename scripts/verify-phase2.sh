#!/bin/bash
# Phase 2 Verification Script
# Run this after deployment to verify pooling is working correctly

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║         Phase 2 Verification - Connection Pooling            ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

PASSED=0
FAILED=0
WARNINGS=0

# Function to check metric
check_metric() {
    local metric=$1
    local threshold=$2
    local operator=$3
    local description=$4
    
    value=$(curl -s http://localhost:3000/api/metrics 2>/dev/null | grep "^${metric}" | grep -v "#" | awk '{print $2}' | head -1)
    
    if [ -z "$value" ]; then
        echo -e "${YELLOW}⚠️  WARNING${NC}: Metric $metric not found"
        ((WARNINGS++))
        return
    fi
    
    if [ "$operator" = "lt" ]; then
        if (( $(echo "$value < $threshold" | bc -l) )); then
            echo -e "${GREEN}✅ PASS${NC}: $description ($value < $threshold)"
            ((PASSED++))
        else
            echo -e "${RED}❌ FAIL${NC}: $description ($value >= $threshold)"
            ((FAILED++))
        fi
    elif [ "$operator" = "gt" ]; then
        if (( $(echo "$value > $threshold" | bc -l) )); then
            echo -e "${GREEN}✅ PASS${NC}: $description ($value > $threshold)"
            ((PASSED++))
        else
            echo -e "${RED}❌ FAIL${NC}: $description ($value <= $threshold)"
            ((FAILED++))
        fi
    fi
}

echo "1. Checking SSH Pool Health..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

check_metric "ssh_pool_connections_active" "1500" "lt" "SSH connections under limit"
check_metric "ssh_pool_devices_total" "0" "gt" "SSH pool tracking devices"

# Check reuse rate
created=$(curl -s http://localhost:3000/api/metrics 2>/dev/null | grep "^ssh_pool_connections_created_total" | awk '{print $2}')
reused=$(curl -s http://localhost:3000/api/metrics 2>/dev/null | grep "^ssh_pool_connections_reused_total" | awk '{print $2}')

if [ -n "$created" ] && [ -n "$reused" ] && [ "$created" != "0" ]; then
    total=$((created + reused))
    if [ $total -gt 10 ]; then
        reuse_rate=$(echo "scale=2; $reused / $total" | bc)
        if (( $(echo "$reuse_rate > 0.80" | bc -l) )); then
            echo -e "${GREEN}✅ PASS${NC}: SSH reuse rate healthy ($reuse_rate > 0.80)"
            ((PASSED++))
        else
            echo -e "${YELLOW}⚠️  WARNING${NC}: SSH reuse rate low ($reuse_rate <= 0.80)"
            ((WARNINGS++))
        fi
    else
        echo -e "${YELLOW}⚠️  INFO${NC}: Insufficient data for reuse rate (total: $total)"
    fi
fi

echo ""
echo "2. Checking Database Pool Health..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

check_metric "database_connections_active" "50" "lt" "Database connections under limit"

echo ""
echo "3. Checking Redis Pool Health..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

redis_active=$(curl -s http://localhost:3000/api/metrics 2>/dev/null | grep "^redis_connections_active" | awk '{print $2}')
if [ -n "$redis_active" ]; then
    check_metric "redis_connections_active" "10" "lt" "Redis connections stable"
else
    echo -e "${YELLOW}⚠️  INFO${NC}: Redis metrics not available (may be using in-memory fallback)"
fi

echo ""
echo "4. Checking System Resources..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check file descriptors
if command -v lsof &> /dev/null; then
    fd_count=$(lsof -p $(pgrep -f "node.*next" | head -1) 2>/dev/null | wc -l)
    if [ -n "$fd_count" ] && [ "$fd_count" -gt 0 ]; then
        if [ "$fd_count" -lt 10000 ]; then
            echo -e "${GREEN}✅ PASS${NC}: File descriptors healthy ($fd_count < 10000)"
            ((PASSED++))
        else
            echo -e "${RED}❌ FAIL${NC}: High file descriptor count ($fd_count >= 10000)"
            ((FAILED++))
        fi
    else
        echo -e "${YELLOW}⚠️  INFO${NC}: Could not determine file descriptor count"
    fi
else
    echo -e "${YELLOW}⚠️  INFO${NC}: lsof not available, skipping FD check"
fi

# Check if app is running
if pgrep -f "node.*next" > /dev/null; then
    echo -e "${GREEN}✅ PASS${NC}: Application is running"
    ((PASSED++))
else
    echo -e "${RED}❌ FAIL${NC}: Application is not running"
    ((FAILED++))
fi

echo ""
echo "5. Checking Build Status..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ -d ".next" ]; then
    echo -e "${GREEN}✅ PASS${NC}: Build directory exists"
    ((PASSED++))
else
    echo -e "${RED}❌ FAIL${NC}: Build directory missing"
    ((FAILED++))
fi

if [ -f "src/lib/ssh-pool.ts" ]; then
    echo -e "${GREEN}✅ PASS${NC}: SSH pool implementation present"
    ((PASSED++))
else
    echo -e "${RED}❌ FAIL${NC}: SSH pool implementation missing"
    ((FAILED++))
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                     Verification Summary                     ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo -e "${GREEN}✅ Passed:${NC}   $PASSED"
echo -e "${RED}❌ Failed:${NC}   $FAILED"
echo -e "${YELLOW}⚠️  Warnings:${NC} $WARNINGS"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 Phase 2 verification PASSED!${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Monitor metrics for 24 hours"
    echo "  2. Check SSH reuse rate reaches >95%"
    echo "  3. Verify no connection leaks"
    echo "  4. Run load test: pnpm tsx scripts/load-test-pooling.ts"
    echo ""
    exit 0
else
    echo -e "${RED}⚠️  Phase 2 verification FAILED${NC}"
    echo ""
    echo "Please review the failures above and:"
    echo "  1. Check application logs"
    echo "  2. Verify environment configuration"
    echo "  3. Ensure database and Redis are accessible"
    echo "  4. Review docs/PHASE2_QUICK_REFERENCE.md"
    echo ""
    exit 1
fi
