#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  HK-NOVA Phase 1 Security Audit Summary                        ║"
echo "║  Complete Security Assessment                                  ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

ISSUES_FOUND=0
WARNINGS_FOUND=0

echo "📋 PHASE 1.1: Secrets Management Assessment"
echo "════════════════════════════════════════════════════════════════"
echo ""

if [ -f "$PROJECT_ROOT/.env.production" ]; then
    echo "✓ Production environment file exists"
    
    if grep -q "CHANGE_ME" "$PROJECT_ROOT/.env.production" 2>/dev/null; then
        echo "❌ CRITICAL: Placeholder credentials found in .env.production"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    else
        echo "✓ No placeholder credentials detected"
    fi
    
    if grep -q "admin123\|password123" "$PROJECT_ROOT/.env.production" 2>/dev/null; then
        echo "❌ CRITICAL: Weak passwords detected"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    else
        echo "✓ No obvious weak passwords"
    fi
else
    echo "❌ .env.production not found"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

echo ""
echo "📋 PHASE 1.2: Credentials Strength Check"
echo "════════════════════════════════════════════════════════════════"
echo ""

if [ -f "$PROJECT_ROOT/.env.production" ]; then
    ENCRYPTION_KEY_LEN=$(grep "^ENCRYPTION_KEY=" "$PROJECT_ROOT/.env.production" | cut -d'"' -f2 | wc -c)
    JWT_SECRET_LEN=$(grep "^JWT_SECRET=" "$PROJECT_ROOT/.env.production" | cut -d'"' -f2 | wc -c)
    
    if [ "$ENCRYPTION_KEY_LEN" -ge 64 ]; then
        echo "✓ ENCRYPTION_KEY has sufficient length ($ENCRYPTION_KEY_LEN chars)"
    else
        echo "❌ ENCRYPTION_KEY too short ($ENCRYPTION_KEY_LEN chars, need 64+)"
        ISSUES_FOUND=$((ISSUES_FOUND + 1))
    fi
    
    if [ "$JWT_SECRET_LEN" -ge 128 ]; then
        echo "✓ JWT_SECRET has sufficient length ($JWT_SECRET_LEN chars)"
    else
        echo "⚠️  JWT_SECRET could be longer ($JWT_SECRET_LEN chars, recommend 128+)"
        WARNINGS_FOUND=$((WARNINGS_FOUND + 1))
    fi
fi

echo ""
echo "📋 PHASE 1.3: File Permissions"
echo "════════════════════════════════════════════════════════════════"
echo ""

check_perm() {
    local file=$1
    local expected=$2
    if [ -f "$file" ]; then
        local actual=$(stat -c "%a" "$file" 2>/dev/null || stat -f "%Lp" "$file" 2>/dev/null)
        if [ "$actual" = "$expected" ] || [ "$actual" = "0$expected" ]; then
            echo "✓ $(basename $file): $actual"
        else
            echo "❌ $(basename $file): $actual (expected $expected)"
            ISSUES_FOUND=$((ISSUES_FOUND + 1))
        fi
    fi
}

check_perm "$PROJECT_ROOT/.env.production" "600"
check_perm "$PROJECT_ROOT/.env" "600"

echo ""
echo "📋 PHASE 1.4: Git Security"
echo "════════════════════════════════════════════════════════════════"
echo ""

cd "$PROJECT_ROOT"

if git ls-files | grep -E "\.env\.production$" > /dev/null 2>&1; then
    echo "❌ CRITICAL: .env.production is tracked in git!"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
else
    echo "✓ .env.production not tracked in git"
fi

if git status --porcelain 2>/dev/null | grep -E "\.env\.production$" > /dev/null 2>&1; then
    echo "⚠️  .env.production has uncommitted changes"
    WARNINGS_FOUND=$((WARNINGS_FOUND + 1))
else
    echo "✓ No uncommitted sensitive files"
fi

echo ""
echo "📋 PHASE 1: Code Audit (Hardcoded Secrets)"
echo "════════════════════════════════════════════════════════════════"
echo ""

HARDCODED_COUNT=$(grep -r "password.*=.*['\"][a-zA-Z0-9]" src/ 2>/dev/null | grep -v "process.env" | grep -v "CHANGE_ME" | grep -v "test" | wc -l || echo "0")

if [ "$HARDCODED_COUNT" -eq 0 ]; then
    echo "✓ No obvious hardcoded credentials in src/"
else
    echo "⚠️  Found $HARDCODED_COUNT potential hardcoded credentials"
    WARNINGS_FOUND=$((WARNINGS_FOUND + 1))
fi

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "                         SUMMARY"
echo "════════════════════════════════════════════════════════════════"
echo ""

if [ $ISSUES_FOUND -eq 0 ] && [ $WARNINGS_FOUND -eq 0 ]; then
    echo "✅ PHASE 1 COMPLETE: All security checks passed!"
    echo ""
    echo "Ready for PHASE 2: Database & Connection Pooling"
elif [ $ISSUES_FOUND -eq 0 ]; then
    echo "⚠️  PHASE 1 COMPLETE with $WARNINGS_FOUND warning(s)"
    echo ""
    echo "Review warnings before proceeding to PHASE 2"
else
    echo "❌ PHASE 1 INCOMPLETE: $ISSUES_FOUND critical issue(s), $WARNINGS_FOUND warning(s)"
    echo ""
    echo "Fix critical issues before proceeding to PHASE 2"
fi

echo ""
echo "Tools available:"
echo "  • Rotate credentials: bash scripts/security/rotate-credentials.sh"
echo "  • Fix permissions: bash scripts/security/fix-permissions.sh"
echo "  • Audit again: bash scripts/security/audit-permissions.sh"
echo ""
