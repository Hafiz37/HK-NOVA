# Customer Management - Technical Architecture & API Reference

Dokumentasi teknis arsitektur, skema database, dan API reference untuk Customer Management Module.

---

## 🏗️ Arsitektur Modul

```
[ Frontend Dashboard UI ]
          │ (REST API / JSON)
          ▼
[ Next.js API Route Handlers ] ──► [ Rate Limiter & Circuit Breaker ]
          │                                      │
          ├─────────────────────────┐            ▼
          ▼                         ▼  [ RouterOS API Client ]
[ Prisma ORM (MySQL) ]     [ Audit Logger ]      │ (TCP Port 8728)
  - Customer                - Action Logs        ▼
  - ProvisioningLog        - Status History   [ MikroTik RouterOS ]
```

---

## 📡 API Reference Summary

### 1. Customer CRUD
- `GET /api/customers` - List customer dengan pencarian, filter, dan paginasi.
- `POST /api/customers` - Pembuatan customer baru & eksekusi provisioning MikroTik.
- `GET /api/customers/[id]` - Detail customer lengkap dengan log & riwayat status.
- `PATCH /api/customers/[id]` - Pembaruan data customer.
- `DELETE /api/customers/[id]` - Penghapusan data customer (Admin only).

### 2. Customer Actions
- `POST /api/customers/[id]/suspend` - Menonaktifkan akses pppoe/queue customer.
- `POST /api/customers/[id]/reactivate` - Mengaktifkan kembali akses customer.
- `POST /api/customers/[id]/terminate` - Menghapus seluruh resource customer di MikroTik.

### 3. Monitoring & Safety
- `GET /api/customers/operations-monitor` - Metrik real-time rate limiter & circuit breaker per device.

---

## 🛡️ Safety & Rate Limiting Mechanisms

1. **Per-Device Rate Limiter (`src/lib/device-rate-limiter.ts`):**
   - Maksimal 2 operasi bersamaan per Router.
   - Waktu jeda (quiet period) 2000 ms antar operasi.
2. **Circuit Breaker (`src/lib/mikrotik/circuit-breaker.ts`):**
   - Berpindah ke status `OPEN` setelah 5 kegagalan berturut-turut.
   - Recovery otomatis setelah 60 detik dalam mode `HALF_OPEN`.
