#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  HK-NOVA Security Permissions Audit                            ║"
echo "║  Phase 1.3: Verify & Fix File Permissions                      ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

ISSUES_FOUND=0

check_file() {
    local file=$1
    local expected_perm=$2
    local description=$3
    
    if [ -f "$file" ]; then
        local current_perm=$(stat -c "%a" "$file" 2>/dev/null || stat -f "%p" "$file" 2>/dev/null | tail -c 4)
        if [ "$current_perm" != "$expected_perm" ]; then
            echo "❌ $description"
            echo "   File: $file"
            echo "   Current: $current_perm | Expected: $expected_perm"
            ISSUES_FOUND=$((ISSUES_FOUND + 1))
        else
            echo "✓ $description"
        fi
    else
        echo "⚠️  $description - File not found"
    fi
}

check_dir() {
    local dir=$1
    local expected_perm=$2
    local description=$3
    
    if [ -d "$dir" ]; then
        local current_perm=$(stat -c "%a" "$dir" 2>/dev/null || stat -f "%p" "$dir" 2>/dev/null | tail -c 4)
        if [ "$current_perm" != "$expected_perm" ]; then
            echo "❌ $description"
            echo "   Dir: $dir"
            echo "   Current: $current_perm | Expected: $expected_perm"
            ISSUES_FOUND=$((ISSUES_FOUND + 1))
        else
            echo "✓ $description"
        fi
    else
        echo "⚠️  $description - Directory not found"
    fi
}

echo "🔍 Checking sensitive files..."
echo ""

check_file "$PROJECT_ROOT/.env.production" "0600" "Production environment file"
check_file "$PROJECT_ROOT/.env" "0600" "Environment file"
check_file "$PROJECT_ROOT/.env.staging" "0600" "Staging environment file"

echo ""
echo "🔍 Checking backup files..."
echo ""

if ls "$PROJECT_ROOT"/.env.production.backup* 1> /dev/null 2>&1; then
    for backup in "$PROJECT_ROOT"/.env.production.backup*; do
        check_file "$backup" "0600" "Backup: $(basename $backup)"
    done
fi

echo ""
echo "🔍 Checking credentials files..."
echo ""

if ls "$PROJECT_ROOT"/PRODUCTION_CREDENTIALS*.txt 1> /dev/null 2>&1; then
    echo "⚠️  WARNING: Production credentials files found!"
    ls -lh "$PROJECT_ROOT"/PRODUCTION_CREDENTIALS*.txt
    echo "   These should be deleted after storing in password manager!"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

echo ""
echo "🔍 Checking backup directories..."
echo ""

BACKUP_DIR="/var/backups/hk-nova"
if [ -d "$BACKUP_DIR" ]; then
    check_dir "$BACKUP_DIR" "0700" "Backup storage directory"
else
    echo "⚠️  Backup directory not found: $BACKUP_DIR"
fi

echo ""
echo "🔍 Checking for secrets in git..."
echo ""

cd "$PROJECT_ROOT"

if git rev-parse --git-dir > /dev/null 2>&1; then
    if git ls-files | grep -E "\.env\.production$|PRODUCTION_CREDENTIALS" > /dev/null 2>&1; then
        echo "❌ CRITICAL: Sensitive files are tracked in git!"
        git ls-files | grep -E "\.env\.production$|PRODUCTION_CREDENTIALS"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    else
        echo "✓ No sensitive files tracked in git"
    fi
    
    if git status --porcelain | grep -E "\.env\.production$|PRODUCTION_CREDENTIALS" > /dev/null 2>&1; then
        echo "⚠️  WARNING: Sensitive files are staged but not committed"
        git status --porcelain | grep -E "\.env\.production$|PRODUCTION_CREDENTIALS"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    else
        echo "✓ No sensitive files staged"
    fi
fi

echo ""
echo "════════════════════════════════════════════════════════════════"

if [ $ISSUES_FOUND -eq 0 ]; then
    echo "✅ All security checks passed!"
else
    echo "⚠️  Found $ISSUES_FOUND security issue(s)"
    echo ""
    echo "Run fix script to resolve:"
    echo "  bash scripts/security/fix-permissions.sh"
fi

echo "════════════════════════════════════════════════════════════════"
echo ""
