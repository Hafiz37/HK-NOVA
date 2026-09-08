#!/bin/bash

# HK-NOVA Start Development Services
# Starts web server and optionally background workers

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}=== Starting HK-NOVA Development Services ===${NC}\n"

# 1. Check if Docker is running
echo -e "${BLUE}Checking Docker containers...${NC}"
if ! docker ps --format "{{.Names}}" | grep -q "hk-nova-mysql-dev"; then
    echo -e "${YELLOW}Docker containers are not running. Starting them...${NC}"
    docker-compose -f "$PROJECT_ROOT/docker-compose.dev.yml" up -d
    sleep 3
else
    echo -e "${GREEN}✓ Docker containers are running${NC}"
fi

# 2. Check current environment
echo -e "\n${BLUE}Current Environment Status:${NC}"
bash "$PROJECT_ROOT/switch-env.sh" status

echo ""
echo -e "${YELLOW}How would you like to start the services?${NC}"
echo "  1) Web server only (pnpm dev)"
echo "  2) Web server + ICMP worker (concurrently)"
echo "  3) Web server + ICMP + SNMP + Demo generator"
echo "  4) PM2 (All background workers managed by PM2)"
echo ""
read -p "Select option [1-4] (default: 1): " -r OPTION
OPTION=${OPTION:-1}

case $OPTION in
    1)
        echo -e "\n${BLUE}Starting Next.js Web Server...${NC}"
        pnpm dev
        ;;
    2)
        echo -e "\n${BLUE}Starting Web Server + ICMP Worker...${NC}"
        pnpm concurrently -n "WEB,ICMP" -c "cyan,blue" "pnpm dev" "pnpm worker:icmp"
        ;;
    3)
        echo -e "\n${BLUE}Starting Web Server + Workers + Demo Generator...${NC}"
        pnpm concurrently -n "WEB,ICMP,SNMP,DEMO" -c "cyan,blue,magenta,yellow" \
            "pnpm dev" \
            "pnpm worker:icmp" \
            "pnpm worker:snmp" \
            "pnpm demo:generator"
        ;;
    4)
        echo -e "\n${BLUE}Starting PM2 with all services...${NC}"
        pnpm pm2:start
        pnpm pm2:status
        echo -e "\n${GREEN}✓ All services started with PM2${NC}"
        echo -e "  View logs: pnpm pm2:logs"
        echo -e "  Stop all:  pnpm pm2:stop"
        echo -e "  Starting dev web server now..."
        pnpm dev
        ;;
    *)
        echo -e "${RED}Invalid option${NC}"
        exit 1
        ;;
esac
