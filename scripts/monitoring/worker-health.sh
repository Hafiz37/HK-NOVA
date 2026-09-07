#!/bin/bash

# Worker Health Check Script
# Monitors worker processes and restarts if needed

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

WORKERS=(
    "icmp-poller"
    "snmp-poller"
    "backup-worker"
    "alert-processor"
    "notification-worker"
)

log_info() {
    echo -e "${GREEN}[$(date +%H:%M:%S)]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[$(date +%H:%M:%S)]${NC} $1"
}

log_error() {
    echo -e "${RED}[$(date +%H:%M:%S)]${NC} $1"
}

check_worker() {
    local worker=$1
    
    if pgrep -f "$worker" > /dev/null; then
        local pid=$(pgrep -f "$worker")
        local uptime=$(ps -p "$pid" -o etime= | tr -d ' ')
        log_info "$worker is running (PID: $pid, Uptime: $uptime)"
        return 0
    else
        log_error "$worker is NOT running"
        return 1
    fi
}

restart_worker() {
    local worker=$1
    
    log_warn "Attempting to restart $worker..."
    
    # Try PM2 restart
    if command -v pm2 &> /dev/null; then
        pm2 restart "$worker" 2>/dev/null && log_info "Restarted via PM2" && return 0
    fi
    
    log_error "Could not restart $worker automatically"
    return 1
}

check_worker_health() {
    local worker=$1
    local pid=$(pgrep -f "$worker")
    
    if [ -z "$pid" ]; then
        return 1
    fi
    
    # Check CPU usage
    local cpu=$(ps -p "$pid" -o %cpu= | tr -d ' ')
    local cpu_int=$(echo "$cpu" | cut -d. -f1)
    
    if [ "$cpu_int" -gt 90 ]; then
        log_warn "$worker CPU usage is high: ${cpu}%"
    fi
    
    # Check memory usage
    local mem=$(ps -p "$pid" -o %mem= | tr -d ' ')
    local mem_int=$(echo "$mem" | cut -d. -f1)
    
    if [ "$mem_int" -gt 80 ]; then
        log_warn "$worker Memory usage is high: ${mem}%"
    fi
    
    return 0
}

main() {
    echo ""
    echo "=========================================="
    echo "Worker Health Check"
    echo "Time: $(date)"
    echo "=========================================="
    echo ""
    
    local failed_workers=()
    
    for worker in "${WORKERS[@]}"; do
        if ! check_worker "$worker"; then
            failed_workers+=("$worker")
        else
            check_worker_health "$worker"
        fi
    done
    
    echo ""
    echo "=========================================="
    
    if [ ${#failed_workers[@]} -eq 0 ]; then
        log_info "All workers are healthy ✅"
    else
        log_error "Failed workers: ${failed_workers[*]}"
        
        if [ "$1" = "--auto-restart" ]; then
            for worker in "${failed_workers[@]}"; do
                restart_worker "$worker"
            done
        else
            echo ""
            log_warn "Run with --auto-restart to automatically restart failed workers"
        fi
    fi
    
    echo ""
}

# Run check every 60 seconds if --monitor flag is provided
if [ "$1" = "--monitor" ]; then
    while true; do
        main "$2"
        sleep 60
    done
else
    main "$@"
fi
