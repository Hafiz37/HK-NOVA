#!/bin/bash

# Load Testing Runner for HK-NOVA
# Tests system performance with increasing device counts

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_URL="${API_URL:-http://localhost:3000}"
RESULTS_DIR="$SCRIPT_DIR/results"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "$RESULTS_DIR"

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if system is ready
check_system_ready() {
    log_info "Checking system readiness..."
    
    # Check if API is running
    if ! curl -s "$API_URL/api/health" > /dev/null 2>&1; then
        log_error "API is not responding at $API_URL"
        log_info "Please start the server: pnpm dev"
        exit 1
    fi
    
    # Check if workers are running
    if ! pgrep -f "icmp-poller" > /dev/null; then
        log_warn "ICMP poller is not running"
    fi
    
    if ! pgrep -f "snmp-poller" > /dev/null; then
        log_warn "SNMP poller is not running"
    fi
    
    log_success "System is ready for testing"
}

# Collect system metrics
collect_metrics() {
    local output_file="$1"
    
    {
        echo "=== System Metrics ==="
        echo "Timestamp: $(date -Iseconds)"
        echo ""
        
        echo "--- CPU & Memory ---"
        top -bn1 | head -5
        echo ""
        
        echo "--- Free Memory ---"
        free -h
        echo ""
        
        echo "--- Disk Usage ---"
        df -h | grep -E '/$|/var'
        echo ""
        
        echo "--- Process Count ---"
        ps aux | wc -l
        echo ""
        
        echo "--- Network Connections ---"
        ss -s
        echo ""
        
    } > "$output_file"
}

# Get API metrics
get_api_metrics() {
    local output_file="$1"
    
    curl -s "$API_URL/api/metrics" > "$output_file" 2>/dev/null || echo "{}" > "$output_file"
}

# Get queue metrics
get_queue_metrics() {
    local output_file="$1"
    
    curl -s "$API_URL/api/queue/metrics" > "$output_file" 2>/dev/null || echo "{}" > "$output_file"
}

# Run baseline test
test_baseline() {
    local device_count=$1
    local duration=$2
    local test_name="baseline_${device_count}_devices"
    local result_dir="$RESULTS_DIR/${test_name}_${TIMESTAMP}"
    
    mkdir -p "$result_dir"
    
    log_info "=========================================="
    log_info "Running Baseline Test: $device_count devices"
    log_info "Duration: ${duration}s"
    log_info "=========================================="
    
    # Create test devices
    log_info "Creating $device_count test devices..."
    npx tsx "$PROJECT_ROOT/scripts/testing/create-test-devices.ts" \
        --count="$device_count" \
        --clean \
        --prefix="LOAD-TEST" \
        > "$result_dir/device-creation.log" 2>&1
    
    log_success "Test devices created"
    
    # Collect initial metrics
    log_info "Collecting initial system state..."
    collect_metrics "$result_dir/metrics_start.txt"
    get_api_metrics "$result_dir/api_metrics_start.json"
    
    # Wait for workers to start polling
    log_info "Waiting for workers to start polling (30s)..."
    sleep 30
    
    # Monitor for duration
    log_info "Monitoring system for ${duration}s..."
    local interval=30
    local iterations=$((duration / interval))
    
    for i in $(seq 1 $iterations); do
        local progress=$((i * 100 / iterations))
        echo -ne "   Progress: $progress% ($i/$iterations) \r"
        
        collect_metrics "$result_dir/metrics_${i}.txt"
        get_api_metrics "$result_dir/api_metrics_${i}.json"
        get_queue_metrics "$result_dir/queue_metrics_${i}.json"
        
        sleep $interval
    done
    
    echo ""
    
    # Collect final metrics
    log_info "Collecting final system state..."
    collect_metrics "$result_dir/metrics_end.txt"
    get_api_metrics "$result_dir/api_metrics_end.json"
    get_queue_metrics "$result_dir/queue_metrics_end.json"
    
    # Generate summary
    log_info "Generating test summary..."
    generate_summary "$result_dir" "$device_count" "$duration"
    
    log_success "Baseline test complete: $result_dir"
}

# Run capacity test (gradual increase)
test_capacity() {
    log_info "=========================================="
    log_info "Running Capacity Test"
    log_info "=========================================="
    
    local counts=(50 100 200 300 400 500)
    
    for count in "${counts[@]}"; do
        test_baseline "$count" 300  # 5 minutes per step
        log_info "Cooling down for 60s..."
        sleep 60
    done
    
    log_success "Capacity test complete"
}

# Run soak test (sustained load)
test_soak() {
    local device_count=${1:-500}
    local duration=${2:-3600}  # 1 hour default
    
    log_info "=========================================="
    log_info "Running Soak Test"
    log_info "Devices: $device_count"
    log_info "Duration: ${duration}s ($(($duration / 60)) minutes)"
    log_info "=========================================="
    
    test_baseline "$device_count" "$duration"
    
    log_success "Soak test complete"
}

# Generate test summary
generate_summary() {
    local result_dir=$1
    local device_count=$2
    local duration=$3
    
    local summary_file="$result_dir/SUMMARY.txt"
    
    {
        echo "=========================================="
        echo "Load Test Summary"
        echo "=========================================="
        echo ""
        echo "Test Configuration:"
        echo "  Devices: $device_count"
        echo "  Duration: ${duration}s"
        echo "  Timestamp: $TIMESTAMP"
        echo ""
        
        echo "System Metrics (Start vs End):"
        echo ""
        
        echo "--- CPU Usage ---"
        echo "Start:"
        grep "Cpu(s)" "$result_dir/metrics_start.txt" || echo "N/A"
        echo "End:"
        grep "Cpu(s)" "$result_dir/metrics_end.txt" || echo "N/A"
        echo ""
        
        echo "--- Memory Usage ---"
        echo "Start:"
        grep "Mem:" "$result_dir/metrics_start.txt" || echo "N/A"
        echo "End:"
        grep "Mem:" "$result_dir/metrics_end.txt" || echo "N/A"
        echo ""
        
        echo "--- API Metrics ---"
        if [ -f "$result_dir/api_metrics_end.json" ]; then
            echo "End State:"
            jq -r 'to_entries | .[] | "\(.key): \(.value)"' "$result_dir/api_metrics_end.json" 2>/dev/null || echo "N/A"
        fi
        echo ""
        
        echo "--- Queue Metrics ---"
        if [ -f "$result_dir/queue_metrics_end.json" ]; then
            echo "Queue Status:"
            jq '.' "$result_dir/queue_metrics_end.json" 2>/dev/null || echo "N/A"
        fi
        echo ""
        
        echo "=========================================="
        echo "Test Results: $result_dir"
        echo "=========================================="
        
    } | tee "$summary_file"
}

# Show usage
usage() {
    cat << EOF
Usage: $0 [command] [options]

Commands:
  baseline [count] [duration]  Run baseline test with N devices for N seconds
                                Example: $0 baseline 100 300
  
  capacity                      Run capacity test (50->500 devices)
                                Tests: 50, 100, 200, 300, 400, 500 devices
  
  soak [count] [duration]       Run soak test (sustained load)
                                Example: $0 soak 500 3600
  
  help                          Show this help message

Options:
  count     - Number of test devices (default: 100)
  duration  - Test duration in seconds (default: 300)

Environment Variables:
  API_URL   - API endpoint (default: http://localhost:3000)

Examples:
  # Baseline test with 50 devices for 5 minutes
  $0 baseline 50 300
  
  # Capacity test (gradual increase)
  $0 capacity
  
  # Soak test with 500 devices for 1 hour
  $0 soak 500 3600

EOF
}

# Main script
main() {
    local command=${1:-help}
    
    case "$command" in
        baseline)
            check_system_ready
            local count=${2:-100}
            local duration=${3:-300}
            test_baseline "$count" "$duration"
            ;;
        
        capacity)
            check_system_ready
            test_capacity
            ;;
        
        soak)
            check_system_ready
            local count=${2:-500}
            local duration=${3:-3600}
            test_soak "$count" "$duration"
            ;;
        
        help|--help|-h)
            usage
            ;;
        
        *)
            log_error "Unknown command: $command"
            usage
            exit 1
            ;;
    esac
}

main "$@"
