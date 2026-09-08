#!/bin/bash

# HK-NOVA Database Backup Script
# Usage: ./db-backup.sh [backup-name]

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="$PROJECT_ROOT/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Source .env to get DATABASE_URL
if [ -f "$PROJECT_ROOT/.env" ]; then
    export $(grep -v '^#' "$PROJECT_ROOT/.env" | grep DATABASE_URL | xargs)
fi

# Extract database connection info from DATABASE_URL
# Format: mysql://user:password@host:port/database
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

# Determine environment from .env
ENVIRONMENT="unknown"
if grep -q "ENVIRONMENT_NAME=\"office\"" "$PROJECT_ROOT/.env" 2>/dev/null; then
    ENVIRONMENT="office"
elif grep -q "ENVIRONMENT_NAME=\"home\"" "$PROJECT_ROOT/.env" 2>/dev/null; then
    ENVIRONMENT="home"
fi

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Custom backup name or default
if [ -n "$1" ]; then
    BACKUP_NAME="$1"
else
    BACKUP_NAME="backup-${ENVIRONMENT}-${TIMESTAMP}"
fi

BACKUP_FILE="$BACKUP_DIR/${BACKUP_NAME}.sql"

echo -e "${BLUE}=== HK-NOVA Database Backup ===${NC}"
echo -e "Environment: ${YELLOW}$ENVIRONMENT${NC}"
echo -e "Database: ${YELLOW}$DB_NAME${NC}"
echo -e "Host: ${YELLOW}$DB_HOST:$DB_PORT${NC}"
echo -e "Backup file: ${YELLOW}$BACKUP_FILE${NC}"
echo ""

# Check if mysqldump is available
if ! command -v mysqldump &> /dev/null; then
    echo -e "${RED}Error: mysqldump not found${NC}"
    echo -e "Install with: sudo apt install mysql-client"
    exit 1
fi

# Perform backup
echo -e "${BLUE}Backing up database...${NC}"
MYSQL_PWD=$DB_PASS mysqldump \
    -h $DB_HOST \
    -P $DB_PORT \
    -u $DB_USER \
    --single-transaction \
    --routines \
    --triggers \
    --events \
    $DB_NAME > "$BACKUP_FILE"

# Compress backup
echo -e "${BLUE}Compressing backup...${NC}"
gzip "$BACKUP_FILE"
BACKUP_FILE="${BACKUP_FILE}.gz"

# Get file size
FILESIZE=$(du -h "$BACKUP_FILE" | cut -f1)

echo -e "${GREEN}✓ Backup completed successfully${NC}"
echo -e "File: ${GREEN}$BACKUP_FILE${NC}"
echo -e "Size: ${GREEN}$FILESIZE${NC}"
echo ""
echo -e "${YELLOW}To restore this backup, run:${NC}"
echo -e "  ./scripts/db-restore.sh ${BACKUP_NAME}.sql.gz"
