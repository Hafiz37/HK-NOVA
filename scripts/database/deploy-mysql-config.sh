#!/bin/bash
set -euo pipefail

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  HK-NOVA MySQL Configuration Deployment                        ║"
echo "║  Phase 2.2: Apply Production Database Tuning                   ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/hk-nova-production.cnf"
TARGET_FILE="/etc/mysql/mysql.conf.d/hk-nova-production.cnf"

if [ ! -f "$CONFIG_FILE" ]; then
    echo "❌ Configuration file not found: $CONFIG_FILE"
    exit 1
fi

echo "📋 Configuration Summary:"
echo "────────────────────────────────────────────────────────────────"
grep -E "^[a-z_]+ =" "$CONFIG_FILE" | head -15
echo "   ... (see full file for all settings)"
echo ""

echo "⚠️  This script will:"
echo "   1. Copy MySQL configuration to: $TARGET_FILE"
echo "   2. Restart MySQL service"
echo "   3. Verify new settings"
echo ""
echo "💡 IMPORTANT: Adjust innodb_buffer_pool_size based on your RAM:"
echo "   - 8GB RAM:  innodb_buffer_pool_size = 4G"
echo "   - 16GB RAM: innodb_buffer_pool_size = 8G"
echo "   - 32GB RAM: innodb_buffer_pool_size = 16G"
echo ""

read -p "Continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Aborted."
    exit 0
fi

echo ""
echo "📦 Installing configuration..."

sudo cp "$CONFIG_FILE" "$TARGET_FILE"
sudo chmod 644 "$TARGET_FILE"
sudo chown root:root "$TARGET_FILE"

echo "✓ Configuration installed"
echo ""

echo "🔄 Restarting MySQL..."
sudo systemctl restart mysql

echo "⏳ Waiting for MySQL to start..."
sleep 3

if sudo systemctl is-active --quiet mysql; then
    echo "✓ MySQL restarted successfully"
else
    echo "❌ MySQL failed to restart!"
    echo "Check logs: sudo journalctl -u mysql -n 50"
    exit 1
fi

echo ""
echo "🔍 Verifying configuration..."
echo ""

mysql -u root -p <<'EOF'
SELECT 'Connection Settings' as Category, '' as Setting, '' as Value
UNION ALL
SELECT '', 'max_connections', @@max_connections
UNION ALL
SELECT '', 'max_connect_errors', @@max_connect_errors
UNION ALL
SELECT '', 'wait_timeout', @@wait_timeout
UNION ALL
SELECT '', '', ''
UNION ALL
SELECT 'InnoDB Buffer Pool', '', ''
UNION ALL
SELECT '', 'innodb_buffer_pool_size (MB)', ROUND(@@innodb_buffer_pool_size / 1024 / 1024, 0)
UNION ALL
SELECT '', 'innodb_buffer_pool_instances', @@innodb_buffer_pool_instances
UNION ALL
SELECT '', '', ''
UNION ALL
SELECT 'Temporary Tables', '', ''
UNION ALL
SELECT '', 'tmp_table_size (MB)', ROUND(@@tmp_table_size / 1024 / 1024, 0)
UNION ALL
SELECT '', 'max_heap_table_size (MB)', ROUND(@@max_heap_table_size / 1024 / 1024, 0)
UNION ALL
SELECT '', '', ''
UNION ALL
SELECT 'Thread Cache', '', ''
UNION ALL
SELECT '', 'thread_cache_size', @@thread_cache_size;
EOF

echo ""
echo "════════════════════════════════════════════════════════════════"
echo "✅ MySQL configuration applied!"
echo ""
echo "Verify with:"
echo "  mysql -u root -p -e \"SHOW VARIABLES LIKE 'max_connections';\""
echo "  mysql -u root -p -e \"SHOW VARIABLES LIKE 'innodb_buffer%';\""
echo ""
echo "Monitor connections:"
echo "  mysql -u root -p -e \"SHOW STATUS LIKE 'Threads_%';\""
echo "════════════════════════════════════════════════════════════════"
