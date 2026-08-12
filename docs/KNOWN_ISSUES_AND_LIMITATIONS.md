# ⚠️ Dokumentasi Potensi Masalah, Solusi & Batasan Sistem (Phase 1 MVP)

Dokumen ini merangkum inventarisasi **Potensi Masalah (Perlu Perhatian)** dan **Solusi / Mitigasi** yang diterapkan pada platform **HK-NOVA Phase 1 (ICMP Monitoring & Network Core)**.

---

## 📌 POTENSI MASALAH & MITIGASI IMPLEMENTASI

### 1. Seed IP Fiktif (`10.10.x.x`)
- **Masalah**: IP subnet `10.10.x.x` pada data seed fiktif/demo tidak dapat di-ping secara umum dari environment dev/local. Hal ini menyebabkan device demo selalu berstatus **DOWN** dan memicu alert secara terus menerus.
- **Solusi & Perbaikan**:
  - Pada `prisma/seed.ts`, telah ditambahkan device dengan **IP Publik & Loopback yang terjangkau (Reachable)** seperti `8.8.8.8` (Google DNS), `1.1.1.1` (Cloudflare DNS), dan `127.0.0.1` (Localhost).
  - Dengan perbaikan ini, pengguna langsung dapat melihat variasi status **UP** dan **DOWN** secara bersamaan saat pertama kali menjalankan worker.
  - Untuk lingkungan produksi/lab nyata, ganti IP seed fiktif dengan IP perangkat ril yang berada dalam jangkauan network.

---

### 2. Notifikasi Telegram Kosong (`TELEGRAM_BOT_TOKEN=""`)
- **Masalah**: Ketika variabel `TELEGRAM_BOT_TOKEN` atau `TELEGRAM_CHAT_ID` belum diisi pada file `.env`, pengiriman notifikasi Telegram akan gagal secara diam-diam (*silent fail*) tanpa menghentikan worker.
- **Solusi & Status**:
  - **Opsional**: Pengisian `TELEGRAM_BOT_TOKEN` bersifat opsional pada Phase 1.
  - Module `src/lib/telegram.ts` menangani ketiadaan token dengan aman menggunakan logging `console.warn` tanpa melemparkan *uncaught exception* yang dapat merusak siklus polling ICMP.

---

### 3. Worker Status Tidak Realtime
- **Masalah**: Komponen UI "System Status" di `/dashboard` sebelumnya bersifat statis/hardcoded ("Not Running").
- **Solusi & Perbaikan**:
  - Telah dibuat API Endpoint khusus: `GET /api/workers/status`.
  - Endpoint ini memeriksa keaktifan heartbeat ICMP Poller secara dinamis berdasarkan stempel waktu (*timestamp*) metric ICMP terbaru yang masuk ke database.
  - UI `/dashboard` secara otomatis melakukan auto-refresh setiap 10 detik untuk menampilkan status **RUNNING** / **STOPPED** beserta timestamp heartbeat terkini secara real-time.

---

### 4. Cooldown Notification In-Memory
- **Masalah**: Cooldown notifikasi alert Telegram disimpan dalam memori (*In-Memory Map*) pada proses Node.js worker. Jika worker di-restart, state cooldown akan ter-reset, sehingga alert bisa terkirim kembali jika status device masih DOWN.
- **Solusi & Catatan MVP**:
  - Pendekatan in-memory ini sangat efisien dan **acceptable untuk tahap MVP Phase 1**.
  - Untuk Phase selanjutnya (Production Hardening), cooldown state dapat dipindahkan ke Redis atau tabel database `AlertCooldown`.

---

### 5. API Rate Limiting
- **Masalah**: API Endpoint belum dilengkapi dengan rate limiter (*Throttling*), sehingga dapat terjadi request spam jika dipanggil tanpa kontrol.
- **Solusi & Rekomendasi**:
  - Pada tahap MVP, tingkat prioritas ini adalah **Low**.
  - Rekomendasi untuk fase produksi adalah mengintegrasikan middleware rate-limiting seperti `@upstash/ratelimit` atau `express-rate-limit` / Next.js middleware `Arcjet`.

---

## 🚀 IKHTISAR PERBAIKAN FITUR TERIMPLEMEN (PHASE 1 COMPLETE)

| Fitur / Modul | Status | Keterangan |
|---|---|---|
| **API Device CRUD (`/api/devices`)** | ✅ Selesai | Mendukung `GET` (Search & Filter), `POST` (Create with validation), `PUT/PATCH` (Update), `DELETE` (Soft delete) |
| **Halaman Devices UI (`/dashboard/devices`)** | ✅ Selesai | Interface CRUD modern lengkap dengan modal form, badge status, filter tipe/status, dan loading skeleton |
| **Halaman Alerts UI (`/dashboard/alerts`)** | ✅ Selesai | Interface kelola alert dengan tab status, filter severity, pencarian, tombol *Acknowledge*, tombol *Resolve*, dan detail modal |
| **Realtime Worker Status API** | ✅ Selesai | Endpoint `GET /api/workers/status` mengecek keaktifan poller via DB metrics |
| **Error Boundaries** | ✅ Selesai | Component `src/app/dashboard/error.tsx` & `src/app/error.tsx` mencegah blank screen |
| **Automated Testing Script** | ✅ Selesai | Perintah `pnpm test:phase1` (`scripts/test-phase1.ts`) untuk verifikasi otomatis |
| **Dokumentasi Testing** | ✅ Selesai | `docs/TESTING_GUIDE_PHASE1.md` berisi panduan step-by-step pengujian |
