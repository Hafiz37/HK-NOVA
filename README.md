# HK-NOVA - Network Operations Center Platform

Platform web fullstack untuk Network Operations Center (NOC) ISP yang mengintegrasikan monitoring, otomasi, dan kecerdasan buatan.

## 🚀 Fitur Utama

| Fitur | Status | Keterangan |
|-------|--------|------------|
| **Monitoring ICMP & SNMP** | ✅ Selesai | Real-time polling UP/DOWN, latency, CPU/Mem, interface |
| **Alert & Notification** | ✅ Selesai | Lifecycle ACTIVE/ACK/RESOLVE + Telegram (opsional) |
| **Dashboard Real-time** | ✅ Selesai | Dark theme, grafik, worker status live |
| **Autobackup Config** | 🚧 Planned | Schema DB & template siap; worker & UI belum dibangun |
| **OLT Provisioning** | 🚧 Planned | Template Huawei/ZTE/Generic siap; service & UI belum |
| **ML Anomaly Detection** | 🚧 Planned | Isolation Forest library & schema siap; worker belum |

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

# Run migrations ke database
pnpm db:migrate

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

### Database Migration (Production)

```bash
# Apply pending migrations
pnpm db:migrate:prod
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

# Reset database & seed ulang (development)
pnpm db:reset

# Create a new migration (development)
pnpm db:migrate

# Apply pending migrations (production)
pnpm db:migrate:prod

# View migration status
pnpm prisma migrate status
```

## 🗂️ Struktur Project

```
hk-nova/
├── src/
│   ├── app/                  # Next.js pages & API routes
│   ├── components/           # React components
│   ├── lib/                  # Utilities (prisma, encryption, telegram)
│   ├── workers/              # Background workers (ICMP, SNMP, Retention)
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

- [Architecture](docs/ARCHITECTURE.md) — Arsitektur sistem & data flow
- [Quickstart](docs/QUICKSTART.md) — Panduan cepat menjalankan project
- [Demo Mode](docs/DEMO_MODE.md) — Menjalankan tanpa perangkat fisik
- [Known Issues](docs/KNOWN_ISSUES_AND_LIMITATIONS.md) — Batasan & workaround
- [Testing Guide Phase 1](docs/TESTING_GUIDE_PHASE1.md) — Pengujian monitoring

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
