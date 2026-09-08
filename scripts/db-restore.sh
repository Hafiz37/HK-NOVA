#!/bin/bash

# HK-NOVA Database Restore Script
# Usage: ./db-restore.sh <backup-file>

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="$PROJECT_ROOT/backups"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

if [ -z "$1" ]; then
    echo -e "${RED}Error: No backup file specified${NC}"
    echo ""
    echo "Usage: $0 <backup-file>"
    echo ""
    echo "Available backups:"
    if [ -d "$BACKUP_DIR" ] && [ "$(ls -A $BACKUP_DIR 2>/dev/null)" ]; then
        ls -lh "$BACKUP_DIR"/*.sql.gz 2>/dev/null | awk '{print "  " $9 " (" $5 ")"}'
    else
        echo "  (no backups found)"
    fi
    exit 1
fi

BACKUP_FILE="$1"

# If relative path, check in backup directory
if [ ! -f "$BACKUP_FILE" ]; then
    BACKUP_FILE="$BACKUP_DIR/$1"
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo -e "${RED}Error: Backup file not found: $1${NC}"
    exit 1
fi

# Source .env to get DATABASE_URL
if [ -f "$PROJECT_ROOT/.env" ]; then
    export $(grep -v '^#' "$PROJECT_ROOT/.env" | grep DATABASE_URL | xargs)
fi

if [ -z "$DATABASE_URL" ]; then
    echo -e "${RED}Error: DATABASE_URL not found in .env${NC}"
    exit 1
fi

# Parse DATABASE_URL
DB_USER=$(echo $DATABASE_URL | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
DB_PASS=$(echo $DATABASE_URL | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')
DB_HOST=$(echo $DATABASE_URL | sed -n 's/.*@\([^:]*\):.*/\1/p')
DB_PORT=$(echo $DATABASE_URL | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
DB_NAME=$(echo $DATABASE_URL | sed -n 's/.*\/\([^?]*\).*/\1/p')

echo -e "${BLUE}=== HK-NOVA Database Restore ===${NC}"
echo -e "Backup file: ${YELLOW}$BACKUP_FILE${NC}"
echo -e "Database: ${YELLOW}$DB_NAME${NC}"
echo -e "Host: ${YELLOW}$DB_HOST:$DB_PORT${NC}"
echo ""
echo -e "${RED}⚠️  WARNING: This will OVERWRITE the current database!${NC}"
read -p "Are you sure you want to continue? (yes/no): " -r
echo

if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    echo "Restore cancelled."
    exit 0
fi

# Check if mysql is available
if ! command -v mysql &> /dev/null; then
    echo -e "${RED}Error: mysql client not found${NC}"
    echo -e "Install with: sudo apt install mysql-client"
    exit 1
fi

echo -e "${BLUE}Restoring database...${NC}"

# Check if file is gzipped
if [[ "$BACKUP_FILE" == *.gz ]]; then
    echo "Decompressing and restoring..."
    gunzip -c "$BACKUP_FILE" | MYSQL_PWD=$DB_PASS mysql \
        -h $DB_HOST \
        -P $DB_PORT \
        -u $DB_USER \
        $DB_NAME
else
    MYSQL_PWD=$DB_PASS mysql \
        -h $DB_HOST \
        -P $DB_PORT \
        -u $DB_USER \
        $DB_NAME < "$BACKUP_FILE"
fi

echo -e "${GREEN}✓ Database restored successfully${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "  1. Run migrations if needed: pnpm db:migrate"
echo "  2. Restart services: pnpm pm2:restart"
