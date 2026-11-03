#!/usr/bin/env bash
# HK-NOVA Management Script
# Usage: ./manage.sh [show-password|set-password|reset-password|status|logs]
set -euo pipefail

INSTALL_DIR="${VIBENET_DIR:-/opt/hk-nova}"
ENV_FILE="$INSTALL_DIR/.env"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fail()  { echo -e "${RED}[FAIL]${NC}  $*"; exit 1; }

show_help() {
    echo "HK-NOVA Management Script"
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  show-password     Show bootstrap credentials (not the current database password)"
    echo "  set-password      Legacy command; use the Profile page"
    echo "  reset-password    Legacy command; use the Profile page"
    echo "  status            Show service status"
    echo "  logs              Show service logs"
    echo "  help              Show this help"
    echo ""
}

show_password() {
    if [ ! -f "$ENV_FILE" ]; then
        fail ".env file not found at $ENV_FILE"
    fi
    
    USERNAME=$(grep "^AUTH_USERNAME=" "$ENV_FILE" | cut -d= -f2)
    PASSWORD=$(grep "^AUTH_PASSWORD=" "$ENV_FILE" | cut -d= -f2)
    
    echo ""
    echo -e "${GREEN}Bootstrap Credentials (may no longer match the database):${NC}"
    echo -e "  Username: ${GREEN}$USERNAME${NC}"
    echo -e "  Password: ${GREEN}$PASSWORD${NC}"
    echo ""
    warn "Keep this password secure!"
}

set_password() {
    fail "Accounts are stored in the database. Change your password at /profile; editing AUTH_PASSWORD cannot reset an existing account."
}

reset_password() {
    fail "Accounts are stored in the database. Change your password at /profile; editing AUTH_PASSWORD cannot reset an existing account."
}

show_status() {
    echo ""
    echo -e "${GREEN}HK-NOVA Status${NC}"
    echo ""
    
    if systemctl is-active --quiet hk-nova 2>/dev/null; then
        echo -e "  Service: ${GREEN}Running${NC}"
    else
        echo -e "  Service: ${RED}Stopped${NC}"
    fi
    
    if systemctl is-enabled --quiet hk-nova 2>/dev/null; then
        echo -e "  Autostart: ${GREEN}Enabled${NC}"
    else
        echo -e "  Autostart: ${YELLOW}Disabled${NC}"
    fi
    
    PORT=$(grep "^PORT=" "$ENV_FILE" 2>/dev/null | cut -d= -f2 || echo "5005")
    echo -e "  Port: ${BLUE}$PORT${NC}"
    
    IP=$(hostname -I | awk '{print $1}')
    echo -e "  Access: ${BLUE}http://$IP:$PORT${NC}"
    echo ""
}

show_logs() {
    echo ""
    info "Showing logs (Ctrl+C to exit)..."
    echo ""
    journalctl -u hk-nova -f
}

# Main
case "${1:-help}" in
    show-password)
        show_password
        ;;
    set-password)
        set_password
        ;;
    reset-password)
        reset_password
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        fail "Unknown command: $1. Use 'help' for usage."
        ;;
esac
