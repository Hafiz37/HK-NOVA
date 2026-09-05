#!/bin/bash

# Performance Testing Suite for HK-NOVA
# Week 7: Load Testing & Optimization

set -e

echo "🎯 HK-NOVA Performance Testing Suite"
echo "======================================"
echo ""

# Configuration
BASE_URL="${BASE_URL:-http://localhost:3000}"
TEST_USERNAME="${TEST_USERNAME:-operator}"
TEST_PASSWORD="${TEST_PASSWORD:-test-password}"
REPORT_DIR="./tests/load/reports"

# Create reports directory
mkdir -p "$REPORT_DIR"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if server is running
check_server() {
    echo "Checking if server is running at $BASE_URL..."
    if curl -s -f "$BASE_URL/api/health" > /dev/null 2>&1; then
        print_status "Server is running"
        return 0
    else
        print_error "Server is not running at $BASE_URL"
        return 1
    fi
}

# Baseline performance test
run_baseline_test() {
    echo ""
    echo "📊 Running Baseline Performance Test..."
    echo "----------------------------------------"
    
    node tests/load/load-runner.js spike 2>&1 | tee "$REPORT_DIR/baseline-$(date +%Y%m%d-%H%M%S).log"
    
    print_status "Baseline test completed"
}

# Stress test with K6
run_stress_test() {
    echo ""
    echo "🔥 Running Stress Test with K6..."
    echo "----------------------------------------"
    
    if ! command -v k6 &> /dev/null; then
        print_warning "K6 not installed, skipping stress test"
        return 1
    fi
    
    k6 run --out json="$REPORT_DIR/stress-test-$(date +%Y%m%d-%H%M%S).json" \
        tests/load/scenarios/stress-test.js
    
    print_status "Stress test completed"
}

# Spike test
run_spike_test() {
    echo ""
    echo "⚡ Running Spike Test..."
    echo "----------------------------------------"
    
    node tests/load/load-runner.js spike 2>&1 | tee "$REPORT_DIR/spike-$(date +%Y%m%d-%H%M%S).log"
    
    print_status "Spike test completed"
}

# Soak test (long duration)
run_soak_test() {
    echo ""
    echo "🕐 Running Soak Test (1 hour)..."
    echo "----------------------------------------"
    print_warning "This test will run for 1 hour"
    
    node tests/load/load-runner.js soak 2>&1 | tee "$REPORT_DIR/soak-$(date +%Y%m%d-%H%M%S).log"
    
    print_status "Soak test completed"
}

# Capacity test
run_capacity_test() {
    echo ""
    echo "📈 Running Capacity Test..."
    echo "----------------------------------------"
    
    node tests/load/load-runner.js capacity 2>&1 | tee "$REPORT_DIR/capacity-$(date +%Y%m%d-%H%M%S).log"
    
    print_status "Capacity test completed"
}

# Database performance test
run_db_performance_test() {
    echo ""
    echo "💾 Running Database Performance Test..."
    echo "----------------------------------------"
    
    # Test query performance
    echo "Testing query performance..."
    
    # You can add custom DB queries here
    print_status "Database test completed"
}

# SSH pool performance test
run_ssh_pool_test() {
    echo ""
    echo "🔌 Running SSH Pool Performance Test..."
    echo "----------------------------------------"
    
    # Test SSH connection pooling
    echo "Testing SSH connection pooling..."
    
    # You can add custom SSH pool tests here
    print_status "SSH pool test completed"
}

# Memory leak test
run_memory_leak_test() {
    echo ""
    echo "🧪 Running Memory Leak Test..."
    echo "----------------------------------------"
    
    print_warning "Monitoring memory usage over 30 minutes..."
    
    # Start memory monitoring
    MEMORY_LOG="$REPORT_DIR/memory-$(date +%Y%m%d-%H%M%S).log"
    
    for i in {1..60}; do
        TIMESTAMP=$(date +%Y-%m-%d\ %H:%M:%S)
        MEMORY=$(ps aux | grep "node.*next" | grep -v grep | awk '{sum+=$6} END {print sum/1024}')
        echo "$TIMESTAMP,$MEMORY" >> "$MEMORY_LOG"
        sleep 30
    done
    
    print_status "Memory leak test completed - check $MEMORY_LOG"
}

# Generate performance report
generate_report() {
    echo ""
    echo "📄 Generating Performance Report..."
    echo "----------------------------------------"
    
    REPORT_FILE="$REPORT_DIR/performance-summary-$(date +%Y%m%d-%H%M%S).md"
    
    cat > "$REPORT_FILE" << EOF
# HK-NOVA Performance Test Report

**Generated:** $(date)
**Base URL:** $BASE_URL

## Test Summary

### Baseline Test
- See: baseline-*.log

### Stress Test
- See: stress-test-*.json

### Spike Test
- See: spike-*.log

### Capacity Test
- See: capacity-*.log

### Soak Test
- See: soak-*.log

### Memory Test
- See: memory-*.log

## Recommendations

1. Review all log files in: $REPORT_DIR
2. Analyze bottlenecks from stress test results
3. Check memory leak indicators in memory log
4. Validate capacity findings against requirements

## Next Steps

- [ ] Address performance bottlenecks
- [ ] Implement caching strategy
- [ ] Optimize database queries
- [ ] Tune SSH connection pool settings
- [ ] Add CDN for static assets
- [ ] Enable gzip compression
- [ ] Review bundle size optimization

EOF
    
    print_status "Report generated: $REPORT_FILE"
}

# Main test suite
run_full_suite() {
    echo "Running full performance test suite..."
    
    check_server || exit 1
    
    run_baseline_test
    run_spike_test
    run_capacity_test
    
    # Optional: run these if time permits
    # run_stress_test
    # run_soak_test
    # run_memory_leak_test
    
    generate_report
    
    echo ""
    print_status "All tests completed!"
    echo ""
    echo "📁 Reports saved to: $REPORT_DIR"
}

# Parse command line arguments
case "${1:-full}" in
    baseline)
        check_server && run_baseline_test
        ;;
    stress)
        check_server && run_stress_test
        ;;
    spike)
        check_server && run_spike_test
        ;;
    soak)
        check_server && run_soak_test
        ;;
    capacity)
        check_server && run_capacity_test
        ;;
    memory)
        check_server && run_memory_leak_test
        ;;
    full)
        run_full_suite
        ;;
    *)
        echo "Usage: $0 [baseline|stress|spike|soak|capacity|memory|full]"
        exit 1
        ;;
esac
