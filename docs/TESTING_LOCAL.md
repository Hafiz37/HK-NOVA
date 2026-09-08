# 🧪 Panduan Lengkap Testing Local HK-NOVA

Dokumen ini berisi penjelasan mendalam mengenai arsitektur testing lokal, konfigurasi Docker, isolasi data, dan troubleshooting.

---

## 🏗️ Arsitektur Local Testing

```
┌─────────────────────────────────────────────────────────────┐
│                    LAPTOP PRIBADI                           │
│                                                             │
│  ┌────────────────────────┐    ┌─────────────────────────┐  │
│  │   Next.js App Server   │    │  Background Workers     │  │
│  │   http://localhost:3000│    │  ICMP, SNMP, Anomaly    │  │
│  └───────────┬────────────┘    └────────────┬────────────┘  │
│              │                              │               │
│              └──────────────┬───────────────┘               │
│                             │                               │
│  ┌──────────────────────────▼────────────────────────────┐  │
│  │                   DOCKER CONTAINERS                   │  │
│  │                                                       │  │
│  │  ┌───────────────────────┐  ┌──────────────────────┐  │  │
│  │  │  MySQL 8.0 Container  │  │  Redis 7 Container   │  │  │
│  │  │  Host Port: 3307      │  │  Host Port: 6380     │  │  │
│  │  │  Volume: dev-data     │  │  Volume: redis-data  │  │  │
│  │  └───────────────────────┘  └──────────────────────┘  │  │
│  └───────────────────────────────────────────────────────┘  │
└──────────────────────────────┬──────────────────────────────┘
                               │
               ┌───────────────┴───────────────┐
               │                               │
    ┌──────────▼──────────┐         ┌──────────▼──────────┐
    │  Jaringan Kantor    │         │  Jaringan Rumah     │
    │  192.168.10.0/24    │         │  192.168.1.0/24     │
    │  - Router, OLT, SW  │         │  - Home Router, Lab │
    └─────────────────────┘         └─────────────────────┘
```

---

## 🐳 Docker Setup Details

Docker dikonfigurasi khusus untuk pengembangan lokal agar **tidak bentrok** dengan MySQL/Redis yang mungkin sudah terinstall di sistem OS laptop Anda.

### Mappings:
- **MySQL Container Port:** 3306 ➔ **Host Port:** `3307`
- **Redis Container Port:** 6379 ➔ **Host Port:** `6380`

### Persistence Data:
Data MySQL dan Redis disimpan di Docker Volumes bernama:
- `hk-nova-mysql-dev-data`
- `hk-nova-redis-dev-data`

Data **TIDAK AKAN HILANG** saat laptop dimatikan atau container di-restart.

---

## 🧪 Skenario Testing Per Fitur

### 1. ICMP Polling (Monitoring Ping)
1. Pastikan IP device di UI/Seed dapat di-ping dari laptop
2. Jalankan ICMP Worker:
   ```bash
   pnpm worker:icmp
   ```
3. Cek status device di UI: `http://localhost:3000/dashboard/monitoring`
4. Observasi latency dan packet loss

### 2. SNMP Polling
1. Pastikan device target mengaktifkan SNMP v2c dengan community `public` (atau ubah via UI)
2. Jalankan SNMP Worker:
   ```bash
   pnpm worker:snmp
   ```
3. Buka menu SNMP Monitoring di UI untuk melihat CPU, Memory, & Interface metrics

### 3. Backup Configuration (SSH)
1. Pastikan device Mikrotik/Huawei/ZTE mengaktifkan SSH (Port 22)
2. Di UI Device Management, isi **SSH Username** dan **SSH Password**
3. Buka menu Backup, pilih device dan klik **Run Backup Now**
4. Cek hasil backup diff di UI

### 4. ML Anomaly Detection
1. Jalankan Anomaly Detector Worker:
   ```bash
   pnpm worker:anomaly
   ```
2. Atau gunakan demo generator untuk menghasilkan data sintetis:
   ```bash
   pnpm demo:generator
   ```
3. Cek hasil analisis anomali di `http://localhost:3000/dashboard/anomalies`

---

## 🔍 Troubleshooting & Diagnostic

### 1. Menguji Network & Port Availability
```bash
./scripts/check-network.sh
```

### 2. Cek Log Docker Containers
```bash
# Log MySQL
docker logs hk-nova-mysql-dev -f

# Log Redis
docker logs hk-nova-redis-dev -f
```

### 3. Reset Container & Database dari Awal
```bash
# Hapus container dan volume data
pnpm docker:clean

# Setup ulang dari awal
./scripts/dev-setup.sh office
```

### 4. Akses Direct ke MySQL Docker
```bash
mysql -h 127.0.0.1 -P 3307 -u hk_nova_dev -phk_nova_dev_pass hk_nova_dev
```

### 5. Akses Direct ke Redis Docker
```bash
redis-cli -h 127.0.0.1 -p 6380
```

---

## 🔒 Catatan Keamanan Testing Local

- Password default database: `hk_nova_dev_pass`
- Encryption key di `.env.office` dan `.env.home` diset ke key development. **Jangan pakai key ini di server produksi**.
- Credential device (SSH/SNMP) disimpan terenkripsi di database menggunakan `ENCRYPTION_KEY`.
