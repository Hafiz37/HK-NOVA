#!/usr/bin/env bash
# ==============================================================================
# setup-mysql-replication.sh — MySQL Master-Slave Replication Setup for HA
# ==============================================================================
# Run on MASTER server first, then on SLAVE server
# Usage: sudo bash scripts/setup-mysql-replication.sh master|slave

set -euo pipefail

ROLE="${1:-}"

if [[ "${ROLE}" != "master" && "${ROLE}" != "slave" ]]; then
  echo "Usage: $0 master|slave"
  exit 1
fi

MYSQL_ROOT_PASS="${MYSQL_ROOT_PASS:-}"
REPL_USER="${REPL_USER:-repl_user}"
REPL_PASS="${REPL_PASS:-ReplPass2024!Secure}"
DB_NAME="${DB_NAME:-hk_nova_prod}"

if [[ -z "${MYSQL_ROOT_PASS}" ]]; then
  echo "ERROR: MYSQL_ROOT_PASS environment variable required" >&2
  exit 1
fi

MASTER_IP="${MASTER_IP:-}"  # Required for slave
SLAVE_IP="${SLAVE_IP:-}"    # Optional, for master firewall

echo "================================================================"
echo "  MySQL ${ROLE^} Replication Setup"
echo "  Database: ${DB_NAME}"
echo "  Repl User: ${REPL_USER}"
echo "================================================================"

if [[ "${ROLE}" == "master" ]]; then
  # ---- MASTER SETUP ----
  echo "[1/5] Configuring Master MySQL..."

  # Update mysqld.cnf for replication
  cat > /etc/mysql/mysql.conf.d/mysqld-replication.cnf <<EOF
[mysqld]
# Replication Settings
server-id = 1
log_bin = /var/log/mysql/mysql-bin.log
binlog_format = ROW
expire_logs_days = 7
max_binlog_size = 100M

# Sync settings for durability
sync_binlog = 1
innodb_flush_log_at_trx_commit = 1

# Replicate only hk_nova_prod database
binlog_do_db = ${DB_NAME}
EOF

  echo "[2/5] Restarting MySQL..."
  systemctl restart mysql

  echo "[3/5] Creating replication user..."
  mysql -u root -p"${MYSQL_ROOT_PASS}" <<EOF
CREATE USER IF NOT EXISTS '${REPL_USER}'@'%' IDENTIFIED BY '${REPL_PASS}';
GRANT REPLICATION SLAVE ON *.* TO '${REPL_USER}'@'%';
FLUSH PRIVILEGES;
EOF

  echo "[4/5] Getting master status..."
  MASTER_STATUS=$(mysql -u root -p"${MYSQL_ROOT_PASS}" -e "SHOW MASTER STATUS\G")
  echo "${MASTER_STATUS}"

  FILE=$(echo "${MASTER_STATUS}" | grep 'File:' | awk '{print $2}')
  POS=$(echo "${MASTER_STATUS}" | grep 'Position:' | awk '{print $2}')

  echo ""
  echo "================================================================"
  echo "  ✅ MASTER SETUP COMPLETE"
  echo "  MASTER_LOG_FILE: ${FILE}"
  echo "  MASTER_LOG_POS:  ${POS}"
  echo ""
  echo "  RUN ON SLAVE:"
  echo "  MASTER_IP=<this_server_ip> \\"
  echo "  MASTER_LOG_FILE=${FILE} \\"
  echo "  MASTER_LOG_POS=${POS} \\"
  echo "  sudo -E bash scripts/setup-mysql-replication.sh slave"
  echo "================================================================"

else
  # ---- SLAVE SETUP ----
  if [[ -z "${MASTER_IP}" ]]; then
    echo "ERROR: MASTER_IP environment variable required for slave setup" >&2
    exit 1
  fi

  MASTER_LOG_FILE="${MASTER_LOG_FILE:-}"
  MASTER_LOG_POS="${MASTER_LOG_POS:-}"

  if [[ -z "${MASTER_LOG_FILE}" || -z "${MASTER_LOG_POS}" ]]; then
    echo "ERROR: MASTER_LOG_FILE and MASTER_LOG_POS required for slave setup" >&2
    exit 1
  fi

  echo "[1/5] Configuring Slave MySQL..."

  # Generate unique server-id for slave (based on IP last octet)
  SERVER_ID=$(echo "${SLAVE_IP:-$(hostname -I | awk '{print $1}')}" | awk -F. '{print $4 + 10}')

  cat > /etc/mysql/mysql.conf.d/mysqld-replication.cnf <<EOF
[mysqld]
# Replication Settings
server-id = ${SERVER_ID}
log_bin = /var/log/mysql/mysql-bin.log
binlog_format = ROW
expire_logs_days = 7
max_binlog_size = 100M
relay_log = /var/log/mysql/mysql-relay-bin.log
relay_log_recovery = ON

# Read-only for safety (prevent accidental writes on slave)
read_only = ON
super_read_only = ON

# Replicate only hk_nova_prod database
replicate_do_db = ${DB_NAME}
EOF

  echo "[2/5] Restarting MySQL..."
  systemctl restart mysql

  echo "[3/5] Configuring replication connection..."
  mysql -u root -p"${MYSQL_ROOT_PASS}" <<EOF
STOP SLAVE;
CHANGE MASTER TO
  MASTER_HOST='${MASTER_IP}',
  MASTER_USER='${REPL_USER}',
  MASTER_PASSWORD='${REPL_PASS}',
  MASTER_LOG_FILE='${MASTER_LOG_FILE}',
  MASTER_LOG_POS=${MASTER_LOG_POS},
  MASTER_AUTO_POSITION=0,
  GET_MASTER_PUBLIC_KEY=1;
START SLAVE;
EOF

  echo "[4/5] Verifying replication status..."
  sleep 3
  mysql -u root -p"${MYSQL_ROOT_PASS}" -e "SHOW SLAVE STATUS\G"

  echo ""
  echo "================================================================"
  echo "  ✅ SLAVE SETUP COMPLETE"
  echo "  Verify: Slave_IO_Running=Yes AND Slave_SQL_Running=Yes"
  echo "================================================================"
fi