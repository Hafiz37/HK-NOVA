#!/bin/bash
set -euo pipefail

echo "🔍 HK-NOVA Post-Deployment Validation"
echo "======================================"
echo ""

# Configuration
BASE_URL="${BASE_URL:-http://localhost:3000}"
VALIDATION_DURATION="${VALIDATION_DURATION:-3600}"  # 1 hour in seconds

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

# Validation checks
check_health() {
    local status=$(curl -s -w "%{http_code}" -o /tmp/health.json "$BASE_URL/api/health" || echo "000")
    
    if [ "$status" = "200" ]; then
        echo "✅"
    else
        echo "❌"
        log_error "Health check failed (HTTP $status)"
        return 1
    fi
}

check_workers() {
    local workers=$(curl -s "$BASE_URL/api/workers/status" | jq '[.[] | select(.healthy == true)] | length' 2>/dev/null || echo "0")
    
    if [ "$workers" -gt 0 ]; then
        echo "✅ ($workers)"
    else
        echo "⚠️  (0)"
        log_warn "No healthy workers"
    fi
}

check_error_rate() {
    local errors=$(curl -s "$BASE_URL/api/metrics" | grep "http_requests_total.*5[0-9][0-9]" | awk '{sum+=$2} END {print sum}' || echo "0")
    
    if [ "$errors" -lt 10 ]; then
        echo "✅ ($errors)"
    else
        echo "⚠️  ($errors)"
        log_warn "High error rate: $errors errors"
    fi
}

check_memory() {
    local memory=$(curl -s "$BASE_URL/api/platform/health" | jq -r '.memory.usagePercent' 2>/dev/null || echo "0")
    
    if (( $(echo "$memory < 80" | bc -l) )); then
        echo "✅ (${memory}%)"
    else
        echo "⚠️  (${memory}%)"
        log_warn "High memory usage: ${memory}%"
    fi
}

check_database() {
    local connected=$(curl -s "$BASE_URL/api/health" | jq -r '.database.connected' 2>/dev/null || echo "false")
    
    if [ "$connected" = "true" ]; then
        echo "✅"
    else
        echo "❌"
        log_error "Database not connected"
        return 1
    fi
}

# Main validation loop
log_info "Starting continuous validation for $VALIDATION_DURATION seconds..."
log_info "Target: $BASE_URL"
echo ""

START_TIME=$(date +%s)
ITERATION=1
CRITICAL_FAILURES=0

while true; do
    CURRENT_TIME=$(date +%s)
    ELAPSED=$((CURRENT_TIME - START_TIME))
    
    if [ $ELAPSED -ge $VALIDATION_DURATION ]; then
        break
    fi
    
    REMAINING=$((VALIDATION_DURATION - ELAPSED))
    
    # Clear screen and show header
    clear
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "HK-NOVA Post-Deployment Validation"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Iteration: #$ITERATION"
    echo "Elapsed: ${ELAPSED}s / ${VALIDATION_DURATION}s"
    echo "Remaining: ${REMAINING}s"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    
    # Run checks
    printf "%-30s %s\n" "Health Check:" "$(check_health)"
    if [ $? -ne 0 ]; then
        CRITICAL_FAILURES=$((CRITICAL_FAILURES + 1))
    fi
    
    printf "%-30s %s\n" "Database:" "$(check_database)"
    if [ $? -ne 0 ]; then
        CRITICAL_FAILURES=$((CRITICAL_FAILURES + 1))
    fi
    
    printf "%-30s %s\n" "Workers:" "$(check_workers)"
    printf "%-30s %s\n" "Error Rate:" "$(check_error_rate)"
    printf "%-30s %s\n" "Memory Usage:" "$(check_memory)"
    
    echo ""
    echo "Critical Failures: $CRITICAL_FAILURES"
    
    if [ $CRITICAL_FAILURES -ge 3 ]; then
        echo ""
        log_error "Too many critical failures detected!"
        log_error "Consider rolling back the deployment"
        exit 1
    fi
    
    echo ""
    echo "Next check in 30 seconds... (Ctrl+C to stop)"
    
    ITERATION=$((ITERATION + 1))
    sleep 30
done

# Final summary
clear
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Validation Complete"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
log_info "Validation completed: $ITERATION iterations over $VALIDATION_DURATION seconds"
echo ""

if [ $CRITICAL_FAILURES -eq 0 ]; then
    log_info "✅ No critical failures detected"
    log_info "Deployment appears stable"
    exit 0
else
    log_warn "⚠️  $CRITICAL_FAILURES critical failures detected"
    log_warn "Review logs and consider rollback if issues persist"
    exit 1
fi
