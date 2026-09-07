#!/bin/bash
set -euo pipefail

echo "🎯 HK-NOVA Load Testing Script"
echo "==============================="
echo ""

# Configuration
BASE_URL="${BASE_URL:-http://localhost:3000}"
DURATION="${DURATION:-60}"  # seconds
CONNECTIONS="${CONNECTIONS:-10}"
WORKERS="${WORKERS:-2}"

# Color codes
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# Check if autocannon is installed
if ! command -v autocannon &> /dev/null; then
    log_warn "autocannon not found, installing..."
    npm install -g autocannon
fi

# Test scenarios
test_health_endpoint() {
    log_info "Testing /api/health endpoint..."
    
    autocannon \
        -c $CONNECTIONS \
        -d $DURATION \
        -w $WORKERS \
        "$BASE_URL/api/health" \
        | tee results-health.txt
}

test_metrics_endpoint() {
    log_info "Testing /api/metrics endpoint..."
    
    autocannon \
        -c $CONNECTIONS \
        -d $DURATION \
        -w $WORKERS \
        "$BASE_URL/api/metrics" \
        | tee results-metrics.txt
}

test_workers_status() {
    log_info "Testing /api/workers/status endpoint..."
    
    autocannon \
        -c $CONNECTIONS \
        -d $DURATION \
        -w $WORKERS \
        "$BASE_URL/api/workers/status" \
        | tee results-workers.txt
}

# Run tests
mkdir -p load-test-results
cd load-test-results

log_info "Starting load tests..."
log_info "Target: $BASE_URL"
log_info "Duration: ${DURATION}s"
log_info "Connections: $CONNECTIONS"
log_info "Workers: $WORKERS"
echo ""

test_health_endpoint
echo ""

test_metrics_endpoint
echo ""

test_workers_status
echo ""

log_info "✅ Load tests completed"
log_info "Results saved in: ./load-test-results/"
