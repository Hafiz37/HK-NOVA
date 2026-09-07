#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  HK-NOVA Production Credentials Generator                      ║"
echo "║  Phase 1.2: Generate & Rotate All Credentials                  ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
OUTPUT_FILE="$PROJECT_ROOT/.env.production.new"
BACKUP_FILE="$PROJECT_ROOT/.env.production.backup.$TIMESTAMP"

if [ -f "$PROJECT_ROOT/.env.production" ]; then
    echo "📦 Backing up current .env.production..."
    cp "$PROJECT_ROOT/.env.production" "$BACKUP_FILE"
    chmod 600 "$BACKUP_FILE"
    echo "   ✓ Backup saved to: $BACKUP_FILE"
    echo ""
fi

echo "🔑 Generating new cryptographic keys..."
echo ""

ENCRYPTION_KEY=$(openssl rand -hex 32)
AUDIT_HMAC_KEY=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -hex 64)
BACKUP_ENCRYPTION_KEY=$(openssl rand -hex 32)
OPERATOR_PASSWORD=$(openssl rand -base64 24 | tr -d '=/+' | head -c 24)
DB_PASSWORD=$(openssl rand -base64 24 | tr -d '=/+' | head -c 24)

echo "✓ ENCRYPTION_KEY (64 hex chars)"
echo "✓ AUDIT_HMAC_KEY (64 hex chars)"
echo "✓ JWT_SECRET (128 hex chars)"
echo "✓ BACKUP_ENCRYPTION_KEY (64 hex chars)"
echo "✓ OPERATOR_PASSWORD (24 alphanumeric)"
echo "✓ DB_PASSWORD (24 alphanumeric)"
echo ""

cat > "$OUTPUT_FILE" << EOF
# HK-NOVA Production Environment Configuration
# PRODUCTION SECRETS - KEEP SECURE!
# Generated: $(date +%Y-%m-%d)
# ⚠️ NEVER commit this file to git!

# ============================================================================
# DATABASE CONFIGURATION
# ============================================================================
DATABASE_URL="mysql://hk_nova:${DB_PASSWORD}@localhost:3306/hk_nova_prod?connection_limit=20&pool_timeout=20&connect_timeout=10&socket_timeout=10"

# ============================================================================
# SECURITY - ENCRYPTION KEYS
# ============================================================================
ENCRYPTION_KEY="${ENCRYPTION_KEY}"
AUDIT_HMAC_KEY="${AUDIT_HMAC_KEY}"
JWT_SECRET="${JWT_SECRET}"
BACKUP_ENCRYPTION_KEY="${BACKUP_ENCRYPTION_KEY}"

# ============================================================================
# AUTHENTICATION
# ============================================================================
OPERATOR_USERNAME="admin_hknova_prod"
OPERATOR_PASSWORD="${OPERATOR_PASSWORD}"

# ============================================================================
# APPLICATION CONFIGURATION
# ============================================================================
NODE_ENV="production"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
APP_MODE="production"

# ============================================================================
# REDIS CONFIGURATION
# ============================================================================
REDIS_URL="redis://localhost:6379"
REDIS_QUEUE_TTL_SECONDS="600"

# ============================================================================
# FEATURE FLAGS
# ============================================================================
DEMO_MODE_ENABLED="false"
ENABLE_OLT_EXECUTION="false"
ENABLE_ML_ANOMALY="true"

# ============================================================================
# NOTIFICATION CHANNELS
# ============================================================================
TELEGRAM_BOT_TOKEN=""
TELEGRAM_CHAT_ID=""

SMTP_HOST="smtp.gmail.com"
SMTP_PORT="465"
SMTP_SECURE="true"
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM="noc@yourdomain.com"
SMTP_RECIPIENTS=""

NOTIFY_WEBHOOK_URLS=""

SIEM_WEBHOOK_URLS=""
SIEM_WEBHOOK_TOKEN=""
SIEM_FORMAT="generic"

SMS_API_URL=""
SMS_API_KEY=""
SMS_ACCOUNT_SID=""
SMS_SENDER_ID=""
SMS_TO_NUMBERS=""

# ============================================================================
# RATE LIMITING
# ============================================================================
RATE_LIMIT_LOGIN_LIMIT="5"
RATE_LIMIT_TEST_LIMIT="10"
RATE_LIMIT_MUTATION_LIMIT="30"
RATE_LIMIT_USERS_LIMIT="15"
RATE_LIMIT_SETTINGS_LIMIT="15"
RATE_LIMIT_EXPORT_LIMIT="5"
RATE_LIMIT_READ_LIMIT="60"
RATE_LIMIT_READ_LOOPBACK_LIMIT="2000"
RATE_LIMIT_PROVISION_LIMIT="10"
RATE_LIMIT_PROVISION_LOOPBACK_LIMIT="2000"

# ============================================================================
# WORKER SCHEDULES
# ============================================================================
ICMP_POLL_INTERVAL="*/1 * * * *"
ICMP_BATCH_SIZE="20"
ICMP_CONCURRENCY_LIMIT="10"

SNMP_POLL_INTERVAL="*/5 * * * *"
SNMP_BATCH_SIZE="20"
SNMP_CONCURRENCY_LIMIT="10"

ANOMALY_CHECK_INTERVAL="*/10 * * * *"
ESCALATOR_INTERVAL="* * * * *"
DIGEST_INTERVAL="* * * * *"
RETRY_INTERVAL="*/2 * * * *"

RETENTION_BATCH_SIZE="1000"
RETENTION_CRON_SCHEDULE="0 3 * * *"
RETENTION_DRY_RUN="false"

SCHEDULED_PROVISIONING_CRON="* * * * *"

# ============================================================================
# BACKUP CONFIGURATION
# ============================================================================
BACKUP_CRON_SCHEDULE="0 2 * * *"
BACKUP_RUN_ON_STARTUP="true"
BACKUP_CONCURRENCY="4"
BACKUP_RETENTION_DAYS="365"
BACKUP_SOFT_DELETE_GRACE_DAYS="30"
BACKUP_CLEANUP_SCHEDULE="0 4 * * *"

BACKUP_STORAGE_TIERED="false"
BACKUP_HOT_DAYS="30"
BACKUP_FILESYSTEM_PATH="/var/backups/hk-nova"
BACKUP_ARCHIVE_SCHEDULE="0 3 * * *"
BACKUP_ARCHIVE_BATCH_SIZE="100"

BACKUP_MAX_PER_SUBNET="2"
BACKUP_SKIP_HIGH_LATENCY="true"
BACKUP_LATENCY_THRESHOLD_MS="500"
BACKUP_ALLOWED_HOURS="02:00-05:00"

BACKUP_NOTIFICATIONS_ENABLED="true"
BACKUP_DAILY_DIGEST_ENABLED="true"
BACKUP_DAILY_DIGEST_TIME="08:00"
BACKUP_CRITICAL_ALERTS_ENABLED="true"
BACKUP_STORAGE_ALERTS_ENABLED="true"
BACKUP_STORAGE_ALERT_THRESHOLD="80"
BACKUP_FAILED_ALERTS_ENABLED="true"
BACKUP_FAILED_ALERT_THRESHOLD="3"
BACKUP_WEBHOOK_URL=""
BACKUP_EMAIL_RECIPIENTS=""

# ============================================================================
# ML ANOMALY DETECTION
# ============================================================================
ANOMALY_TRAINING_DAYS="7"
ANOMALY_MIN_SAMPLES="50"
ANOMALY_SCORE_THRESHOLD_HIGH="0.7"
ANOMALY_SCORE_THRESHOLD_CRITICAL="0.85"
EOF

chmod 600 "$OUTPUT_FILE"

echo "✅ New credentials generated: $OUTPUT_FILE"
echo ""

cat > "$PROJECT_ROOT/PRODUCTION_CREDENTIALS_${TIMESTAMP}.txt" << EOF
═══════════════════════════════════════════════════════════════
 HK-NOVA PRODUCTION CREDENTIALS
 Generated: $(date)
═══════════════════════════════════════════════════════════════

⚠️  STORE THESE IN PASSWORD MANAGER IMMEDIATELY!
⚠️  DELETE THIS FILE AFTER STORING!

DATABASE
--------
Username: hk_nova
Password: ${DB_PASSWORD}
Database: hk_nova_prod

APPLICATION ADMIN
-----------------
Username: admin_hknova_prod
Password: ${OPERATOR_PASSWORD}

ENCRYPTION KEYS
---------------
ENCRYPTION_KEY:         ${ENCRYPTION_KEY}
AUDIT_HMAC_KEY:         ${AUDIT_HMAC_KEY}
JWT_SECRET:             ${JWT_SECRET}
BACKUP_ENCRYPTION_KEY:  ${BACKUP_ENCRYPTION_KEY}

═══════════════════════════════════════════════════════════════
NEXT STEPS:
═══════════════════════════════════════════════════════════════

1. Store credentials in password manager (Bitwarden/1Password)
2. Update MySQL password:
   mysql -u root -p
   ALTER USER 'hk_nova'@'localhost' IDENTIFIED BY '${DB_PASSWORD}';
   FLUSH PRIVILEGES;

3. Apply new .env.production:
   mv .env.production.new .env.production
   chmod 600 .env.production

4. Restart application:
   pnpm pm2:restart

5. Test login with new admin password

6. DELETE THIS FILE:
   shred -u PRODUCTION_CREDENTIALS_${TIMESTAMP}.txt

═══════════════════════════════════════════════════════════════
EOF

chmod 600 "$PROJECT_ROOT/PRODUCTION_CREDENTIALS_${TIMESTAMP}.txt"

echo "📄 Credentials document created: PRODUCTION_CREDENTIALS_${TIMESTAMP}.txt"
echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  ⚠️  CRITICAL: STORE CREDENTIALS IN PASSWORD MANAGER NOW!     ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo "  1. Open PRODUCTION_CREDENTIALS_${TIMESTAMP}.txt"
echo "  2. Store all credentials in password manager"
echo "  3. Follow instructions in the file"
echo "  4. Delete the credentials file when done"
echo ""
