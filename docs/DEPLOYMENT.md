# 🚀 HK-NOVA - Panduan Deployment Produksi

Panduan ini menjelaskan langkah-langkah mendeploy **HK-NOVA** ke server
produksi (single server, seperti rekomendasi arsitektur saat ini).

- Server target: **Linux** (Ubuntu/Debian disarankan)
- Node.js **20 LTS**, MySQL **8.0**, PM2, Nginx/Caddy (opsional)

---

## 1. Prasyarat Server

```bash
# Node.js 20 LTS
node -v   # v20.x.x

# pnpm
corepack enable
pnpm -v   # 10.x.x

# PM2 global
npm i -g pm2

# MySQL 8.0 (jalankan server-nya)
mysql --version
```

Buat user database khusus produksi (jangan pakai `root`):

```sql
CREATE DATABASE hk_nova_prod CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'hk_nova'@'localhost' IDENTIFIED BY 'STRONG_DB_PASSWORD';
GRANT ALL PRIVILEGES ON hk_nova_prod.* TO 'hk_nova'@'localhost';
FLUSH PRIVILEGES;
```

---

## 2. Konfigurasi Environment (`.env`)

Salin template dan isi nilai production:

```bash
cp .env.example .env
nano .env
```

| Variabel | Wajib | Catatan |
|----------|-------|---------|
| `DATABASE_URL` | ✅ | `mysql://hk_nova:STRONG@localhost:3306/hk_nova_prod` |
| `ENCRYPTION_KEY` | ✅ | 32-byte hex. Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `JWT_SECRET` | ✅ | String acak panjang (min. 32 karakter) — **wajib diubah** |
| `OPERATOR_USERNAME` | ✅ | Username admin operator |
| `OPERATOR_PASSWORD` | ✅ | **Wajib diganti** dari `admin123` sebelum deploy |
| `NODE_ENV` | ✅ | `production` |
| `NEXT_PUBLIC_APP_URL` | ✅ | URL publik, mis. `https://noc.example.com` |
| `DEMO_MODE_ENABLED` | any | **`false`** di produksi kecuali sengaja demo |
| `ENABLE_OLT_EXECUTION` | any | **`false`** sampai pengujian menyeluruh selesai |
| `TELEGRAM_*` / `SMTP_*` / `NOTIFY_WEBHOOK_URLS` / `SMS_*` | opsional | Kanal notifikasi |

> 🔒 **Rahasia tetap rahasia.** Jangan pernah commit `.env`. File ini
> sudah di-ignore di `.gitignore`.

---

## 3. Install & Build

```bash
cd hk-nova

# Install dependency (tanpa devDependencies tidak disarankan karena
# tsx dipakai worker prod; gunakan install penuh)
pnpm install

# Terapkan migration ke database produksi
pnpm db:migrate:prod

# Generate Prisma Client
pnpm generate

# Seed data awal (hanya sekali) — skip jika ingin mulai kosong
pnpm db:seed

# Build aplikasi
pnpm build
```

Verifikasi build:

```bash
pnpm lint
pnpm test        # opsional, sebelum deploy
```

---

## 4. Jalankan dengan PM2

```bash
pm2 start ecosystem.config.js
pm2 save                        # simpan daftar proses
pm2 startup                     # jalankan otomatis saat boot
pm2 status                      # pastikan semua online
```

Status yang diharapkan:

```
hk-nova-web              online
hk-nova-icmp-worker      online
hk-nova-snmp-worker      online
hk-nova-retention-worker online
hk-nova-backup-worker    online
```

> `hk-nova-demo-generator` ikut terdaftar tapi hanya aktif jika
> `DEMO_MODE_ENABLED=true`.

### Log Rotation (wajib di produksi)

PM2 menulis log ke `logs/` (sudah disentralisasi di `ecosystem.config.js`).
Aktifkan rotasi otomatis agar log tidak membesar tanpa batas:

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true
```

---

## 5. Reverse Proxy & HTTPS

Aplikasi berjalan di `127.0.0.1:3000`. Posisikan di belakang reverse proxy
untuk HTTPS.

### Contoh Nginx

```nginx
server {
    listen 80;
    server_name noc.example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name noc.example.com;

    ssl_certificate     /etc/letsencrypt/live/noc.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/noc.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 90s;   # perlu untuk endpoint SSE
        proxy_buffering off;      # perlu untuk streaming SSE
    }
}
```

> ⚠️ **SSE real-time** membutuhkan `proxy_buffering off` dan header
> `Connection: upgrade` agar endpoint `/api/realtime/*` bekerja.

### Sertifikat SSL

```bash
apt install certbot python3-certbot-nginx
certbot --nginx -d noc.example.com
```

Autorenew tersedia otomatis via cron `certbot renew`.

---

## 6. Health Check

Semua endpoint `/api/*` dilindungi autentikasi. Tanpa cookie session yang
valid, request mendapat respons `401 Unauthorized` — ini **normal**.

Untuk memantau uptime dari luar (UptimeRobot/Pingdom/dll), cara yang efektif:

1. **Alive check tanpa auth** — pantau HTTP status halaman `/login`
   (`200` berarti server hidup), atau pasang `stub_status` Nginx.
2. **Health dalam (dengan auth)** — setelah login, endpoint berikut bekerja:

| Endpoint | Keterangan |
|----------|------------|
| `GET /api/health` | Status DB + ringkasan device/alert (butuh session) |
| `GET /api/workers/status` | Heartbeat worker ICMP/SNMP via DB |

Contoh meneruskan cookie session dari browser:

```bash
curl -fsS -H "Cookie: hk_nova_session=<TOKEN>" https://noc.example.com/api/health
```

---

## 7. Backup Database

Gunakan helper script yang sudah tersedia:

```bash
# Backup (default: backup/latest, retensi 7 file, opsional salin offsite)
bash scripts/backup-db.sh

# Restore dari file dump terbaru
bash scripts/restore-db.sh /path/to/backup/hk_nova_prod.2026-08-19_0200.sql.gz
```

Jadwalkan otomatis via cron (setiap 02:30 WIB):

```cron
30 2 * * * cd /path/to/hk-nova && bash scripts/backup-db.sh >> logs/backup.log 2>&1
```

> Backup terpisah dari backup *device config* di dalam aplikasi. Keduanya
> penting di-backup. Untuk produksi serius, salin dump ke server lain /
> object storage (lihat opsi `REMOTE_COPY` di `scripts/backup-db.sh`).

---

## 8. Prosedur Deploy / Update

```bash
cd hk-nova
git pull

pnpm install
pnpm generate

# migration dulu baru restart worker (aman)
pnpm db:migrate:prod

pnpm build
pm2 reload ecosystem.config.js
pm2 status
```

### Rollback

1. **Code**: checkout commit sebelumnya → `pnpm install && pnpm build`
   → `pm2 reload`.
2. **Database**: restore dump terakhir (`scripts/restore-db.sh`) bila
   migration menimbulkan masalah. ⚠️ Backup DB **sebelum** menjalankan
   `db:migrate:prod`.

---

## 9. Checklist Deployment

- [ ] `NODE_ENV=production`
- [ ] `JWT_SECRET` & `ENCRYPTION_KEY` acak & kuat (tidak default)
- [ ] `OPERATOR_PASSWORD` diganti dari default
- [ ] `DEMO_MODE_ENABLED=false` (kecuali sengaja demo)
- [ ] `ENABLE_OLT_EXECUTION=false`
- [ ] `pnpm build` sukses
- [ ] `pnpm db:migrate:prod` sukses
- [ ] Semua proses PM2 `online`
- [ ] Log rotation (`pm2-logrotate`) terpasang
- [ ] HTTPS aktif (certbot / sertifikat)
- [ ] Backup DB terjadwal & teruji restore-nya
- [ ] Health check jalan (curl `/api/health`)
- [ ] Firewall hanya membuka 80/443 (HTTP di-redirect ke HTTPS)

---

## 10. Troubleshooting Umum

| Gejala | Solusi |
|--------|--------|
| Semua device `UNKNOWN` | ICMP poller tidak jalan → `pm2 start hk-nova-icmp-worker` |
| Error `JWT_SECRET must be set` | Isi `JWT_SECRET` di `.env` lalu `pm2 reload` |
| 500 di login | `pnpm db:migrate:prod` belum dijalankan |
| SSE terputus | Cek `proxy_buffering off` di Nginx |
| Metric tidak masuk | Cek log: `pm2 logs hk-nova-icmp-worker` |