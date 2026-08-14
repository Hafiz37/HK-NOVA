#!/bin/bash
# Demo SNMP Agents Setup
# Runs 3 snmpd instances on configurable ports (default: 1161-1163 for non-root)
# Can run with or without sudo

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_DIR="/tmp/hk-nova-snmpd-pids"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}ℹ${NC} $1"; }
log_success() { echo -e "${GREEN}✓${NC} $1"; }
log_warn() { echo -e "${YELLOW}⚠${NC} $1"; }
log_error() { echo -e "${RED}✗${NC} $1"; }

# Default ports (non-root: >1024, root: 161)
DEFAULT_BASE_PORT=1161
USE_SUDO=false

# Parse arguments
for arg in "$@"; do
  case $arg in
    --sudo)
      USE_SUDO=true
      shift
      ;;
    --port=*)
      BASE_PORT="${arg#*=}"
      shift
      ;;
    --port)
      BASE_PORT="$2"
      shift 2
      ;;
  esac
done

BASE_PORT="${BASE_PORT:-$DEFAULT_BASE_PORT}"
SUDO_CMD=""
if [ "$USE_SUDO" = true ]; then
  SUDO_CMD="sudo"
  log_info "Running with sudo (will use port 161 if base=161)"
else
  log_info "Running WITHOUT sudo (ports must be >1024)"
fi

# Check if snmpd is installed
check_snmpd() {
  if ! command -v snmpd &> /dev/null; then
    log_warn "snmpd not found. Installing net-snmp..."
    if [ "$USE_SUDO" = true ]; then
      sudo apt-get update -qq
      sudo apt-get install -y snmpd snmp
    else
      log_error "Cannot install snmpd without sudo. Please run with --sudo or install manually: sudo apt-get install snmpd snmp"
      exit 1
    fi
    log_success "snmpd installed"
  else
    log_success "snmpd is already installed"
  fi
}

# Generate config files
generate_configs() {
  log_info "Generating snmpd config files (base port: $BASE_PORT)..."

  for i in 1 2 3; do
    local port=$((BASE_PORT + i - 1))
    local ip="127.0.0.$((i+1))"
    local conf="$SCRIPT_DIR/snmpd-lab$i.conf"

    cat > "$conf" <<EOF
# SNMP Agent Lab $i - $ip:$port
agentAddress udp:$ip:$port
rocommunity public
sysLocation Local Lab
sysContact Admin <admin@hknova.local>
sysName SNMP-Agent-Lab-$i
dontLogTCPWrappersConnects yes
EOF
  done

  log_success "Config files generated in $SCRIPT_DIR"
}

# Start agents
start_agents() {
  log_info "Starting SNMP agents on ports $BASE_PORT-$((BASE_PORT+2))..."
  mkdir -p "$PID_DIR"

  for i in 1 2 3; do
    local port=$((BASE_PORT + i - 1))
    local ip="127.0.0.$((i+1))"
    local conf="$SCRIPT_DIR/snmpd-lab$i.conf"
    local pid_file="$PID_DIR/snmpd-lab$i.pid"
    local log_file="$PID_DIR/snmpd-lab$i.log"

    if [ -f "$pid_file" ] && kill -0 $(cat "$pid_file") 2>/dev/null; then
      log_warn "Agent Lab $i already running (PID $(cat "$pid_file"))"
      continue
    fi

    $SUDO_CMD snmpd -C -c "$conf" -Lf "$log_file" -p "$pid_file" &
    sleep 0.5

    if [ -f "$pid_file" ] && kill -0 $(cat "$pid_file") 2>/dev/null; then
      log_success "Agent Lab $i started on $ip:$port (PID $(cat "$pid_file"))"
    else
      log_error "Failed to start Agent Lab $i"
      if [ "$USE_SUDO" = false ] && [ $port -le 1024 ]; then
        log_error "Port $port requires root privileges. Use --sudo or choose --port >1024"
      fi
    fi
  done
}

# Stop agents
stop_agents() {
  log_info "Stopping SNMP agents..."

  for i in 1 2 3; do
    local pid_file="$PID_DIR/snmpd-lab$i.pid"
    if [ -f "$pid_file" ]; then
      local pid=$(cat "$pid_file")
      if kill -0 "$pid" 2>/dev/null; then
        $SUDO_CMD kill "$pid"
        rm -f "$pid_file"
        log_success "Agent Lab $i stopped (PID $pid)"
      else
        log_warn "Agent Lab $i not running"
        rm -f "$pid_file"
      fi
    else
      log_warn "Agent Lab $i PID file not found"
    fi
  done
}

# Status check
status_agents() {
  log_info "Checking SNMP agent status..."

  for i in 1 2 3; do
    local port=$((BASE_PORT + i - 1))
    local ip="127.0.0.$((i+1))"
    local pid_file="$PID_DIR/snmpd-lab$i.pid"

    if [ -f "$pid_file" ] && kill -0 $(cat "$pid_file") 2>/dev/null; then
      echo -e "${GREEN}●${NC} Agent Lab $i: RUNNING (PID $(cat "$pid_file")), listening on $ip:$port"
      
      # Test SNMP walk
      if command -v snmpwalk &> /dev/null; then
        local sysName=$(snmpwalk -v2c -c public -Ov -Oq "$ip:$port" SNMPv2-MIB::sysName.0 2>/dev/null | tr -d '"')
        if [ -n "$sysName" ]; then
          echo "  ├─ sysName: $sysName"
        fi
      fi
    else
      echo -e "${RED}○${NC} Agent Lab $i: STOPPED"
    fi
  done
}

# Verify installation
verify() {
  log_info "Verifying SNMP agents..."

  for i in 1 2 3; do
    local port=$((BASE_PORT + i - 1))
    local ip="127.0.0.$((i+1))"
    if snmpwalk -v2c -c public -t 2 "$ip:$port" system &> /dev/null; then
      log_success "Agent Lab $i ($ip:$port) is responding"
    else
      log_error "Agent Lab $i ($ip:$port) is NOT responding"
    fi
  done
}

# Print usage
usage() {
  echo "Usage: $0 {start|stop|restart|status|verify} [options]"
  echo ""
  echo "Commands:"
  echo "  start   - Start 3 SNMP agents"
  echo "  stop    - Stop all demo SNMP agents"
  echo "  restart - Stop then start agents"
  echo "  status  - Check running status"
  echo "  verify  - Test SNMP connectivity"
  echo ""
  echo "Options:"
  echo "  --sudo         Run with sudo (allows binding to port 161)"
  echo "  --port=PORT    Base port for first agent (default: $DEFAULT_BASE_PORT)"
  echo "                 Agents will use PORT, PORT+1, PORT+2"
  echo "                 Without --sudo, PORT must be >1024"
  echo ""
  echo "Examples:"
  echo "  $0 start                    # Non-root, ports 1161-1163"
  echo "  $0 start --port=1161        # Explicit non-root ports"
  echo "  $0 start --sudo --port=161  # Root, standard SNMP port 161"
  echo "  $0 status --port=1161       # Check status with custom port"
  echo ""
}

# Main
COMMAND="${1:-}"
shift || true

case "$COMMAND" in
  start|stop|restart|status|verify)
    # Re-parse remaining args for options
    for arg in "$@"; do
      case $arg in
        --sudo)
          USE_SUDO=true
          ;;
        --port=*)
          BASE_PORT="${arg#*=}"
          ;;
        --port)
          BASE_PORT="$2"
          shift
          ;;
      esac
    done
    BASE_PORT="${BASE_PORT:-$DEFAULT_BASE_PORT}"
    
    if [ "$COMMAND" = "restart" ]; then
      stop_agents
      sleep 1
    fi
    
    if [ "$COMMAND" = "start" ] || [ "$COMMAND" = "restart" ]; then
      check_snmpd
      generate_configs
      start_agents
      echo ""
    fi
    
    if [ "$COMMAND" = "status" ] || [ "$COMMAND" = "verify" ] || [ "$COMMAND" = "start" ] || [ "$COMMAND" = "restart" ]; then
      status_agents
      echo ""
    fi
    
    if [ "$COMMAND" = "verify" ]; then
      verify
    fi
    
    if [ "$COMMAND" = "start" ] || [ "$COMMAND" = "restart" ]; then
      log_info "Test manually: snmpwalk -v2c -c public 127.0.0.2:$BASE_PORT system"
    fi
    ;;
  *)
    usage
    exit 1
    ;;
esac