#!/bin/bash

# HK-NOVA Stop Development Services

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}=== Stopping HK-NOVA Development Services ===${NC}\n"

# 1. Stop PM2 processes if running
if command -v pm2 &> /dev/null; then
    if pm2 list | grep -q "hk-nova"; then
        echo -e "${BLUE}Stopping PM2 processes...${NC}"
        pnpm pm2:stop || true
        echo -e "${GREEN}✓ PM2 processes stopped${NC}"
    fi
fi

# 2. Stop Docker containers
echo -e "${BLUE}Stopping Docker containers...${NC}"
docker-compose -f "$PROJECT_ROOT/docker-compose.dev.yml" down
echo -e "${GREEN}✓ Docker containers stopped${NC}"

echo -e "\n${GREEN}✓ All development services stopped successfully${NC}"
