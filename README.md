# HK-NOVA - Network Operations Center Platform

Platform web fullstack untuk Network Operations Center (NOC) ISP yang mengintegrasikan monitoring, otomasi, dan kecerdasan buatan.

## 🚀 Fitur Utama

| Fitur | Status | Keterangan |
|-------|--------|------------|
| **Monitoring ICMP & SNMP** | ✅ Selesai | Real-time polling UP/DOWN, latency, CPU/Mem, interface |
| **Alert & Notification** | ✅ Selesai | Lifecycle ACTIVE/ACK/RESOLVE + multi-channel (Telegram/Email/Webhook/SMS) |
| **Dashboard Real-time** | ✅ Selesai | Dark theme, grafik, SSE realtime, worker status live |
| **Autobackup Config** | ✅ Selesai | Backup scheduler via SSH, versioning + diff, worker & UI aktif |
| **OLT Provisioning** | ✅ Selesai | Template Huawei/ZTE/Generic, dry-run & execute mode, log |
| **ML Anomaly Detection** | ✅ Selesai | Isolation Forest, 7 hari training, auto-alert HIGH/CRITICAL, worker/API/UI lengkap |
| **Device Management** | ✅ Selesai | CRUD, test koneksi, credential terenkripsi |
| **Auth, RBAC & Audit** | ✅ Selesai | Login JWT, role-based access, audit log, user management |
| **Reporting & Export** | ✅ Selesai | Export CSV/XLSX/PDF + server-side pagination |
| **Demo Mode** | ✅ Selesai | 18 device sintetis + generator data + SNMP agent simulator |

## 🛠️ Tech Stack

- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS
- **Backend:** Next.js API Routes, Prisma ORM
- **Database:** MySQL 8.0
- **Workers:** Node.js, PM2
- **Libraries:** net-ping, net-snmp, ssh2, node-cron, isolation-forest (reserved), nodemailer, exceljs, pdfkit
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

# ML Anomaly Detection (optional tuning)
ANOMALY_TRAINING_DAYS="7"              # Minimum historical data days
ANOMALY_MIN_SAMPLES="50"               # Minimum samples untuk training
ANOMALY_SCORE_THRESHOLD_HIGH="0.7"     # Fallback HIGH (ketika model tak ada)
ANOMALY_SCORE_THRESHOLD_CRITICAL="0.85" # Fallback CRITICAL (ketika model tak ada)
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
# ICMP Polling Worker (real devices)
pnpm worker:icmp

# SNMP Polling Worker
pnpm worker:snmp

# Data Retention Worker (cleanup metrics > 30 hari)
pnpm worker:retention

# Backup Scheduler Worker (autobackup config via SSH)
pnpm worker:backup

# Anomaly Detector Worker (ML-based anomaly detection)
pnpm worker:anomaly

# Demo Generator (synthetic data untuk device isDemo: true)
pnpm demo:generator
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
│   ├── app/                  # Next.js pages & API routes (40+ endpoints)
│   │   ├── api/              #   REST API (devices, alerts, backups, provisioning, export, ...)
│   │   └── dashboard/        #   UI pages (devices, monitoring, snmp, alerts, backup, ...)
│   ├── components/           # React components
│   ├── hooks/                # Custom hooks (useSSE, useBaseline)
│   ├── lib/                  # Utilities (prisma, auth, encryption, notifier, alert-engine, backup, provisioning, ...)
│   │   └── channels/         #   Notifikasi channel (telegram/email/webhook/sms)
│   ├── workers/              # Background workers (ICMP, SNMP, Backup, Retention, Demo)
│   ├── types/                # TypeScript types
│   └── config/               # Configuration files (OLT templates, SNMP OIDs)
├── prisma/
│   ├── schema.prisma         # Database schema
│   ├── migrations/           # Prisma migrations
│   └── seed.ts               # Demo data
├── public/                   # Static assets
├── scripts/                  # Utility scripts (setup, test, backup-db, restore-db)
├── tests/                    # Vitest unit & integration tests
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
- [ML Anomaly Detection](docs/ML_ANOMALY_DETECTION.md) — Isolation Forest untuk deteksi anomali
- [Runbook](RUNBOOK.md) — Operasi harian & troubleshooting
- [Deployment](docs/DEPLOYMENT.md) — Panduan deploy ke produksi
- [Known Issues](docs/KNOWN_ISSUES_AND_LIMITATIONS.md) — Batasan & workaround
- [Testing Guide Phase 1](docs/TESTING_GUIDE_PHASE1.md) — Pengujian monitoring
- [Ganti IP Real](docs/GANTI_IP_REAL.md) — Memakai device riil menggantikan demo

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
