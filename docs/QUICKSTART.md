# Quick Start Guide

## 🚀 Setup Cepat (5 Menit)

### 1. Persiapan Database

```bash
# Login ke MySQL
mysql -u root -p

# Buat database
CREATE DATABASE hk_nova_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
EXIT;
```

### 2. Konfigurasi Environment

```bash
# Copy file .env
cp .env.example .env

# Generate encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Edit .env dan update:
# - DATABASE_URL dengan password MySQL Anda
# - ENCRYPTION_KEY dengan hasil generate di atas
nano .env
```

### 3. Setup Database Schema

```bash
# Push schema ke database
pnpm db:push

# Generate Prisma Client
pnpm generate

# Seed demo data
pnpm db:seed
```

### 4. Jalankan Aplikasi

```bash
# Jalankan web server
pnpm dev

# Buka browser: http://localhost:3000
# Login: admin / admin123
```

## 🎯 Next Steps

### Jalankan Workers (Opsional untuk Development)

```bash
# Buka terminal baru untuk setiap worker

# Terminal 2: ICMP Worker
pnpm worker:icmp

# Terminal 3: SNMP Worker
pnpm worker:snmp

# Terminal 4: Backup Worker
pnpm worker:backup

# Terminal 5: Anomaly Detector
pnpm worker:anomaly
```

### Tambah Device Pertama

1. Login ke dashboard
2. Klik menu "Devices"
3. Klik "Add Device"
4. Isi form:
   - Name: Router Test
   - IP: 8.8.8.8 (atau IP device Anda)
   - Type: Router
   - Vendor: Cisco (contoh)
5. (Opsional) Tambahkan credentials SNMP/SSH
6. Save

### Setup Telegram Notification (Opsional)

1. Buat bot baru di Telegram:
   - Chat dengan @BotFather
   - Kirim `/newbot`
   - Ikuti instruksi, dapatkan token

2. Dapatkan Chat ID:
   - Chat dengan bot Anda
   - Buka: `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates`
   - Cari `"chat":{"id":123456789}`

3. Update `.env`:
   ```env
   TELEGRAM_BOT_TOKEN="your-bot-token"
   TELEGRAM_CHAT_ID="your-chat-id"
   ```

4. Restart aplikasi

## 📖 Troubleshooting

### Error: Database connection failed

```bash
# Cek MySQL running
systemctl status mysql

# Cek kredensial di .env
cat .env | grep DATABASE_URL

# Test koneksi manual
mysql -u root -p hk_nova_dev
```

### Error: Prisma Client not generated

```bash
pnpm generate
```

### Port 3000 sudah dipakai

```bash
# Cek proses yang pakai port 3000
lsof -i :3000

# Atau jalankan di port lain
PORT=3001 pnpm dev
```

## 🔧 Development Commands

```bash
# Format code
pnpm format

# Lint code
pnpm lint

# Database GUI
pnpm db:studio

# Reset database
pnpm db:reset
```

## 📦 Production Deployment

```bash
# Build aplikasi
pnpm build

# Start dengan PM2
pnpm pm2:start

# Check status
pnpm pm2:status

# View logs
pnpm pm2:logs

# Restart
pnpm pm2:restart

# Stop
pnpm pm2:stop
```

## 🎓 Learning Path

1. ✅ Setup & Login (Anda di sini)
2. 📝 Tambah 2-3 devices
3. 📊 Lihat monitoring data
4. ⚙️ Coba provisioning (dry-run mode)
5. 💾 Setup autobackup untuk 1 device
6. 🔍 Explore anomaly detection
7. 🔔 Setup alert notifications

## 🆘 Need Help?

- 📖 Baca dokumentasi lengkap di `/docs`
- 🐛 Check logs: `pnpm pm2:logs`
- 🔍 Lihat database: `pnpm db:studio`
- 📧 Hubungi maintainer project
