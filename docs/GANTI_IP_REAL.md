# 🌐 Panduan: Mengganti IP Demo ke Perangkat Nyata

Dokumen ini menjelaskan cara mengganti seed IP fiktif (`10.10.x.x`) ke IP perangkat jaringan nyata pada HK-NOVA.

---

## Mengapa IP Fiktif Selalu DOWN?

File `prisma/seed.ts` berisi perangkat demo dengan IP subnet `10.10.x.x` yang **tidak bisa dijangkau** dari environment development. Ini menyebabkan ICMP Poller Worker selalu menandai perangkat tersebut sebagai **DOWN** dan terus memicu alert.

Seed sudah disertakan 3 IP reachable bawaan untuk demo:

| Nama | IP | Keterangan |
|---|---|---|
| Google Public DNS | `8.8.8.8` | Selalu UP dari internet |
| Cloudflare DNS | `1.1.1.1` | Selalu UP dari internet |
| Localhost | `127.0.0.1` | Selalu UP, latency ~0ms |

---

## Cara 1: Tambah Device via UI (Direkomendasikan)

Ini adalah cara **termudah dan tidak membutuhkan restart** apapun.

1. Buka browser ke `http://localhost:3000/dashboard/devices`
2. Klik tombol **➕ Tambah Device**
3. Isi form:
   - **Nama Device**: nama perangkat Anda (misal: `MikroTik Core Kantor`)
   - **IP Address**: IP real perangkat (misal: `192.168.1.1`)
   - **Tipe**: pilih tipe yang sesuai (`ROUTER`, `SWITCH`, dll.)
   - **Vendor / Model**: opsional, tapi membantu identifikasi
   - **Lokasi**: opsional (misal: `Server Room Lantai 2`)
4. Klik **Simpan Device**
5. ICMP Poller akan otomatis memonitor IP baru pada siklus poll berikutnya (~1 menit)

> **Catatan**: IP harus dapat dijangkau dari server tempat HK-NOVA berjalan, bukan dari browser.

---

## Cara 2: Edit File Seed (untuk Setup Awal / Tim)

Cocok jika ingin setup environment baru langsung dengan IP perangkat nyata.

### Langkah:

**1. Buka `prisma/seed.ts`**

Cari blok `initialDevices`:

```typescript
const initialDevices = [
  {
    name: 'Google Public DNS (Reachable)',
    ip: '8.8.8.8',
    // ...
  },
  {
    name: 'Core Router Jakarta (Fiktif Demo)',
    ip: '10.10.1.1',        // ← Ganti ini
    // ...
  },
  // ...
];
```

**2. Ganti IP fiktif dengan IP perangkat nyata Anda**

Contoh perubahan:

```typescript
// SEBELUM (demo fiktif)
{
  name: 'Core Router Jakarta (Fiktif Demo)',
  ip: '10.10.1.1',
  type: 'ROUTER',
  vendor: 'Cisco',
  model: 'ASR1000',
  location: 'DC Jakarta',
  status: 'UNKNOWN',
  description: 'Core router demo (IP private tidak reachable -> status DOWN)',
},

// SESUDAH (IP nyata)
{
  name: 'MikroTik Core Router Kantor',
  ip: '192.168.1.1',          // ← IP gateway/router Anda
  type: 'ROUTER',
  vendor: 'MikroTik',
  model: 'CCR1036',
  location: 'Server Room',
  status: 'UNKNOWN',
  description: 'Core router utama jaringan kantor',
},
```

**3. Jalankan ulang seed**

```bash
# Opsional: reset seluruh device seed (hati-hati, menghapus data metric lama)
pnpm db:reset

# Atau hanya jalankan seed (upsert, aman dijalankan berulang)
pnpm db:seed
```

---

## Cara 3: Edit Langsung via Database (Advanced)

Jika tidak ingin mengubah kode, gunakan Prisma Studio:

```bash
pnpm db:studio
```

Buka browser ke `http://localhost:5555`, pilih tabel **Device**, lalu:
- Edit baris yang IP-nya `10.10.x.x`
- Ganti kolom `ip` dengan IP nyata
- Klik **Save 1 record**

---

## IP yang Bisa Digunakan sebagai Demo Reachable

Selain perangkat nyata, IP berikut bisa dijangkau dari manapun (perlu akses internet):

| IP | Pemilik | Keterangan |
|---|---|---|
| `8.8.8.8` | Google DNS | Latency tergantung koneksi internet |
| `8.8.4.4` | Google DNS 2 | Alternatif Google DNS |
| `1.1.1.1` | Cloudflare | Salah satu DNS tercepat |
| `1.0.0.1` | Cloudflare 2 | Alternatif Cloudflare |
| `9.9.9.9` | Quad9 DNS | DNS security-focused |
| `127.0.0.1` | Localhost | Latency ~0ms, selalu UP |

---

## Setelah Mengganti IP

1. Pastikan IP tersebut **dapat di-ping dari server** tempat HK-NOVA berjalan:
   ```bash
   ping -c 3 192.168.1.1
   ```
2. Jika worker sudah berjalan, tunggu hingga siklus poll berikutnya (~1 menit)
3. Status perangkat akan otomatis berubah menjadi **UP** di dashboard

---

## Perangkat yang Ingin Tetap Demo (Expected DOWN)

Jika ingin tetap menyimpan perangkat fiktif untuk keperluan demonstrasi tampilan alert **DOWN**, ubah deskripsinya agar jelas:

```typescript
description: '⚠ DEMO DEVICE: IP tidak reachable, status DOWN adalah normal',
```

Atau set statusnya ke `MAINTENANCE` agar tidak di-poll:

```bash
# via Prisma Studio atau SQL langsung
UPDATE Device SET status = 'MAINTENANCE' WHERE ip = '10.10.1.1';
```
