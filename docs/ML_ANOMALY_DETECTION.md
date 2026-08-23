# ML Anomaly Detection - HK-NOVA

## Overview

HK-NOVA menggunakan **Ensemble Machine Learning** (Isolation Forest + LOF + Statistical + DBSCAN) untuk mendeteksi anomali pada metrics perangkat network secara otomatis dengan akurasi tinggi dan explainability penuh.

## Arsitektur Sistem

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        HK-NOVA ML Anomaly Detection                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────────┐  │
│  │   Data Sources   │───▶│  Feature Eng.    │───▶│   Ensemble Engine    │  │
│  │  - ICMP (ping)   │    │  - 33 Features   │    │  - Isolation Forest  │  │
│  │  - SNMP (cpu,    │    │  - Temporal      │    │  - LOF               │  │
│  │    mem, traffic) │    │  - Rolling Stats │    │  - Statistical       │  │
│  │  - Historical    │    │  - Network QA    │    │  - DBSCAN            │  │
│  │    (7 days)      │    │  - Device Context│    │  - LSTM Forecasting  │  │
│  └──────────────────┘    └──────────────────┘    └──────────┬───────────┘  │
│                                                              │              │
│                          ┌───────────────────────────────────┘              │
│                          ▼                                                  │
│              ┌──────────────────────────────────────────────────┐          │
│              │              Voting & Severity                    │          │
│              │  - Weighted Ensemble Score                       │          │
│              │  - Percentile-based Severity (p90/p95/p99)       │          │
│              │  - Explainability (Feature Contribution)          │          │
│              └──────────────────────┬───────────────────────────┘          │
│                                     │                                      │
│                    ┌────────────────┼────────────────┐                   │
│                    ▼                ▼                ▼                   │
│            ┌─────────────┐  ┌──────────────┐  ┌─────────────┐           │
│            │   Alerts    │  │ Notifications│  │  Dashboard  │           │
│            │  (HIGH/     │  │ (Telegram,   │  │ (Charts,    │           │
│            │  CRITICAL)  │  │  Email, etc) │  │  Detail,    │           │
│            └─────────────┘  └──────────────┘  │  Real-time) │           │
│                                               └─────────────┘           │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │                    Advanced ML Worker (Separate Process)              │  │
│  │  - LSTM Training (6h)  - Risk Forecasting (30m)  - Correlation (2h)  │  │
│  │  - Auto-tuning (Weekly) - Cleanup (Daily)                            │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Feature Engineering (33 Features)

| Kategori | Features | Deskripsi |
|----------|----------|-----------|
| **Base Metrics** (5) | latency, cpu, memory, ifInOctets, ifOutOctets | Raw metrics dari ICMP & SNMP |
| **Temporal** (6) | hourOfDay, dayOfWeek, isWeekend, isBusinessHours, isNightTime, monthOfYear | Konteks waktu untuk seasonal patterns |
| **Rate of Change** (5) | latencyDelta, cpuDelta, memoryDelta, inOctetsDelta, outOctetsDelta | Delta vs 5 menit sebelumnya |
| **Rolling Stats** (10) | mean/std 15m/1h, min/max 15m per metric | Statistical context per window |
| **Network QA** (5) | packetLossRate, errorRate, bandwidthUtilization, jitter, availability | Kualitas jaringan |
| **Device Context** (2) | deviceTypeEncoded, locationEncoded | Embedding kategorikal |

## Ensemble Algorithms

| Algoritma | Weight | Keunggulan | Use Case |
|-----------|--------|------------|----------|
| **Isolation Forest** | 35% | Tree-based isolation, cepat, scalable | General anomalies |
| **LOF** | 25% | Density-based, deteksi local outliers | Point anomalies di region padat |
| **Statistical** | 25% | Z-score, IQR, MAD - interpretabel | Threshold-based, extreme values |
| **DBSCAN** | 15% | Clustering-based, noise detection | Global outliers, sparse regions |

### Voting Mechanism
- **Final Score**: Weighted average dari semua algoritma
- **Anomaly Decision**: ≥50% algoritma agree DAN score > 0.4
- **Confidence**: Persentase algoritma yang agree
- **Severity**: Berdasarkan finalScore + confidence

## Severity Classification (Percentile-based)

| Posisi vs Training | Severity | Action | Ensemble Rule |
|--------------------|----------|--------|---------------|
| < p90 | LOW | Log only | Score < 0.4 |
| p90 – p95 | MEDIUM | Log only | Score 0.4-0.65, confidence < 0.5 |
| p95 – p99 | HIGH | Alert + Notification | Score 0.65-0.8, confidence ≥ 0.5 |
| ≥ p99 | CRITICAL | Alert + Notification | Score ≥ 0.8, confidence ≥ 0.75 |

> Fallback (tanpa model): threshold absolut `0.7` (HIGH) dan `0.85` (CRITICAL).

## Model Persistence & Versioning

- **Database Storage**: Model disimpan di tabel `AnomalyModel` (JSON serialized)
- **Versioning**: Auto-increment version per device
- **Auto-load**: Worker memuat model aktif dari DB saat startup
- **Retraining**: Otomatis setiap 24 jam atau saat model expired

## Explainability (Root Cause Analysis)

- **Ablation-based**: Mengukur kontribusi setiap feature dengan menghapusnya
- **Top 5 Contributors**: Feature dengan kontribusi tertinggi
- **Deviation (σ)**: Seberapa jauh value dari normal (dalam standar deviasi)
- **Recommendation**: Actionable insight otomatis

Contoh Output:
```
Summary: "Anomaly driven by cpu, memory, latency"
Top Contributors:
  1. cpu: value=95%, normal=35%, deviation=4.2σ, contribution=42%, HIGH
  2. memory: value=88%, normal=45%, deviation=2.8σ, contribution=28%, HIGH
Recommendation: "Investigate CPU-intensive processes"
```

## Feedback Loop & Active Learning

- **Feedback Types**: TRUE_POSITIVE, FALSE_POSITIVE, UNKNOWN, EXPECTED_BEHAVIOR
- **Tags**: ["maintenance", "expected", "known-issue"]
- **Auto-retraining**: Weekly job exclude FALSE_POSITIVE samples
- **Adaptive Thresholds**: Adjust p95/p99 based on false positive rate

## Device-Type Specific Models

| Device Type | nTrees | maxSamples | contamination | minSamples |
|-------------|--------|------------|---------------|------------|
| ROUTER | 150 | 512 | 0.05 | 50 |
| SWITCH | 100 | 256 | 0.03 | 50 |
| OLT | 120 | 384 | 0.04 | 50 |
| AP | 80 | 200 | 0.05 | 40 |
| SERVER | 150 | 512 | 0.02 | 50 |

## Advanced Features (Phase 4)

### LSTM Time-Series Forecasting
- **Lookback**: 60 timesteps (5 jam)
- **Horizon**: 12 steps (1 jam ke depan)
- **Architecture**: 2 LSTM layers (64→32) + Dense
- **Targets**: latency, cpu, memory
- **Anomaly via**: Prediction error (MAE)

### Anomaly Correlation Engine
- **Pairwise Correlation**: Time-windowed (30 min max)
- **Pattern Types**: Cascade, Co-occurrence, Periodic, Dependency
- **Device Graph**: Nodes/Edges/Clusters untuk visualisasi
- **Next Anomaly Prediction**: Berdasarkan pattern historis

### Risk Forecasting (1-hour ahead)
- **Binary Classification**: Anomaly in next 60 min?
- **Features**: Multi-window stats (5m, 15m, 30m, 60m) + temporal
- **Class Balancing**: Undersampling negative class (1:5 ratio)
- **Risk Levels**: LOW/MEDIUM/HIGH/CRITICAL dengan recommended actions

### Auto-tuning (Weekly)
- **Search**: Random search over hyperparameter space
- **CV**: 3-fold time-series cross-validation
- **Metrics**: F1 / Precision / Recall / Accuracy
- **Space**: IF params, LOF k, Stat thresholds, DBSCAN eps/minPts, Ensemble weights

## API Endpoints

### Anomaly Management
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/anomalies` | GET | User | List anomalies dengan filter/pagination |
| `/api/anomalies` | DELETE | Admin | Hapus anomaly record |
| `/api/anomalies/inject` | POST | Admin | Inject synthetic anomaly untuk testing |
| `/api/anomalies/[id]` | GET | User | Detail anomaly (via dashboard) |

### Explainability & Feedback
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/anomalies/explain` | GET | User | Detail explanation, related anomalies, score history |
| `/api/anomalies/feedback` | POST/GET | User | Submit & retrieve feedback |

### Model Management
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/anomalies/models` | GET/DELETE | Admin | Model performance monitoring |

### Advanced ML
| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/anomalies/correlations` | GET/POST | User | Pattern analysis, graph, prediction |
| `/api/anomalies/risk` | GET/POST | User | Risk prediction, training, bulk scoring |
| `/api/anomalies/tuning` | GET/POST | Admin | Hyperparameter tuning status & execution |
| `/api/anomalies/stream` | GET | User | Real-time SSE stream HIGH/CRITICAL anomalies |

## Workers

### Main Anomaly Detector (`anomaly-detector.ts`)
- **Schedule**: Every 5 minutes (`*/5 * * * *`)
- **Process**: Load ensemble → Score latest → Save anomaly → Create alert → Notify
- **Cache**: Ensemble models per device (24h TTL)

### Advanced ML Worker (`advanced-ml-worker.ts`)
| Task | Schedule | Description |
|------|----------|-------------|
| LSTM Training | `0 */6 * * *` (6h) | Train LSTM per device |
| Risk Forecasting | `*/30 * * * *` (30m) | Predict 1h risk per device |
| Correlation Analysis | `0 */2 * * *` (2h) | Discover patterns |
| Auto-tuning | `0 3 * * 0` (Sun 3AM) | Weekly hyperparameter optimization |
| Cleanup | `0 4 * * *` (Daily 4AM) | Expire old predictions, dispose models |

## Environment Variables

```env
# Core Anomaly Detection
ANOMALY_TRAINING_DAYS=7              # Historical training window
ANOMALY_MIN_SAMPLES=50               # Minimum training samples
ANOMALY_POLL_INTERVAL="*/5 * * * *"  # Worker cron schedule

# Feature Engineering
ANOMALY_LOOKBACK_WINDOW=60           # LSTM lookback (timesteps)
ANOMALY_FORECAST_HORIZON=12          # LSTM/forecast horizon (steps)

# Severity Thresholds (fallback)
ANOMALY_SCORE_THRESHOLD_HIGH=0.7
ANOMALY_SCORE_THRESHOLD_CRITICAL=0.85

# Alert & Notification
ANOMALY_ALERT_COOLDOWN_MS=600000     # 10 minutes
ANOMALY_MODEL_RETRAIN_HOURS=24       # Model retrain interval
```

## Dashboard Features

### Main Dashboard (`/dashboard/anomalies`)
- **View Modes**: Table ↔ Charts toggle
- **Charts**: Timeline (24h), Severity Pie, Device Type Bar, Heatmap (Device×Hour)
- **Stats Cards**: Total 24h, Critical, High, Devices Affected
- **Live Counter**: Unread HIGH/CRITICAL badge
- **Real-time Toasts**: Slide-in notifications untuk HIGH/CRITICAL
- **Filters**: Device, Severity, Pagination

### Detail Page (`/dashboard/anomalies/[id]`)
- **Root Cause**: Top contributing features bar chart
- **Algorithm Votes**: Visual breakdown per algorithm
- **All Features Table**: Value, Normal, Deviation (σ), Contribution %, Severity
- **Score History**: Last 50 anomaly scores trend line
- **Related Anomalies**: ±30 min window across devices
- **Feedback Buttons**: True Positive / False Positive / Expected
- **Device Context**: Full device info panel

## Installation & Setup

### 1. Database Migration
```bash
pnpm prisma db push
# atau
pnpm db:migrate
```

### 2. Start Workers
```bash
# Development
pnpm worker:anomaly
pnpm worker:advanced-ml

# Production (PM2)
pm2 start ecosystem.config.js
# atau spesifik:
pm2 start ecosystem.config.js --only hk-nova-anomaly-worker
pm2 start ecosystem.config.js --only hk-nova-advanced-ml-worker
```

### 3. Verify Installation
1. Dashboard: `http://localhost:3000/dashboard/anomalies`
2. Worker Status: `http://localhost:3000/dashboard` → System Worker Status
3. Logs: `pm2 logs hk-nova-anomaly-worker hk-nova-advanced-ml-worker`

## Testing

### Automated Integration Test
```bash
pnpm test:anomaly
```

### Unit Tests
```bash
pnpm vitest run
```

### Manual Test: Inject Anomaly
```bash
curl -X POST http://localhost:3000/api/anomalies/inject \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"deviceId": "xxx", "metricType": "cpu", "value": 150}'
```

### Submit Feedback
```bash
curl -X POST http://localhost:3000/api/anomalies/feedback \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"anomalyId": "xxx", "feedback": "FALSE_POSITIVE", "comment": "Scheduled maintenance"}'
```

## Performance Optimization

### Database Indexes
```sql
-- Anomaly queries
CREATE INDEX idx_anomaly_device_time ON Anomaly(deviceId, timestamp DESC);
CREATE INDEX idx_anomaly_severity_time ON Anomaly(severity, timestamp DESC);
CREATE INDEX idx_anomaly_explanation ON Anomaly USING GIN (explanation);

-- Metric partitioning (MySQL 8+)
ALTER TABLE Metric PARTITION BY RANGE (YEAR(timestamp)) (
  PARTITION p2024 VALUES LESS THAN (2025),
  PARTITION p2025 VALUES LESS THAN (2026),
  PARTITION pmax VALUES LESS THAN MAXVALUE
);
```

### Caching Strategy
- **Redis**: Model cache (TTL 24h), Rolling stats (TTL 1h), Recent anomalies (TTL 5m)
- **In-memory**: Worker-level ensemble cache (Map per device)
- **Batch inserts**: Anomaly saves batched per cycle

### Query Optimization
- Window functions untuk rolling stats (single query vs N queries)
- Connection pooling (Prisma default)
- Parallel device processing (concurrency: 5)

## Monitoring & Observability

### Metrics Endpoint
- `/api/anomalies/models` - Active model performance
- Worker logs - Cycle time, devices processed, errors

### Key Metrics
| Metric | Target | Alert If |
|--------|--------|----------|
| Cycle Time | < 30s (100 devices) | > 60s |
| Model Load Time | < 5s | > 15s |
| False Positive Rate | < 10% | > 20% |
| Precision | > 85% | < 80% |
| Recall | > 90% | < 85% |

### Admin Dashboard
- Real-time worker status
- Model performance trends
- Anomaly volume by severity
- Feedback statistics

## Troubleshooting

### "Model training failed"
**Cause**: < 50 samples in 7 days
**Fix**: 
1. Ensure ICMP/SNMP workers running 7+ days
2. Seed data: `pnpm test:anomaly`
3. Check device type has correct config

### "No anomalies detected"
**Causes**:
1. Data too normal → Inject synthetic anomaly
2. Threshold too high → Lower env vars
3. Model not trained → Check worker logs

### "High false positive rate"
**Fixes**:
1. Mark false positives via feedback API
2. Wait for weekly auto-tuning
3. Manually trigger tuning: `POST /api/anomalies/tuning`

### "LSTM training fails"
**Fixes**:
1. Need 300+ samples for LSTM
2. Check TensorFlow.js node bindings: `pnpm approve-builds @tensorflow/tfjs-node`
3. Increase memory: `max_memory_restart: '2G'` in ecosystem.config.js

### "Worker STOPPED"
```bash
pm2 restart hk-nova-anomaly-worker hk-nova-advanced-ml-worker
pm2 logs hk-nova-anomaly-worker hk-nova-advanced-ml-worker
```

## Database Schema Summary

```prisma
model Anomaly {
  id                  String   @id @default(cuid())
  deviceId            String
  metricType          String
  timestamp           DateTime @default(now())
  anomalyScore        Float
  severity            AnomalySeverity
  
  // Phase 2+ fields
  explanation         Json?    // {summary, topContributors, recommendation}
  contributingFeatures Json?   // FeatureContribution[]
  confidence          Float?   // Ensemble confidence
  algorithmVotes      Json?    // {algo: {score, isAnomaly}}
  
  autoResolved        Boolean  @default(false)
  resolvedAt          DateTime?
  feedback            AnomalyFeedback?
  
  @@index([deviceId, timestamp])
  @@index([severity])
}

model AnomalyModel {
  id            String   @id @default(cuid())
  deviceId      String?
  deviceType    String?
  modelData     Json     // Serialized forest
  algorithm     String   @default("ENSEMBLE")
  version       Int      @default(1)
  trainedAt     DateTime @default(now())
  trainingSize  Int
  featureNames  Json
  stats         Json     // {mean, std}
  scoreStats    Json     // {p90, p95, p99}
  performance   Json?
  hyperParams   Json?
  isActive      Boolean  @default(true)
  @@index([deviceId, isActive])
}

model AnomalyFeedback {
  id        String      @id @default(cuid())
  anomalyId String      @unique
  anomaly   Anomaly     @relation(fields: [anomalyId], references: [id])
  feedback  FeedbackType
  userId    String
  user      User        @relation(fields: [userId], references: [id])
  comment   String?
  tags      Json?
  createdAt DateTime    @default(now())
}

model CorrelationPattern {
  id          String   @id @default(cuid())
  pattern     String   @unique
  devices     Json
  support     Float
  confidence  Float
  timeWindow  Int
  occurrences Int      @default(1)
  lastSeen    DateTime
  patternType String
  metadata    Json
}

model AnomalyRiskPrediction {
  id            String   @id @default(cuid())
  deviceId      String
  riskScore     Float
  riskLevel     String
  predictedAt   DateTime
  horizon       Int
  actualAnomaly Boolean?
  validatedAt   DateTime?
}
```

## References

- **Isolation Forest**: Liu, Ting, Zhou (2008) - "Isolation Forest"
- **LOF**: Breunig et al. (2000) - "LOF: Identifying Density-Based Local Outliers"
- **DBSCAN**: Ester et al. (1996) - "A Density-Based Algorithm for Discovering Clusters"
- **LSTM**: Hochreiter & Schmidhuber (1997) - "Long Short-Term Memory"
- **Libraries**: `isolation-forest@0.0.9`, `@tensorflow/tfjs-node@4.22`, `recharts@2.10`

## Support

1. Logs: `pm2 logs hk-nova-anomaly-worker hk-nova-advanced-ml-worker`
2. Database: `pnpm db:studio` → `Anomaly`, `AnomalyModel`, `AnomalyFeedback`, `CorrelationPattern`, `AnomalyRiskPrediction`
3. Tests: `pnpm test:anomaly` / `pnpm vitest run`
4. Documentation: `/docs/ML_ANOMALY_DETECTION.md`, `/docs/ARCHITECTURE.md`

---

**HK-NOVA ML Anomaly Detection v2.0** - Ensemble-powered, Explainable, Self-tuning