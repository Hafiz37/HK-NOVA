#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  HK-NOVA Security Permissions Fix                              ║"
echo "║  Phase 1.3: Apply Secure File Permissions                      ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

echo "🔒 Fixing sensitive file permissions..."
echo ""

fix_file() {
    local file=$1
    local perm=$2
    local description=$3
    
    if [ -f "$file" ]; then
        chmod "$perm" "$file"
        echo "✓ $description: chmod $perm"
    fi
}

fix_dir() {
    local dir=$1
    local perm=$2
    local description=$3
    
    if [ -d "$dir" ]; then
        chmod "$perm" "$dir"
        echo "✓ $description: chmod $perm"
    else
        mkdir -p "$dir"
        chmod "$perm" "$dir"
        echo "✓ $description: created with chmod $perm"
    fi
}

fix_file "$PROJECT_ROOT/.env.production" "600" ".env.production"
fix_file "$PROJECT_ROOT/.env" "600" ".env"
fix_file "$PROJECT_ROOT/.env.staging" "600" ".env.staging"

if ls "$PROJECT_ROOT"/.env.production.backup* 1> /dev/null 2>&1; then
    for backup in "$PROJECT_ROOT"/.env.production.backup*; do
        fix_file "$backup" "600" "$(basename $backup)"
    done
fi

if ls "$PROJECT_ROOT"/PRODUCTION_CREDENTIALS*.txt 1> /dev/null 2>&1; then
    for cred in "$PROJECT_ROOT"/PRODUCTION_CREDENTIALS*.txt; do
        fix_file "$cred" "600" "$(basename $cred)"
    done
fi

echo ""
echo "🔒 Fixing backup directory permissions..."
echo ""

BACKUP_DIR="/var/backups/hk-nova"
if [ -d "$BACKUP_DIR" ]; then
    sudo chmod 700 "$BACKUP_DIR" 2>/dev/null || chmod 700 "$BACKUP_DIR"
    echo "✓ Backup directory secured"
else
    echo "⚠️  Backup directory doesn't exist: $BACKUP_DIR"
    echo "   Create it with: sudo mkdir -p $BACKUP_DIR && sudo chmod 700 $BACKUP_DIR"
fi

echo ""
echo "🔒 Securing script files..."
echo ""

if [ -d "$PROJECT_ROOT/scripts/security" ]; then
    chmod 700 "$PROJECT_ROOT/scripts/security"
    chmod 700 "$PROJECT_ROOT/scripts/security"/*.sh 2>/dev/null || true
    echo "✓ Security scripts secured"
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "✅ Permissions fixed!"
echo ""
echo "Verify with:"
echo "  bash scripts/security/audit-permissions.sh"
echo "════════════════════════════════════════════════════════════════"
echo ""
