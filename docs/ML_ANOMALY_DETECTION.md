# ML Anomaly Detection - HK-NOVA

## Overview

HK-NOVA menggunakan **Isolation Forest**, sebuah algoritma machine learning unsupervised, untuk mendeteksi anomali pada metrics perangkat network secara otomatis.

## Cara Kerja

### 1. Training Model

Model dilatih menggunakan data historis 7 hari terakhir dari setiap device:

- **Minimum data**: 50 samples per device
- **Features**: latency, CPU%, memory%, ifInOctets, ifOutOctets (di-bucket ke 5 menit)
- **Normalization**: Z-score normalization (mean=0, std=1)
- **Algorithm**: Isolation Forest (100 trees, subsampling 256)
- **Retraining**: Otomatis setiap 24 jam (cache in-memory)

### 2. Anomaly Detection

Worker `anomaly-detector` berjalan setiap 5 menit:

1. Load metrics terbaru (5 menit terakhir)
2. Extract features (group bucket 5 menit: latency + cpu + mem + traffic)
3. Normalize menggunakan stats dari training
4. Predict anomaly score (0-1, higher = lebih anomali)
5. Classify severity **secara relatif** terhadap distribusi skor training

### 3. Severity Classification

Library `isolation-forest@0.0.9` menghasilkan skor absolut yang terkompresi
(~0.3–0.6), sehingga threshold absolut tidak andal. Karena itu klasifikasi
severity memakai **persentil distribusi skor data training**:

| Posisi vs Training | Severity | Action |
|--------------------|----------|--------|
| < p90 | LOW | Log only |
| p90 – p95 | MEDIUM | Log only |
| p95 – p99 | HIGH | Create alert + notification |
| ≥ p99 | CRITICAL | Create alert + notification |

> Fallback (tanpa model / data cukup): threshold absolut `0.7` (HIGH) dan `0.85` (CRITICAL).

### 4. Alert Integration

Anomaly dengan severity HIGH/CRITICAL otomatis:

- Membuat Alert dengan type `ANOMALY_DETECTED`
- Cooldown 10 menit per device+metricType
- Dispatch notification ke semua channel aktif (Telegram/Email/Webhook/SMS)
- Support maintenance window suppression

## Instalasi & Setup

### 1. Database Migration

Schema `Anomaly` dan enum sudah tersedia. Jika belum apply:

```bash
pnpm db:migrate
```

### 2. Environment Variables (Optional)

Tambahkan di `.env` untuk customize:

```env
# Anomaly Detection Settings (optional)
ANOMALY_TRAINING_DAYS=7              # Minimum historical data
ANOMALY_MIN_SAMPLES=50               # Minimum samples untuk training
ANOMALY_POLL_INTERVAL="*/5 * * * *"  # Cron: setiap 5 menit
ANOMALY_SCORE_THRESHOLD_HIGH=0.7     # Fallback HIGH (tanpa model)
ANOMALY_SCORE_THRESHOLD_CRITICAL=0.85 # Fallback CRITICAL (tanpa model)
```

### 3. Jalankan Worker

**Development:**

```bash
pnpm worker:anomaly
```

**Production (PM2):**

```bash
pnpm pm2:start
# atau spesifik:
pm2 start ecosystem.config.js --only hk-nova-anomaly-worker
```

## Testing

### 1. Automated Test

Jalankan test script untuk verifikasi end-to-end:

```bash
pnpm test:anomaly
```

Script ini akan:
- Check device dengan data historis cukup
- Generate synthetic metrics jika perlu
- Inject anomaly via API
- Verify anomaly tersimpan
- Check alert created

### 2. Manual Test: Inject Synthetic Anomaly

**Via API:**

```bash
curl -X POST http://localhost:3000/api/anomalies/inject \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "device-id-here",
    "metricType": "cpu",
    "value": 150
  }'
```

**Via UI:**

Belum ada tombol inject di UI (future enhancement). Gunakan API langsung atau buat custom script.

### 3. Verifikasi

1. **Check Anomalies Dashboard:**
   ```
   http://localhost:3000/dashboard/anomalies
   ```

2. **Check Alerts:**
   ```
   http://localhost:3000/dashboard/alerts
   ```
   Filter by type: `ANOMALY_DETECTED`

3. **Check Worker Status:**
   ```
   http://localhost:3000/dashboard
   ```
   Lihat "System Worker Status" → anomaly-detector harus RUNNING

4. **Check Logs:**
   ```bash
   pm2 logs hk-nova-anomaly-worker
   ```

## API Endpoints

### GET `/api/anomalies`

Ambil daftar anomali dengan filter dan pagination.

**Query Params:**
- `deviceId` (optional): Filter by device
- `severity` (optional): LOW | MEDIUM | HIGH | CRITICAL
- `startDate` (optional): ISO date
- `endDate` (optional): ISO date
- `page` (default: 1)
- `limit` (default: 50)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "...",
      "deviceId": "...",
      "device": { "name": "...", "ip": "..." },
      "metricType": "cpu",
      "anomalyScore": 0.87,
      "severity": "CRITICAL",
      "timestamp": "2026-08-19T10:00:00Z"
    }
  ],
  "pagination": { ... }
}
```

### POST `/api/anomalies/inject`

Inject synthetic anomaly untuk testing (Admin only).

**Body:**
```json
{
  "deviceId": "xxx",
  "metricType": "cpu",
  "value": 150
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "anomaly": { ... },
    "alert": { ... } // null jika severity < HIGH
  }
}
```

### DELETE `/api/anomalies?id=xxx`

Hapus anomaly record (Admin only).

## Troubleshooting

### "Model training failed"

**Penyebab:** Data historis kurang dari 50 samples dalam 7 hari.

**Solusi:**
1. Pastikan ICMP/SNMP worker sudah berjalan minimal 7 hari
2. Atau seed historical data manual:
   ```bash
   pnpm test:anomaly  # Script ini auto-generate 200 samples
   ```

### "No anomalies detected"

**Kemungkinan:**
1. Data terlalu normal (variasi rendah) → Isolation Forest perlu anomali real
2. Training data kurang diverse
3. Threshold terlalu tinggi

**Solusi:**
1. Inject synthetic anomaly: `POST /api/anomalies/inject`
2. Tunggu 7 hari untuk data lebih diverse
3. Turunkan threshold di `.env`: `ANOMALY_SCORE_THRESHOLD_HIGH=0.6`

### "Worker status: STOPPED"

**Penyebab:** Worker belum running atau crash.

**Solusi:**
```bash
# Development
pnpm worker:anomaly

# Production
pm2 restart hk-nova-anomaly-worker
pm2 logs hk-nova-anomaly-worker  # Check error
```

### "Alert not created"

**Penyebab:** Severity LOW/MEDIUM tidak trigger alert.

**Solusi:** Alert hanya dibuat untuk HIGH/CRITICAL. Check di `/dashboard/anomalies` untuk semua severity.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Anomaly Detector Worker                   │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 1. Fetch active devices                                │  │
│  │ 2. For each device:                                    │  │
│  │    - Check/train Isolation Forest model               │  │
│  │    - Fetch latest metrics (5min)                      │  │
│  │    - Extract & normalize features                     │  │
│  │    - Predict anomaly score                            │  │
│  │    - Save to Anomaly table if score ≥ 0.5            │  │
│  │    - Create Alert if score ≥ 0.7                     │  │
│  │    - Dispatch notifications (Telegram/Email/etc)      │  │
│  │ 3. Sleep 5 minutes, repeat                            │  │
│  └────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
                  ┌───────────────┐
                  │ MySQL Database│
                  │ - Metric      │
                  │ - Anomaly     │
                  │ - Alert       │
                  └───────────────┘
                          │
                          ▼
                  ┌───────────────┐
                  │  UI Dashboard │
                  │ /anomalies    │
                  └───────────────┘
```

## Limitations (MVP)

1. **No model persistence**: Model di-cache in-memory, hilang saat restart → re-train otomatis
2. **No hyperparameter tuning**: Contamination & trees fixed
3. **No feature importance**: Tidak ada explainability "why anomaly detected"
4. **No feedback loop**: Tidak ada mechanism untuk mark false positive
5. **Single model per device**: Tidak ada model spesifik per device type

## Future Enhancements

1. **Model persistence**: Save trained model ke database/file untuk reuse
2. **UI inject button**: Tombol manual inject di dashboard untuk demo
3. **Auto-tuning**: Dynamic adjust contamination berdasarkan false positive rate
4. **Explainability**: Show feature importance & contribution to score
5. **Multi-model**: Separate model untuk Router, OLT, Switch
6. **Metrics**: Track precision/recall, false positive rate
7. **Feedback**: Admin bisa mark anomaly sebagai "expected" → retrain

## References

- **Isolation Forest Paper**: Liu, Ting, Zhou (2008) - "Isolation Forest"
- **Library**: `isolation-forest@0.0.9` (JavaScript pure implementation)
- **Algorithm**: Unsupervised anomaly detection via tree-based isolation
- **Complexity**: O(n log n) training, O(log n) prediction

## Support

Untuk pertanyaan atau issue:
1. Check logs: `pm2 logs hk-nova-anomaly-worker`
2. Check database: `pnpm db:studio` → tabel `Anomaly` & `Alert`
3. Run test: `pnpm test:anomaly`
4. Contact maintainer

---

**HK-NOVA ML Anomaly Detection** - Powered by Isolation Forest
