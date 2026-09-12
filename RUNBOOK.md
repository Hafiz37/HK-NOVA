# HK-NOVA Operational Runbook 📖

Dokumen ini berisi panduan operasional harian, pemeliharaan, serta penanganan insiden untuk sistem **HK-NOVA Network Monitoring & Automation**.

---

## 1. Quick Operations Checklist ⏱️

### Prosedur Check Health Harian (08:00 & 16:00 WIB)
```bash
# 1. Cek status PM2 workers (Harus status 'online')
pm2 status

# 2. Cek penggunaan resource (CPU/RAM/Disk)
free -h
df -h /home/gopal-ichiro/backups

# 3. Cek log error PM2
pm2 logs --lines 50 --nostream | grep -i "error\|fatal\|crash"

# 4. Cek koneksi MySQL
mysql -u hk_nova -p'HkNova2026!DbPass' hk_nova_prod -e "SHOW PROCESSLIST;"
```

---

## 2. Managing PM2 Workers ⚙️

| Command | Deskripsi |
|---------|-----------|
| `pm2 status` | Cek status seluruh worker & web app |
| `pm2 logs` | Stream live logs semua worker |
| `pm2 restart all` | Restart seluruh service HK-NOVA |
| `pm2 restart hk-nova-icmp-worker` | Restart worker ICMP poller saja |
| `pm2 restart hk-nova-snmp-worker` | Restart worker SNMP poller saja |
| `pm2 save` | Simpan state PM2 agar auto-start saat reboot |

---

## 3. Incident Response Procedures 🚨

### Incident 1: High CPU / Memory Threshold Exceeded (>85%)
1. Identifikasi worker/proses penyebab:
   ```bash
   pm2 list
   top -b -n 1 | head -n 20
   ```
2. Jika disebabkan worker tertentu:
   ```bash
   pm2 restart <worker-name>
   ```
3. Jika disebabkan database connection spike:
   ```bash
   mysql -u root -p -e "SHOW FULL PROCESSLIST;"
   ```

### Incident 2: ICMP / SNMP Polling Stuck or Delayed
1. Cek status Redis:
   ```bash
   redis-cli ping
   ```
2. Restart ICMP & SNMP worker:
   ```bash
   pm2 restart hk-nova-icmp-worker hk-nova-snmp-worker
   ```

### Incident 3: Device DOWN False Positives
1. Tes ping manual dari terminal:
   ```bash
   ping -c 4 <ip_device>
   ```
2. Verifikasi status di Web Dashboard atau API:
   ```bash
   curl -s http://localhost:3000/api/devices/<device_id>
   ```

---

## 4. Maintenance & Backups 💾

### Automated Database Backup
- Backup otomatis database dilakukan setiap hari jam 01:00 AM via cron.
- File tersimpan di: `/home/gopal-ichiro/backups/db/`
- Retention: 30 hari otomatis dibersihkan.

### Trigger Manual Backup Database
```bash
/usr/bin/mysqldump -u hk_nova -p'HkNova2026!DbPass' hk_nova_prod | gzip > /home/gopal-ichiro/backups/db/hk_nova_manual_$(date +%Y%m%d_%H%M%S).sql.gz
```

### Restore Database
```bash
gunzip -c /home/gopal-ichiro/backups/db/<file_backup>.sql.gz | mysql -u hk_nova -p'HkNova2026!DbPass' hk_nova_prod
```

---

## 5. Contact & Escalation 📞

- **System Admin / DevOps**: sysadmin@yourdomain.com
- **NOC On-Call**: noc@yourdomain.com
- **Repository**: `/home/gopal-ichiro/Documents/magang/hk-nova`
