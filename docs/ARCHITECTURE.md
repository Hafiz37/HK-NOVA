# HK-NOVA ML Anomaly Detection - Architecture Document

## System Overview

This document describes the complete architecture of the ML-powered anomaly detection system in HK-NOVA, covering all 4 phases of implementation.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              HK-NOVA ML ANOMALY DETECTION                              │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │                           DATA INGESTION LAYER                                │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐  ┌───────────────┐  │   │
│  │  │ ICMP Worker │  │ SNMP Worker │  │ Historical Data  │  │ Manual Inject │  │
│  │  │ (5min poll) │  │ (5min poll) │  │ (7 days window)  │  │ (API / UI)    │  │
│  │  └─────────────┘  └─────────────┘  └──────────────────┘  └───────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────────────────┘   │
                                      │                                                │
                                      ▼                                                │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │                        FEATURE ENGINEERING LAYER                               │   │
│  │  • 5-min bucketing (ICMP + SNMP merge)                                        │   │
│  │  • 33 Features: Base(5) + Temporal(6) + Delta(5) + Rolling(10) + Net(5) + Ctx(2)│   │
│  │  • Z-score normalization (persisted stats)                                    │   │
│  └──────────────────────────────────────────────────────────────────────────────┘   │
                                      │                                                │
                    ┌───────────────┼───────────────┐                                │
                    ▼               ▼               ▼                                │
        ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐                 │
        │  MAIN WORKER    │ │  ADVANCED ML    │ │   API LAYER     │                 │
        │ (anomaly-detector│ │  WORKER         │ │  (Next.js API)  │                 │
        │  every 5 min)   │ │ (advanced-ml-   │ │                 │                 │
        │                 │ │  worker)        │ │  • Anomalies    │                 │
        │ • Load Ensemble │ │                 │ │  • Explain      │                 │
        │ • Score Latest  │ │ • LSTM (6h)     │ │  • Feedback     │                 │
        │ • Save Anomaly  │ │ • Forecast(30m) │ │  • Correlations │                 │
        │ • Create Alert  │ │ • Correlation(2h)│ │  • Risk         │                 │
        │ • Notify        │ │ • Auto-tune(1w) │ │  • Tuning       │                 │
        │ • Cache (24h)   │ │ • Cleanup(24h)  │ │  • Models       │                 │
        │                 │ │                 │ │  • SSE Stream   │                 │
        └────────┬────────┘ └────────┬────────┘ └────────┬────────┘                 │
                 │                   │                   │                          │
                 ▼                   ▼                   ▼                          │
        ┌──────────────────────────────────────────────────────────────────────┐   │
        │                         DATABASE LAYER (MySQL)                        │   │
        │  ┌─────────┐ ┌────────────┐ ┌────────────┐ ┌──────────────────────┐  │   │
        │  │ Metric  │ │  Anomaly   │ │AnomalyModel│ │ AnomalyFeedback     │  │   │
        │  └─────────┘ └────────────┘ └────────────┘ └──────────────────────┘  │   │
        │  ┌────────────────┐ ┌──────────────────┐ ┌────────────────────────┐  │   │
        │  │ CorrelationPat.│ │AnomalyRiskPred.  │ │ MaintenanceWindow    │  │   │
        │  └────────────────┘ └──────────────────┘ └────────────────────────┘  │   │
        └──────────────────────────────────────────────────────────────────────┘   │
                                      │                                            │
                                      ▼                                            │
        ┌──────────────────────────────────────────────────────────────────────┐   │
        │                        PRESENTATION LAYER                              │   │
        │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐  │   │
        │  │Dashboard List│ │ Detail Page  │ │ Real-time    │ │ Admin      │  │
        │  │ (Table/Chart)│ │ (Explain/    │ │ Toasts/SSE   │ │ Monitoring │  │
        │  │              │ │  Feedback)   │ │              │ │            │  │
        │  └──────────────┘ └──────────────┘ └──────────────┘ └────────────┘  │   │
        └──────────────────────────────────────────────────────────────────────┘   │
                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. Data Ingestion Workers

#### ICMP Poller (`src/workers/icmp-poller.ts`)
- Polls devices via ICMP ping every 5 minutes
- Measures: latency (ms), packet loss (%)
- Stores in `Metric` table with `metricType: 'icmp'`

#### SNMP Poller (`src/workers/snmp-poller.ts`)
- Polls devices via SNMP every 5 minutes
- Measures: CPU%, Memory%, Interface counters (in/out octets, errors)
- Stores in `Metric` table with `metricType: 'snmp'`

### 2. Feature Engineering (`src/lib/feature-engineering.ts`)

**Pipeline:**
```
Raw Metrics → 5-min Buckets → Merge ICMP+SNMP → Derive 33 Features → Z-Score Normalize
```

**Feature Categories:**
| Index | Category | Features | Description |
|-------|----------|----------|-------------|
| 0-4 | Base | latency, cpu, memory, ifInOctets, ifOutOctets | Raw merged metrics |
| 5-10 | Temporal | hourOfDay, dayOfWeek, isWeekend, isBusinessHours, isNightTime, monthOfYear | Time context |
| 11-15 | Delta | latencyDelta, cpuDelta, memoryDelta, inOctetsDelta, outOctetsDelta | Rate of change |
| 16-25 | Rolling | mean/std 15m/1h, min/max 15m | Statistical context |
| 26-30 | Network QA | packetLossRate, errorRate, bandwidthUtilization, jitter, availability | Quality metrics |
| 31-32 | Device Context | deviceTypeEncoded, locationEncoded | Categorical embeddings |

**Normalization:** Z-score using training statistics (mean/std per feature), persisted with model.

### 3. Ensemble Engine (`src/lib/algorithms/ensemble-engine.ts`)

**Algorithm Weights:**
| Algorithm | Weight | Type | Strength |
|-----------|--------|------|----------|
| Isolation Forest | 0.35 | Tree-based | General anomalies, fast |
| LOF | 0.25 | Density-based | Local outliers |
| Statistical | 0.25 | Threshold-based | Extreme values, interpretable |
| DBSCAN | 0.15 | Clustering | Global outliers |

**Voting Logic:**
```typescript
// Weighted score
finalScore = Σ(algorithmScore × weight) / Σ(weights)

// Anomaly decision
isAnomaly = (agreementCount ≥ algorithms.length / 2) AND (finalScore > 0.4)

// Confidence
confidence = agreementCount / algorithms.length

// Severity
if (finalScore ≥ 0.8 && confidence ≥ 0.75) → CRITICAL
else if (finalScore ≥ 0.65 && confidence ≥ 0.5) → HIGH
else if (finalScore ≥ 0.4) → MEDIUM
else → LOW
```

**Explainability (Ablation):**
For each feature, measure score drop when feature replaced with normal value:
```
contribution = baseScore - scoreWithoutFeature
```

### 4. Main Anomaly Detector Worker (`src/workers/anomaly-detector.ts`)

**Schedule:** `*/5 * * * *` (every 5 minutes)

**Flow:**
```
pollCycle()
  → getActiveDevices()
  → for each device:
      → ensureModel()  // Load from cache/DB or train
      → extractLatestFeatures()  // Last 5-min bucket
      → predictWithEnsemble()  // Ensemble prediction
      → if severity ≥ HIGH:
          → saveAnomaly() with explanation
          → processAnomalyAlert()
          → dispatchNotifications()
      → else if LOW/MEDIUM:
          → resolveAnomalyAlert()
```

**Caching:**
- `modelCache`: Map<deviceId, TrainedModel> (Isolation Forest only)
- `ensembleCache`: Map<deviceId, EnsembleEngine>
- TTL: 24 hours (aligned with retrain interval)

### 5. Advanced ML Worker (`src/workers/advanced-ml-worker.ts`)

**Independent process with separate schedules:**

| Task | Cron | Description |
|------|------|-------------|
| LSTM Training | `0 */6 * * *` | Train LSTM per device (300+ samples) |
| Risk Forecasting | `*/30 * * * *` | Predict 1h anomaly risk |
| Correlation Analysis | `0 */2 * * *` | Discover patterns, build graph |
| Auto-tuning | `0 3 * * 0` | Weekly hyperparameter optimization |
| Cleanup | `0 4 * * *` | Expire predictions, dispose models |

**Key Integrations:**
- Uses same `extractAdvancedFeatures()` for consistency
- Shares `AnomalyModel` table for persistence
- Stores forecasts in `AnomalyRiskPrediction`
- Stores patterns in `CorrelationPattern`

### 6. LSTM Forecasting (`src/lib/algorithms/lstm.ts`)

**Architecture:**
```
Input: [batch, 60, 33]  // 60 timesteps, 33 features
  → LSTM(64, returnSeq=true) + Dropout(0.2)
  → LSTM(32, returnSeq=false) + Dropout(0.2)
  → Dense(32, relu)
  → Dense(12 × 3, linear)  // 12 steps × 3 targets (latency, cpu, memory)
  → Reshape([12, 3])
Output: [batch, 12, 3]  // Predicted next 12 steps for 3 targets
```

**Training:**
- Loss: MSE
- Optimizer: Adam (lr=0.001)
- Epochs: 30 (configurable)
- Validation split: 0.2

**Anomaly Detection:**
- Predict next 12 steps
- Compare with actuals (when available)
- MAE per timestep → anomaly score

### 7. Correlation Engine (`src/lib/algorithms/correlation.ts`)

**Pairwise Correlation:**
```
For each anomaly pair (A, B) within 30-min window:
  correlation = 0
  if same metricType: +0.3
  if same severity: +0.2
  if related device types: +0.25
  timeProximity = max(0, 1 - timeDiff/1800) × 0.25
  
  patternType = cascade (if timeDiff < 5min) 
              | cooccurrence (if timeDiff < 1min)
              | dependency (if related types)
```

**Pattern Mining:**
- Group correlations by signature: `srcType_srcMetric_tgtType_tgtMetric_patternType`
- Minimum support: 5%, confidence: 30%, occurrences: 3
- Output: `CorrelationPattern` with metadata (avgTimeDiff, directionality)

**Graph Building:**
- Nodes: Devices with anomaly counts
- Edges: Normalized correlation weights
- Clusters: Connected components

### 8. Risk Forecasting (`src/lib/algorithms/forecasting.ts`)

**Features per timestep:**
- Multi-window stats (5m, 15m, 30m, 60m): mean, std, min, max per base feature
- Current values (5 base features)
- Temporal: hour, dayOfWeek, isBusinessHours
- Total: ~20×4 + 5 + 3 = 88 features

**Model:**
```
Input: [batch, 88]
  → Dense(128, relu) + Dropout(0.3) + L2
  → Dense(64, relu) + Dropout(0.3) + L2
  → Dense(32, relu) + Dropout(0.2)
  → Dense(1, sigmoid)  // Binary: anomaly in next 60min?
```

**Class Balancing:** Undersample negative class to 1:5 ratio

**Output:** RiskScore (0-1) → RiskLevel + RecommendedActions

### 9. Auto-Tuner (`src/lib/algorithms/auto-tuner.ts`)

**Search Space:**
```javascript
{
  isolationForest: { nTrees: [50,100,150,200], maxSamples: [128,256,384,512], contamination: [0.01,0.03,0.05,0.1] },
  lof: { k: [10,15,20,25,30] },
  statistical: { zScoreThreshold: [2.5,3,3.5], iqrThreshold: [1.5,2,2.5], madThreshold: [3,3.5,4] },
  dbscan: { eps: [0.3,0.5,0.7,1.0], minPts: [3,5,7,10] },
  ensemble: { weights: [4 presets] }
}
```

**Evaluation:**
- 3-fold time-series CV
- Metric: F1 / Precision / Recall / Accuracy (configurable)
- Random search with timeout (default 30 min, 50 trials)

**Deployment:** Updates `AnomalyModel.hyperParams` for active models

## Database Schema Relationships

```
Device 1──∞ Anomaly
Device 1──∞ Metric
Device 1──∞ AnomalyModel
Device 1──∞ AnomalyRiskPrediction
Device 1──∞ AnomalyFeedback (via User)

Anomaly 1──1 AnomalyFeedback
Anomaly ∞──1 Device

AnomalyModel ∞──1 Device (optional)
CorrelationPattern  (standalone, references device IDs in JSON)
AnomalyRiskPrediction ∞──1 Device
```

## API Layer (Next.js App Router)

### Route Structure
```
src/app/api/anomalies/
├── route.ts              # GET (list), DELETE
├── inject/route.ts       # POST (synthetic anomaly)
├── stream/route.ts       # GET (SSE real-time)
├── explain/route.ts      # GET (detail + related + history)
├── feedback/route.ts     # POST (submit), GET (list)
├── models/route.ts       # GET (list), DELETE
├── correlations/route.ts # GET (patterns/graph), POST (reanalyze)
├── risk/route.ts         # GET (predict), POST (train)
└── tuning/route.ts       # GET (status), POST (tune/tune_all/weekly)
```

### Authentication
- `requireSession()` - Any authenticated user
- `requireRole(['ADMIN'])` - Admin only

## Dashboard (React + Next.js)

### Components
```
src/app/dashboard/anomalies/
├── page.tsx                    # Main dashboard (Table/Charts toggle)
└── [id]/page.tsx              # Detail page

src/components/dashboard/
├── AnomalyToasts.tsx          # Real-time toast notifications
├── AnomalyBadge.tsx           # Severity badge component

src/hooks/
├── useAnomalyStream.ts        # SSE hook + toast management
├── useSSE.ts                  # Base SSE hook
```

### Chart Library: Recharts
- AreaChart (Timeline 24h)
- PieChart (Severity distribution)
- BarChart (Device type)
- Custom Heatmap (HTML table with rgba)

## Deployment Configuration

### PM2 Ecosystem (`ecosystem.config.js`)
```javascript
apps: [
  // Web server
  { name: 'hk-nova-web', script: 'pnpm start', max_memory_restart: '1G' },
  
  // Data workers
  { name: 'hk-nova-icmp-worker', script: 'tsx src/workers/icmp-poller.ts' },
  { name: 'hk-nova-snmp-worker', script: 'tsx src/workers/snmp-poller.ts' },
  
  // ML workers
  { name: 'hk-nova-anomaly-worker', script: 'tsx src/workers/anomaly-detector.ts' },
  { name: 'hk-nova-advanced-ml-worker', script: 'tsx src/workers/advanced-ml-worker.ts', max_memory_restart: '2G' },
  
  // Other workers...
]
```

### Next.js Config (`next.config.ts`)
```typescript
{
  serverExternalPackages: [
    'net-ping', 'net-snmp', 'ssh2', 'raw-socket', 
    'pdfkit', 'exceljs', '@tensorflow/tfjs-node'
  ],
  turbopack: {
    resolveAlias: {
      '@tensorflow/tfjs-node': '@tensorflow/tfjs',
    },
  },
}
```

## Security Considerations

1. **Authentication**: All API routes require valid session
2. **Authorization**: Admin-only for destructive operations (DELETE, tuning, model management)
3. **Input Validation**: Zod schemas for all POST bodies
4. **Rate Limiting**: Implied via worker schedules (not per-request)
5. **Data Isolation**: Device-scoped queries, no cross-tenant leakage

## Scaling Considerations

### Horizontal Scaling
- **Main Worker**: Single instance (coordinates all devices)
- **Advanced ML Worker**: Single instance (CPU-intensive TensorFlow)
- **Pollers**: Can scale via batch partitioning (ICMP/SNMP batch size)

### Vertical Scaling
- **Memory**: Advanced ML worker needs 2GB+ for TensorFlow
- **CPU**: LSTM training benefits from multi-core
- **DB**: Connection pooling, read replicas for analytics

### Database Optimization
- Partition `Metric` table by month/year
- Composite indexes on `(deviceId, timestamp)`, `(severity, timestamp)`
- JSON indexes on `explanation`, `algorithmVotes` (MySQL 8+ GIN-like)

## Monitoring Endpoints

### Health Checks
- Worker status via `/dashboard` (System Worker Status panel)
- PM2 process monitoring: `pm2 monit`

### Key Metrics
| Component | Metric | Healthy Range |
|-----------|--------|---------------|
| Main Worker | Cycle time | < 30s for 100 devices |
| Advanced ML | LSTM train time | < 5 min per device |
| API | Response time | p95 < 200ms |
| DB | Query time | p95 < 100ms |
| Model | False positive rate | < 10% |
| Model | Precision | > 85% |
| Model | Recall | > 90% |

## Disaster Recovery

### Model Recovery
- Models persisted in `AnomalyModel` table
- Auto-load on worker restart (24h TTL)
- Fallback: Retrain from scratch (7-day data)

### Data Recovery
- `Metric` table: Partitioned, backup via standard MySQL tools
- `Anomaly*`: Small tables, full backup daily
- Point-in-time recovery via binlog

## Future Extensibility

### Planned Enhancements
1. **Online Learning**: Incremental model updates from feedback
2. **Multi-tenancy**: Organization-scoped models
3. **Federated Learning**: Edge device local training
4. **AutoML**: Neural architecture search for LSTM
5. **Streaming**: Kafka/Redis Streams for real-time pipeline
6. **GPU Support**: CUDA-enabled TensorFlow for faster LSTM

---

*Document Version: 2.0 | Last Updated: Phase 4 Complete | Architecture: Ensemble ML + LSTM + Correlation + Auto-tuning*