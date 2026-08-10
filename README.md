# HK-NOVA - Network Operations Center Platform

Platform web fullstack untuk Network Operations Center (NOC) ISP yang mengintegrasikan monitoring, otomasi, dan kecerdasan buatan.

## 🚀 Fitur Utama

- **Monitoring ICMP & SNMP** - Real-time monitoring status perangkat dan utilisasi bandwidth
- **Autobackup Config** - Backup otomatis konfigurasi perangkat dengan version control
- **OLT Provisioning** - Otomasi provisioning layanan pelanggan (Huawei/ZTE/Generic)
- **ML Anomaly Detection** - Deteksi anomali jaringan menggunakan Isolation Forest
- **Alert & Notification** - Notifikasi terpusat via Telegram
- **Dashboard Real-time** - Visualisasi status jaringan dengan dark theme

## 🛠️ Tech Stack

- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS
- **Backend:** Next.js API Routes, Prisma ORM
- **Database:** MySQL 8.0
- **Workers:** Node.js, PM2
- **Libraries:** net-ping, net-snmp, ssh2, node-cron, isolation-forest
- **UI Components:** Radix UI, Recharts

## 📋 Prerequisites

- Node.js 20 LTS
- MySQL 8.0
- pnpm (package manager)
- pm2 (process manager)

## 🔧 Setup

### 1. Clone & Install

```bash
cd hk-nova
pnpm install
```

### 2. Setup Database

```bash
# Buat database MySQL
mysql -u root -p
CREATE DATABASE hk_nova_dev CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
exit;

# Update .env dengan kredensial MySQL Anda
cp .env.example .env
nano .env

# Push schema ke database
pnpm db:push

# Generate Prisma Client
pnpm generate

# Seed demo data
pnpm db:seed
```

### 3. Konfigurasi Environment

Edit file `.env`:

```env
DATABASE_URL="mysql://root:your_password@localhost:3306/hk_nova_dev"
ENCRYPTION_KEY="your-32-bytes-hex-key"
JWT_SECRET="your-jwt-secret"

# Telegram (optional)
TELEGRAM_BOT_TOKEN="your-bot-token"
TELEGRAM_CHAT_ID="your-chat-id"

# Features
ENABLE_OLT_EXECUTION="false"  # Set true untuk enable real SSH execution
ENABLE_ML_ANOMALY="true"
```

### 4. Generate Encryption Key

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 🚀 Development

### Jalankan Web Server

```bash
pnpm dev
# Buka http://localhost:3000
```

### Jalankan Workers (Terminal Terpisah)

```bash
# ICMP Polling Worker
pnpm worker:icmp

# SNMP Polling Worker
pnpm worker:snmp

# Backup Scheduler Worker
pnpm worker:backup

# Anomaly Detector Worker
pnpm worker:anomaly
```

## 🎯 Production Deployment

### Build Aplikasi

```bash
pnpm build
```

### Jalankan dengan PM2

```bash
# Start semua services (web + workers)
pnpm pm2:start

# Check status
pnpm pm2:status

# View logs
pnpm pm2:logs

# Restart services
pnpm pm2:restart

# Stop services
pnpm pm2:stop
```

## 📊 Database Management

```bash
# Open Prisma Studio (GUI)
pnpm db:studio

# Reset database & seed ulang
pnpm db:reset
```

## 🗂️ Struktur Project

```
hk-nova/
├── src/
│   ├── app/                  # Next.js pages & API routes
│   ├── components/           # React components
│   ├── lib/                  # Utilities (prisma, encryption, telegram)
│   ├── services/             # Business logic
│   ├── workers/              # Background workers
│   ├── types/                # TypeScript types
│   └── config/               # Configuration files (OLT templates, SNMP OIDs)
├── prisma/
│   ├── schema.prisma         # Database schema
│   └── seed.ts               # Demo data
├── public/                   # Static assets
├── scripts/                  # Utility scripts
├── docs/                     # Documentation
├── ecosystem.config.js       # PM2 configuration
└── package.json
```

## 🔐 Default Login

```
Username: admin
Password: admin123
```

**⚠️ Ubah password setelah login pertama!**

## 📖 Dokumentasi Lengkap

- [API Documentation](docs/API.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Deployment Guide](docs/DEPLOYMENT.md)

## 🛡️ Security Notes

- Credentials perangkat dienkripsi AES-256 di database
- SSH execution default **DISABLED** (dry-run mode)
- Enable `ENABLE_OLT_EXECUTION=true` hanya setelah testing menyeluruh
- Jangan commit file `.env` ke repository
- Gunakan strong encryption key di production

## 🤝 Contributing

Ini adalah project magang. Untuk kontribusi atau pertanyaan, hubungi maintainer.

## 📝 License

Private - Project Magang ISP

---

**HK-NOVA** - Network Operations Center Platform
Monitoring • Automation • Intelligence
