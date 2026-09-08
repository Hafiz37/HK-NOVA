#!/bin/bash

# HK-NOVA Network Checker
# Checks network configuration and connectivity

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}=== HK-NOVA Network Check ===${NC}\n"

# 1. Check current IP
echo -e "${BLUE}1. Network Interface Information:${NC}"
CURRENT_IP=$(hostname -I | awk '{print $1}')
echo -e "   Primary IP: ${GREEN}$CURRENT_IP${NC}"

# Extract network
NETWORK=$(echo $CURRENT_IP | cut -d. -f1-3)
echo -e "   Network: ${YELLOW}$NETWORK.0/24${NC}"

# 2. Check gateway
echo -e "\n${BLUE}2. Gateway Check:${NC}"
GATEWAY=$(ip route | grep default | awk '{print $3}' | head -n1)
if [ -n "$GATEWAY" ]; then
    echo -e "   Gateway: ${GREEN}$GATEWAY${NC}"
    if ping -c 1 -W 2 $GATEWAY &> /dev/null; then
        echo -e "   Status: ${GREEN}✓ Reachable${NC}"
    else
        echo -e "   Status: ${RED}✗ Unreachable${NC}"
    fi
else
    echo -e "   ${YELLOW}No default gateway found${NC}"
fi

# 3. Check DNS
echo -e "\n${BLUE}3. DNS Check:${NC}"
if ping -c 1 -W 2 8.8.8.8 &> /dev/null; then
    echo -e "   Google DNS (8.8.8.8): ${GREEN}✓ Reachable${NC}"
else
    echo -e "   Google DNS (8.8.8.8): ${RED}✗ Unreachable${NC}"
fi

# 4. Check required ports
echo -e "\n${BLUE}4. Port Availability Check:${NC}"

check_port() {
    local port=$1
    local name=$2
    
    if command -v netstat &> /dev/null; then
        if netstat -tuln | grep -q ":$port "; then
            echo -e "   Port $port ($name): ${YELLOW}⚠ In use${NC}"
            return 1
        else
            echo -e "   Port $port ($name): ${GREEN}✓ Available${NC}"
            return 0
        fi
    elif command -v ss &> /dev/null; then
        if ss -tuln | grep -q ":$port "; then
            echo -e "   Port $port ($name): ${YELLOW}⚠ In use${NC}"
            return 1
        else
            echo -e "   Port $port ($name): ${GREEN}✓ Available${NC}"
            return 0
        fi
    else
        echo -e "   ${YELLOW}Cannot check port (netstat/ss not found)${NC}"
        return 2
    fi
}

check_port 3000 "Web Server"
check_port 3307 "MySQL Docker"
check_port 6380 "Redis Docker"

# 5. Check Docker
echo -e "\n${BLUE}5. Docker Check:${NC}"
if command -v docker &> /dev/null; then
    echo -e "   Docker: ${GREEN}✓ Installed${NC}"
    
    if docker ps &> /dev/null; then
        echo -e "   Docker Service: ${GREEN}✓ Running${NC}"
        
        # Check HK-NOVA containers
        if docker ps --format "{{.Names}}" | grep -q "hk-nova"; then
            echo -e "   HK-NOVA Containers:"
            docker ps --filter "name=hk-nova" --format "      - {{.Names}}: ${GREEN}{{.Status}}${NC}"
        else
            echo -e "   HK-NOVA Containers: ${YELLOW}None running${NC}"
        fi
    else
        echo -e "   Docker Service: ${RED}✗ Not running or no permission${NC}"
        echo -e "   ${YELLOW}Hint: sudo systemctl start docker${NC}"
    fi
else
    echo -e "   Docker: ${RED}✗ Not installed${NC}"
fi

# 6. Check Docker Compose
echo -e "\n${BLUE}6. Docker Compose Check:${NC}"
if command -v docker-compose &> /dev/null; then
    VERSION=$(docker-compose --version 2>/dev/null || echo "unknown")
    echo -e "   Docker Compose: ${GREEN}✓ $VERSION${NC}"
elif docker compose version &> /dev/null; then
    VERSION=$(docker compose version 2>/dev/null || echo "unknown")
    echo -e "   Docker Compose: ${GREEN}✓ $VERSION (plugin)${NC}"
else
    echo -e "   Docker Compose: ${RED}✗ Not installed${NC}"
fi

# 7. Check Node.js and pnpm
echo -e "\n${BLUE}7. Development Tools:${NC}"
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo -e "   Node.js: ${GREEN}✓ $NODE_VERSION${NC}"
else
    echo -e "   Node.js: ${RED}✗ Not installed${NC}"
fi

if command -v pnpm &> /dev/null; then
    PNPM_VERSION=$(pnpm --version)
    echo -e "   pnpm: ${GREEN}✓ $PNPM_VERSION${NC}"
else
    echo -e "   pnpm: ${RED}✗ Not installed${NC}"
fi

# 8. Summary
echo -e "\n${BLUE}=== Summary ===${NC}"
echo -e "Your laptop is ready for HK-NOVA development!"
echo -e "\n${YELLOW}Suggested NEXT_PUBLIC_APP_URL for .env:${NC}"
echo -e "   ${GREEN}http://$CURRENT_IP:3000${NC}"
echo -e "\n${YELLOW}Suggested network range for testing:${NC}"
echo -e "   ${GREEN}$NETWORK.0/24${NC}"
