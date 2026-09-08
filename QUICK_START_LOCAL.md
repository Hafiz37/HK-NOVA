# 🚀 Quick Start Testing Local HK-NOVA

Panduan cepat untuk menjalankan dan melakukan testing HK-NOVA di laptop pribadi tanpa perlu deploy ke server.

---

## ⚡ 3 Langkah Cepat Setup Pertama Kali

### 1️⃣ Pilih Environment & Setup Automatically

Buka terminal di folder project, jalankan:

```bash
# Untuk di KANTOR:
./scripts/dev-setup.sh office

# Atau untuk di RUMAH:
./scripts/dev-setup.sh home
```

Script ini akan otomatis:
- ✅ Cek koneksi & detect IP laptop Anda
- ✅ Konfigurasi `.env` sesuai lokasi (kantor/rumah)
- ✅ Jalankan MySQL (port 3307) & Redis (port 6380) via Docker
- ✅ Run database migration & seed data
- ✅ Tambahkan device placeholder sesuai lokasi

---

### 2️⃣ Jalankan Aplikasi

```bash
./scripts/dev-start.sh
```

Pilih opsi **1** (Web server only) atau **2** (Web + ICMP Worker).

Atau manual:
```bash
# Terminal 1: Web Application
pnpm dev

# Terminal 2 (opsional): ICMP Polling Worker
pnpm worker:icmp
```

Buka browser: **`http://localhost:3000`** atau **`http://[IP-LAPTOP]:3000`**

---

### 3️⃣ Default Login Credentials

```
Username: admin
Password: admin123
```

---

## 🔄 Pindah Lokasi (Kantor ↔ Rumah)

Ketika Anda membawa laptop dari kantor ke rumah (atau sebaliknya):

```bash
# 1. Switch environment config
./switch-env.sh home   # jika di rumah
# atau
./switch-env.sh office # jika di kantor

# 2. Re-seed devices sesuai lokasi (opsional)
pnpm seed:home

# 3. Jalankan app
pnpm dev
```

---

## 🛠️ Commands Penting

| Perintah | Deskripsi |
|----------|-----------|
| `./switch-env.sh status` | Cek environment aktif dan IP laptop |
| `./scripts/check-network.sh` | Cek status jaringan, port & Docker |
| `pnpm docker:dev` | Jalankan Docker MySQL & Redis |
| `pnpm docker:stop` | Hentikan Docker containers |
| `pnpm seed:office` | Seed device test kantor |
| `pnpm seed:home` | Seed device test rumah |
| `pnpm seed:clear` | Hapus device real (demo tetap ada) |
| `./scripts/db-backup.sh` | Backup database lokal |
| `./scripts/db-restore.sh [file]` | Restore database lokal |

---

## 📖 Dokumentasi Lengkap

- [MULTI_ENV_GUIDE.md](docs/MULTI_ENV_GUIDE.md) - Panduan detail multi-environment (kantor & rumah)
- [TESTING_LOCAL.md](docs/TESTING_LOCAL.md) - Panduan lengkap testing & troubleshooting

---

## ❓ Troubleshooting Singkat

**Q: Port 3307 atau 6380 clash/error?**
```bash
pnpm docker:stop
docker system prune -f
pnpm docker:dev
```

**Q: Tidak bisa ping device real di jaringan?**
```bash
./scripts/check-network.sh
```
Pastikan IP laptop satu subnet dengan device target.

**Q: Reset total database?**
```bash
pnpm db:reset
```
