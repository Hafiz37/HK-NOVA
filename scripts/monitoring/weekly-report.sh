#!/usr/bin/env bash

# HK-NOVA Weekly Performance & Health Report
REPORT_DATE=$(date +%Y-%m-%d)
REPORT_FILE="/home/gopal-ichiro/Documents/magang/hk-nova/logs/weekly-report-${REPORT_DATE}.log"

echo "==================================================" > "$REPORT_FILE"
echo "  HK-NOVA WEEKLY PERFORMANCE REPORT (${REPORT_DATE})" >> "$REPORT_FILE"
echo "==================================================" >> "$REPORT_FILE"
echo "" >> "$REPORT_FILE"

# 1. Device Summary
echo "--- DEVICE SUMMARY ---" >> "$REPORT_FILE"
mysql -u hk_nova -p'HkNova2026!DbPass' hk_nova_prod -e "
SELECT type, COUNT(*) as total_devices FROM Device GROUP BY type;
SELECT status, COUNT(*) as status_count FROM Device GROUP BY status;
" >> "$REPORT_FILE" 2>&1
echo "" >> "$REPORT_FILE"

# 2. Metric Volume
echo "--- METRICS IN LAST 7 DAYS ---" >> "$REPORT_FILE"
mysql -u hk_nova -p'HkNova2026!DbPass' hk_nova_prod -e "
SELECT 
  metricType,
  COUNT(*) as total_samples,
  MAX(timestamp) as latest_sample
FROM Metric
WHERE timestamp >= DATE_SUB(NOW(), INTERVAL 7 DAY)
GROUP BY metricType;
" >> "$REPORT_FILE" 2>&1
echo "" >> "$REPORT_FILE"

# 3. Alert Summary
echo "--- ALERTS SUMMARY (LAST 7 DAYS) ---" >> "$REPORT_FILE"
mysql -u hk_nova -p'HkNova2026!DbPass' hk_nova_prod -e "
SELECT 
  severity, status, COUNT(*) as alert_count
FROM Alert
WHERE createdAt >= DATE_SUB(NOW(), INTERVAL 7 DAY)
GROUP BY severity, status;
" >> "$REPORT_FILE" 2>&1
echo "" >> "$REPORT_FILE"

# 4. System Storage & Backups
echo "--- BACKUP STATUS ---" >> "$REPORT_FILE"
mysql -u hk_nova -p'HkNova2026!DbPass' hk_nova_prod -e "
SELECT status, COUNT(*) as backup_count, SUM(sizeBytes)/1024/1024 as total_mb FROM Backup GROUP BY status;
" >> "$REPORT_FILE" 2>&1
echo "" >> "$REPORT_FILE"

echo "Report generated at $(date) -> $REPORT_FILE"
