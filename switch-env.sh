#!/bin/bash

# HK-NOVA Environment Switcher
# Usage: ./switch-env.sh [office|home|status]

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$PROJECT_ROOT/.env"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

show_status() {
    echo -e "${BLUE}=== Environment Status ===${NC}"
    
    if [ -L "$ENV_FILE" ]; then
        TARGET=$(readlink "$ENV_FILE")
        echo -e "Status: ${GREEN}Symlink active${NC}"
        echo -e "Target: ${YELLOW}$TARGET${NC}"
        
        if grep -q "ENVIRONMENT_NAME=\"office\"" "$ENV_FILE" 2>/dev/null; then
            echo -e "Current Environment: ${GREEN}OFFICE${NC}"
        elif grep -q "ENVIRONMENT_NAME=\"home\"" "$ENV_FILE" 2>/dev/null; then
            echo -e "Current Environment: ${GREEN}HOME${NC}"
        else
            echo -e "Current Environment: ${YELLOW}Unknown${NC}"
        fi
    elif [ -f "$ENV_FILE" ]; then
        echo -e "Status: ${YELLOW}Regular file (not symlink)${NC}"
        
        if grep -q "ENVIRONMENT_NAME=\"office\"" "$ENV_FILE" 2>/dev/null; then
            echo -e "Environment: ${GREEN}OFFICE${NC}"
        elif grep -q "ENVIRONMENT_NAME=\"home\"" "$ENV_FILE" 2>/dev/null; then
            echo -e "Environment: ${GREEN}HOME${NC}"
        else
            echo -e "Environment: ${YELLOW}Unknown${NC}"
        fi
    else
        echo -e "Status: ${RED}No .env file found${NC}"
    fi
    
    # Show current IP
    CURRENT_IP=$(hostname -I | awk '{print $1}')
    echo -e "Current IP: ${BLUE}$CURRENT_IP${NC}"
    
    # Show Docker status
    if command -v docker &>/dev/null && docker ps --format "{{.Names}}" 2>/dev/null | grep -q "hk-nova"; then
        echo -e "Docker: ${GREEN}Running${NC}"
        docker ps --filter "name=hk-nova" --format "  - {{.Names}}: {{.Status}}"
    else
        echo -e "Docker: ${YELLOW}Not running or docker command not available${NC}"
    fi
}

switch_to() {
    local env=$1
    local source_file="$PROJECT_ROOT/.env.$env"
    
    if [ ! -f "$source_file" ]; then
        echo -e "${RED}Error: $source_file not found${NC}"
        exit 1
    fi
    
    echo -e "${BLUE}=== Switching to $env environment ===${NC}"
    
    # Backup current .env if it exists and is not a symlink
    if [ -f "$ENV_FILE" ] && [ ! -L "$ENV_FILE" ]; then
        BACKUP="$PROJECT_ROOT/.env.backup.$(date +%Y%m%d_%H%M%S)"
        echo -e "${YELLOW}Backing up current .env to $BACKUP${NC}"
        cp "$ENV_FILE" "$BACKUP"
    fi
    
    # Remove existing .env
    rm -f "$ENV_FILE"
    
    # Create symlink
    ln -s ".env.$env" "$ENV_FILE"
    
    echo -e "${GREEN}✓ Switched to $env environment${NC}"
    echo ""
    
    # Update IP in the env file
    CURRENT_IP=$(hostname -I | awk '{print $1}')
    echo -e "${BLUE}Current IP detected: $CURRENT_IP${NC}"
    echo -e "${YELLOW}Note: Update NEXT_PUBLIC_APP_URL in .env.$env if needed${NC}"
    
    show_status
    
    echo ""
    echo -e "${BLUE}Next steps:${NC}"
    echo "  1. pnpm docker:dev     # Start Docker containers"
    echo "  2. pnpm db:migrate     # Run database migrations"
    echo "  3. pnpm db:seed        # Seed base data"
    echo "  4. pnpm seed:$env      # Seed $env devices"
    echo "  5. pnpm dev            # Start web server"
}

case "$1" in
    office)
        switch_to "office"
        ;;
    home)
        switch_to "home"
        ;;
    status)
        show_status
        ;;
    *)
        echo -e "${BLUE}HK-NOVA Environment Switcher${NC}"
        echo ""
        echo "Usage: $0 [office|home|status]"
        echo ""
        echo "Commands:"
        echo "  office  - Switch to office environment"
        echo "  home    - Switch to home environment"
        echo "  status  - Show current environment status"
        echo ""
        show_status
        ;;
esac
