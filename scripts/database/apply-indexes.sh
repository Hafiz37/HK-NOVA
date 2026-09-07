#!/bin/bash
set -euo pipefail

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  HK-NOVA Database Index Migration                              ║"
echo "║  Phase 2.3: Add Performance Indexes                            ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$PROJECT_ROOT"

echo "📋 New indexes to be added:"
echo "────────────────────────────────────────────────────────────────"
echo "  Device table:"
echo "    - (status, isDemo) - Common filter combination"
echo "    - (type, status) - Device type + status queries"
echo ""
echo "  Backup table:"
echo "    - (deviceId, status, timestamp) - Backup reports by device"
echo "    - (status, timestamp) - Global backup status queries"
echo ""

echo "🔄 Generating migration..."
echo ""

# Create migration SQL manually since we can't run interactive migrate
MIGRATION_NAME="add_performance_indexes_phase2"
TIMESTAMP=$(date +%Y%m%d%H%M%S)
MIGRATION_DIR="prisma/migrations/${TIMESTAMP}_${MIGRATION_NAME}"

mkdir -p "$MIGRATION_DIR"

cat > "$MIGRATION_DIR/migration.sql" << 'EOF'
-- CreateIndex
CREATE INDEX `Device_status_isDemo_idx` ON `Device`(`status`, `isDemo`);

-- CreateIndex
CREATE INDEX `Device_type_status_idx` ON `Device`(`type`, `status`);

-- CreateIndex
CREATE INDEX `Backup_deviceId_status_timestamp_idx` ON `Backup`(`deviceId`, `status`, `timestamp`);

-- CreateIndex
CREATE INDEX `Backup_status_timestamp_idx` ON `Backup`(`status`, `timestamp`);
EOF

echo "✓ Migration file created: $MIGRATION_DIR/migration.sql"
echo ""

echo "📝 Migration SQL:"
echo "────────────────────────────────────────────────────────────────"
cat "$MIGRATION_DIR/migration.sql"
echo "────────────────────────────────────────────────────────────────"
echo ""

echo "⚠️  Ready to apply migration to database."
echo ""
read -p "Apply migration now? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Migration files created but not applied."
    echo "To apply later, run:"
    echo "  pnpm prisma migrate deploy"
    exit 0
fi

echo ""
echo "🔄 Applying migration to database..."

# Apply migration directly with SQL
mysql -u hk_nova -p hk_nova_prod < "$MIGRATION_DIR/migration.sql"

if [ $? -eq 0 ]; then
    echo "✅ Migration applied successfully!"
    echo ""
    echo "🔍 Verifying indexes..."
    echo ""
    
    mysql -u hk_nova -p hk_nova_prod <<'SQLEOF'
SELECT 
    TABLE_NAME,
    INDEX_NAME,
    GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS COLUMNS
FROM INFORMATION_SCHEMA.STATISTICS
WHERE TABLE_SCHEMA = 'hk_nova_prod'
    AND TABLE_NAME IN ('Device', 'Backup')
    AND INDEX_NAME LIKE '%_idx'
GROUP BY TABLE_NAME, INDEX_NAME
ORDER BY TABLE_NAME, INDEX_NAME;
SQLEOF

    echo ""
    echo "✅ Phase 2.3 complete!"
else
    echo "❌ Migration failed!"
    exit 1
fi
