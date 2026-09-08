#!/bin/bash

# HK-NOVA Development Setup Script
# Usage: ./dev-setup.sh [office|home]

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

ENV_TYPE="${1:-office}"

echo -e "${BLUE}=== HK-NOVA Local Development Setup ===${NC}\n"
echo -e "Setting up environment: ${GREEN}$ENV_TYPE${NC}\n"

# 1. Check network
echo -e "${BLUE}[1/7] Checking network configuration...${NC}"
bash "$PROJECT_ROOT/scripts/check-network.sh"
echo ""

# 2. Switch environment
echo -e "${BLUE}[2/7] Setting up environment configuration...${NC}"
bash "$PROJECT_ROOT/switch-env.sh" "$ENV_TYPE"
echo ""

# 3. Update IP in env file automatically
CURRENT_IP=$(hostname -I | awk '{print $1}')
ENV_FILE="$PROJECT_ROOT/.env.$ENV_TYPE"
if [ -f "$ENV_FILE" ]; then
    echo -e "${BLUE}Updating NEXT_PUBLIC_APP_URL to http://$CURRENT_IP:3000...${NC}"
    sed -i "s|NEXT_PUBLIC_APP_URL=.*|NEXT_PUBLIC_APP_URL=\"http://$CURRENT_IP:3000\"|g" "$ENV_FILE"
fi

# 4. Start Docker containers
echo -e "${BLUE}[3/7] Starting Docker containers (MySQL & Redis)...${NC}"
docker-compose -f "$PROJECT_ROOT/docker-compose.dev.yml" up -d
echo -e "${GREEN}✓ Docker containers started${NC}"
echo ""

# 5. Wait for MySQL to be ready
echo -e "${BLUE}[4/7] Waiting for MySQL to be ready...${NC}"
echo "This may take up to 30 seconds..."
max_attempts=30
attempt=0
while [ $attempt -lt $max_attempts ]; do
    if docker exec hk-nova-mysql-dev mysqladmin ping -h localhost -u root -pdev_root_password --silent &> /dev/null; then
        echo -e "${GREEN}✓ MySQL is ready!${NC}"
        break
    fi
    attempt=$((attempt+1))
    echo -n "."
    sleep 1
done

if [ $attempt -eq $max_attempts ]; then
    echo -e "${RED}✗ MySQL failed to start in time${NC}"
    exit 1
fi
echo ""

# 6. Run migrations
echo -e "${BLUE}[5/7] Running database migrations...${NC}"
pnpm db:migrate
echo -e "${GREEN}✓ Database migrations completed${NC}"
echo ""

# 7. Seed base data
echo -e "${BLUE}[6/7] Seeding base database...${NC}"
pnpm db:seed
echo -e "${GREEN}✓ Base data seeded${NC}"
echo ""

# 8. Seed environment-specific devices
echo -e "${BLUE}[7/7] Seeding $ENV_TYPE devices...${NC}"
pnpm "seed:$ENV_TYPE"
echo -e "${GREEN}✓ $ENV_TYPE devices seeded${NC}"
echo ""

echo -e "${GREEN}=== Setup Completed Successfully! ===${NC}\n"
echo -e "Your local development environment is ready.\n"
echo -e "${BLUE}To start development server:${NC}"
echo -e "  pnpm dev"
echo ""
echo -e "${BLUE}To start workers:${NC}"
echo -e "  pnpm worker:icmp    # ICMP Poller"
echo -e "  pnpm worker:snmp    # SNMP Poller"
echo -e "  pnpm demo:generator # Demo Data Generator"
echo ""
echo -e "${BLUE}Or run all with helper script:${NC}"
echo -e "  ./scripts/dev-start.sh"
