# 🎭 Mode Demo HK-NOVA

Panduan lengkap untuk menggunakan mode demo — menjalankan HK-NOVA tanpa perangkat jaringan nyata.

---

## 📋 Konsep Mode Demo

Mode demo memungkinkan HK-NOVA berjalan dengan **device simulasi** yang hidup berdampingan dengan perangkat asli dalam satu sistem. Anda bisa toggle show/hide device demo kapan pun di UI tanpa restart.

### Keunggulan

✅ **Zero downtime** — toggle instant tanpa restart web/worker  
✅ **Training & onboarding** — demo bisa diaktifkan kapan pun untuk presentasi  
✅ **Development** — test fitur baru tanpa akses perangkat fisik  
✅ **No conflict** — device demo & asli tidak saling mengganggu  

---

## 🚀 Quick Start: Setup Demo

### 1. Seed Device Demo

Jalankan sekali untuk populate 9 device demo + riwayat metric 24 jam:

```bash
pnpm demo:setup
```

**Device yang ditambahkan:**
- 3 device **ICMP UP** (8.8.8.8, 1.1.1.1, 127.0.0.1) — selalu reachable
- 3 device **ICMP DOWN** (10.10.x.x fiktif) — untuk demo alert
- 3 device **SNMP** (127.0.0.2/3/4) — untuk demo CPU/Mem/interface

### 2. Jalankan Aplikasi

```bash
# Terminal 1: Web server
pnpm dev

# Terminal 2: ICMP worker (monitor semua device, termasuk demo)
pnpm worker:icmp
```

### 3. Toggle Mode Demo di UI

1. Buka `http://localhost:3000/dashboard/devices`
2. Lihat panel **🎭 Mode Demo** di bawah filter
3. Toggle switch untuk show/hide device demo
4. Device dengan badge **DEMO** akan muncul/hilang instant

---

## 🎯 Opsi Sumber Data SNMP (Pilih salah satu)

### Opsi A: SNMP Agent Lokal (Full Pipeline, Recommended)

Setup 3 instansi `snmpd` di loopback → worker SNMP memproses data CPU/Mem/interface **nyata dari mesin ini**.

```bash
# Install & start agents (non-root, ports 1161-1163)
pnpm demo:agents start

# Verifikasi
pnpm demo:agents status
snmpwalk -v2c -c public 127.0.0.2:1161 system

# Jalankan worker SNMP
pnpm worker:snmp
```

**Stop agents:**
```bash
pnpm demo:agents stop
```

**Opsional: gunakan port 161 standar (butuh sudo):**
```bash
pnpm demo:agents start --sudo --port=161
```

### Opsi B: Demo Generator (Fallback, Zero Install)

Worker sintetis yang menulis metric tanpa polling — tidak butuh `snmpd`, tidak butuh sudo.

```bash
pnpm demo:generator
```

Generator menulis metric ICMP & SNMP secara berkala dengan random-walk realistis. Berguna jika:
- Tidak punya akses sudo
- Tidak bisa install `snmpd`
- Hanya perlu data visual untuk demo UI

---

## 📊 Apa yang Bisa Didemo?

| Fitur | Status |
|---|---|
| Login & dashboard | ✅ Penuh |
| Monitoring ICMP (UP/DOWN, latency, packet loss, grafik) | ✅ Penuh |
| Lifecycle alert (DEVICE_DOWN/UP + auto-resolve) | ✅ Penuh |
| Monitoring SNMP (CPU/Mem/interface + grafik) | ✅ Penuh (dengan snmpd atau generator) |
| Alerts management (Ack/Resolve) | ✅ Penuh |
| CRUD devices | ✅ Penuh |
| Test koneksi (ICMP/SNMP) | ✅ Penuh (terhadap 8.8.8.8 & 127.0.0.x) |
| Test koneksi SSH | ⚠️ Gagal graceful (no SSH server lokal) |
| Notifikasi Telegram | ✅ Opsional (isi token di .env) |
| Backup/Provisioning/Anomaly | ❌ Belum dibangun di codebase |

---

## 🔧 Workflow Hybrid: Demo + Perangkat Asli

Mode demo dirancang untuk **berdampingan** dengan perangkat asli:

```bash
# 1. Seed demo devices
pnpm demo:setup

# 2. Tambahkan perangkat asli via UI
#    /dashboard/devices → ➕ Tambah Device
#    Isi IP, vendor, kredensial SNMP/SSH → Simpan

# 3. Jalankan workers
pnpm worker:icmp   # monitor SEMUA device (demo + asli)
pnpm worker:snmp   # monitor SEMUA device (demo + asli)

# 4. Toggle di UI
#    Show demo ON  → device demo + asli terlihat
#    Show demo OFF → hanya device asli terlihat
```

Device asli (yang ditambahkan manual) **selalu `isDemo: false`**, jadi tidak akan tersembunyi saat demo dimatikan.

---

## 🗂️ File & Script

| File/Script | Fungsi |
|---|---|
| `scripts/demo-seed.ts` | Seed 9 device demo + riwayat 24h + alert |
| `scripts/demo/snmp-agents.sh` | Kelola 3 instansi snmpd lokal |
| `src/workers/demo-generator.ts` | Worker sintetis (fallback tanpa snmpd) |
| `pnpm demo:setup` | Jalankan demo-seed |
| `pnpm demo:agents {start|stop|status}` | Kelola SNMP agents |
| `pnpm demo:generator` | Jalankan generator sintetis |
| `pnpm demo:reset` | Reset DB + seed ulang admin + demo |

---

## 🧹 Cleanup / Reset

### Hapus Device Demo (Keep Real Devices)

Lewat UI:
1. Toggle **Show demo ON**
2. Hapus device ber-badge **DEMO** satu per satu

Atau lewat Prisma Studio:
```bash
pnpm db:studio
# Buka tabel Device → filter isDemo = true → delete
```

### Reset Total (Hapus Semua + Seed Ulang)

```bash
pnpm demo:reset
```

Ini akan:
- Reset schema (hapus semua data)
- Seed user `admin`
- Seed 9 device demo

---

## 💡 Tips & Troubleshooting

### Toggle demo tidak berpengaruh
- Pastikan API `/api/devices?showDemo=true/false` dipanggil (cek Network tab browser)
- Refresh halaman setelah toggle (seharusnya otomatis)

### SNMP agents gagal start
- Cek port tidak bentrok: `lsof -i :1161` (atau `sudo lsof -i :161` bila pakai `--sudo`)
- Pastikan IP loopback aktif: `ip addr show lo`
- Verifikasi manual: `snmpwalk -v2c -c public 127.0.0.2:1161 system`

### Worker SNMP tidak menghasilkan data
- Pastikan device `127.0.0.2/3/4` sudah di-seed: `pnpm demo:seed`
- Pastikan ada kredensial SNMP di DB (community `public`)
- Alternatif: pakai `pnpm demo:generator`

### Grafik kosong saat pertama kali
- Data metric butuh 1–2 siklus worker (~5 menit untuk SNMP)
- Gunakan `pnpm demo:seed` yang sudah isi riwayat 24h

### Device demo muncul di production
- Toggle **Show demo OFF** di `/dashboard/devices`
- Atau filter query API: tambahkan `?showDemo=false`

---

## 🔐 Best Practice Production

Saat deploy production dengan perangkat asli:

1. **Jangan seed demo devices** — skip `pnpm demo:setup`
2. **Toggle default OFF** — localStorage pengguna masing-masing menyimpan preferensi
3. **Hanya jalankan worker asli** — `worker:icmp` + `worker:snmp` sudah cukup, skip `demo:generator`
4. **Badge DEMO jelas** — device demo akan tetap ber-badge jika ada (tidak mengganggu monitoring)

---

## 📖 API Reference

### GET /api/devices?showDemo=true

Filter device berdasarkan mode demo.

**Query params:**
- `showDemo=true` — tampilkan device demo + asli
- `showDemo=false` — hanya device asli (`isDemo: false`)

**Response:**
```json
{
  "data": [
    {
      "id": "...",
      "name": "Google DNS Demo",
      "isDemo": true,
      "status": "UP",
      ...
    }
  ]
}
```

### GET /api/settings/demo-mode

Status generator & jumlah device.

**Response:**
```json
{
  "data": {
    "generatorEnabled": true,
    "demoDeviceCount": 9,
    "realDeviceCount": 5,
    "lastUpdated": "2026-08-14T15:00:00.000Z"
  }
}
```

### POST /api/settings/demo-mode

Toggle demo generator (belum diimplementasi UI control, saat ini via API manual).

**Body:**
```json
{ "enabled": false }
```

---

## 🎓 Skenario Demo (5 menit)

1. **Login** → `admin / admin123`
2. **Dashboard** → tunjukkan stat cards, worker status, avg latency
3. **Monitoring** → grafik ICMP (8.8.8.8 UP, 10.10.x.x DOWN)
4. **SNMP** → `/dashboard/snmp` → kartu agregasi, grafik CPU/Mem, tabel interface
5. **Alerts** → tab Active → tunjukkan DEVICE_DOWN, lakukan Ack → Resolve
6. **Devices** → toggle demo OFF → device demo hilang → toggle ON → muncul lagi
7. **Test Koneksi** → pilih device `8.8.8.8` → ICMP sukses → SNMP sukses (jika ada agent)

---

**HK-NOVA Demo Mode** — Full monitoring experience, zero real devices.
