# 🧪 Guide Pengujian Phase 1: ICMP Monitoring & Device Management

Dokumen ini berisi panduan pengujian formal untuk menguji seluruh modul **Phase 1 (ICMP Monitoring, CRUD Devices, Realtime Worker Status, dan Alerts Management)** pada platform **HK-NOVA**.

---

## 📋 Ringkasan Cakupan Pengujian Phase 1

1. **Database & Seeding Devices** (Reachable IP: 8.8.8.8, 1.1.1.1, 127.0.0.1 vs Demo Fiktif IP: 10.10.x.x)
2. **ICMP Worker Poller** (Automatic reachability check, Latency recording, Packet Loss calculation)
3. **Status Transitions & Alert Triggering** (UP → DOWN memicu `DEVICE_DOWN` alert; DOWN → UP memicu `DEVICE_UP` alert & auto-resolve)
4. **CRUD Device APIs & UI** (`GET`, `POST`, `PUT`, `DELETE` via `/dashboard/devices` dan `/api/devices`)
5. **Realtime Worker Status** (`GET /api/workers/status` dan indikator heartbeat pada `/dashboard`)
6. **Alerts Management UI & API** (Filter Severity/Status, Acknowledge, dan Resolve via `/dashboard/alerts`)

---

## 🚀 Langkah-Langkah Pengujian

### 1. Persiapan Database & Seeding
Jalankan perintah berikut untuk menginisialisasi database dan melakukan seeding data awal:

```bash
# 1. Generate Prisma Client
pnpm generate

# 2. Push Schema ke Database
pnpm db:push

# 3. Seed data device awal (Termasuk IP Publik 8.8.8.8 & 1.1.1.1)
pnpm db:seed
```

---

### 2. Jalankan Test Script Otomatis Phase 1
Untuk memverifikasi integrasi database, query Prisma, serta fungsi CRUD device tanpa perlu membuka browser:

```bash
pnpm test:phase1
```

**Ekspektasi Hasil Test:**
- `✅ PASS: Prisma Database Connection`
- `✅ PASS: Device Table Not Empty`
- `✅ PASS: Reachable Demo IP Present (8.8.8.8 / 127.0.0.1)`
- `✅ PASS: Device Creation (POST /api/devices mock)`
- `✅ PASS: Device Update (PUT /api/devices/[id] mock)`
- `✅ PASS: Device Soft Delete (DELETE /api/devices/[id] mock)`

---

### 3. Jalankan ICMP Poller Worker
Untuk memulainya secara standalone atau via PM2:

```bash
# Opsi 1: Mode Standalone / Dev Watch
pnpm worker:icmp

# Opsi 2: Mode Background via PM2
pnpm pm2:start
```

**Ekspektasi Output Worker:**
- Worker melakukan ping batch secara kontinyu.
- IP `8.8.8.8`, `1.1.1.1`, dan `127.0.0.1` akan berstatus **UP** (Latency recorded, Packet loss 0%).
- IP `10.10.x.x` akan berstatus **DOWN** (Packet loss 100%, alert `DEVICE_DOWN` dibuat otomatis di database).

---

### 4. Pengujian UI Dashboard & Realtime Worker Status
1. Buka browser pada `http://localhost:3000/dashboard`.
2. Amati **System Status**:
   - Status **ICMP Poller Worker** berubah dari *Not Running* menjadi **RUNNING** dengan badge hijau berdenyut (*pulsing*) dan timestamp *last heartbeat*.
3. Amati **Stats Cards**:
   - Total Devices, Jumlah UP/DOWN, dan Active Alerts terupdate secara real-time.

---

### 5. Pengujian CRUD Devices UI (`/dashboard/devices`)
1. Buka `http://localhost:3000/dashboard/devices`.
2. **Tambah Device Baru**:
   - Klik button **➕ Tambah Device**.
   - Isi Nama (`Mikrotik Lab`), IP (`192.168.1.1` atau IP lokal lain), Tipe (`ROUTER`), Vendor (`Mikrotik`).
   - Klik **Simpan Device**.
3. **Filter & Pencarian**:
   - Ketik IP atau nama pada input pencarian.
   - Filter berdasarkan Tipe atau Status.
4. **Edit Device**:
   - Klik **Edit**, atur nama atau lokasi baru, simpan.
5. **Hapus Device**:
   - Klik **Hapus**, konfirmasi pada dialog hapus (Soft delete).

---

### 6. Pengujian Alerts UI (`/dashboard/alerts`)
1. Buka `http://localhost:3000/dashboard/alerts`.
2. **Lihat Alert Aktif**:
   - Tab **ACTIVE** menampilkan alert `DEVICE_DOWN` dari device IP 10.10.x.x.
3. **Acknowledge Alert**:
   - Klik tombol **Ack** pada salah satu alert. Status berpindah ke **ACKNOWLEDGED**.
4. **Resolve Alert**:
   - Klik tombol **Resolve**. Status berpindah ke **RESOLVED**.
5. **Detail Alert**:
   - Klik **Detail** untuk membuka dialog modal informasi lengkap (Waktu kejadian, Severity badge, IP perangkat).

---

## 🛠️ Catatan Pengujian Telegram & Cooldown

- **Telegram Notification**: Notifikasi Telegram dikirim jika `TELEGRAM_BOT_TOKEN` dan `TELEGRAM_CHAT_ID` diisi di `.env`. Apabila kosong, notifikasi dicatat sebagai warning di console tanpa menggagalkan proses polling (*silent fail handling*).
- **Cooldown In-Memory**: Cooldown alert Telegram dikontrol per-device (`ICMP_ALERT_COOLDOWN_MS`). Jika worker di-restart, in-memory map cooldown akan ter-reset.
