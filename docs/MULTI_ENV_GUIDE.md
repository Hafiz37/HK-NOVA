# 🏢🏠 Panduan Testing Multi-Environment (Kantor & Rumah)

Panduan ini menjelaskan cara mengelola dan melakukan testing aplikasi **HK-NOVA** di dua lokasi berbeda (Kantor & Rumah) menggunakan laptop pribadi.

---

## 📋 Konsep Multi-Environment

Sistem ini menggunakan dua file konfigurasi terpisah:
- **`.env.office`**: Konfigurasi untuk jaringan kantor
- **`.env.home`**: Konfigurasi untuk jaringan rumah
- **`.env`**: Symlink otomatis yang menunjuk ke `.env.office` atau `.env.home`

---

## ⚙️ Setup Awal Per Lokasi

### A. Di Kantor

1. Connect laptop ke WiFi/LAN Kantor
2. Jalankan setup otomatis:
   ```bash
   ./scripts/dev-setup.sh office
   ```
3. Script akan mendeteksi IP laptop di kantor (misal: `192.168.10.x`) dan memperbarui `NEXT_PUBLIC_APP_URL`
4. Menambahkan device test kantor:
   - Gateway Router (`192.168.10.1`)
   - Switch Floor 1 (`192.168.10.2`)
   - Main OLT Huawei (`192.168.10.10`)
   - Access Point (`192.168.10.20`)
   - Edge Firewall (`192.168.10.254`)

### B. Di Rumah

1. Connect laptop ke WiFi/LAN Rumah
2. Jalankan setup otomatis:
   ```bash
   ./scripts/dev-setup.sh home
   ```
3. Script akan mendeteksi IP laptop di rumah (misal: `192.168.1.x`) dan memperbarui `NEXT_PUBLIC_APP_URL`
4. Menambahkan device test rumah:
   - Home Router (`192.168.1.1`)
   - Home Lab Switch (`192.168.1.10`)
   - Raspberry Pi Test (`192.168.1.100`)

---

## 🔄 Workflow Alur Perpindahan Lokasi

### Ketika Pindah dari KANTOR ke RUMAH:

```bash
# 1. Switch environment ke rumah
./switch-env.sh home

# 2. (Opsional) Seed device rumah jika belum ada
pnpm seed:home

# 3. Jalankan aplikasi
pnpm dev
```

### Ketika Pindah dari RUMAH ke KANTOR:

```bash
# 1. Switch environment ke kantor
./switch-env.sh office

# 2. (Opsional) Seed device kantor jika belum ada
pnpm seed:office

# 3. Jalankan aplikasi
pnpm dev
```

---

## ✏️ Mengatur Credentials Peril/Real Devices

Edit file `.env.office` atau `.env.home` untuk menyesuaikan IP range dan kredensial default:

### Mengubah IP Device Real via UI:
1. Buka `http://localhost:3000/dashboard/devices`
2. Klik **Edit** pada device
3. Sesuaikan **IP Address**, **SSH Username/Password**, **SNMP Community**
4. Klik **Test Connection** untuk verifikasi koneksi

### Mengubah Device via Script Seed:
Edit file:
- `scripts/seed-office-devices.ts`
- `scripts/seed-home-devices.ts`

Lalu jalankan ulang:
```bash
pnpm seed:office   # atau pnpm seed:home
```

---

## 💾 Menjaga Data Tetap Sinkron (Optional)

Jika Anda ingin data hasil testing di kantor bisa dilihat di rumah (atau sebaliknya):

### Backup di Kantor sebelum pulang:
```bash
./scripts/db-backup.sh kantor-day1
```
File backup akan tersimpan di folder `backups/kantor-day1.sql.gz`

### Restore di Rumah:
```bash
./switch-env.sh home
./scripts/db-restore.sh kantor-day1.sql.gz
```

---

## 📊 Status Command

Cek environment mana yang sedang aktif kapan saja dengan:

```bash
./switch-env.sh status
```

Output:
```
=== Environment Status ===
Status: Symlink active
Target: .env.office
Current Environment: OFFICE
Current IP: 192.168.10.100
Docker: Running
  - hk-nova-mysql-dev: Up 2 hours
  - hk-nova-redis-dev: Up 2 hours
```
