# HK-NOVA Architecture

## System Overview

HK-NOVA adalah platform NOC (Network Operations Center) yang terdiri dari 3 komponen utama:

### 1. Web Application (Next.js)
- **Frontend**: React-based UI dengan dark theme
- **Backend**: Next.js API Routes untuk REST API
- **Database**: Prisma ORM → MySQL

### 2. Background Workers (Node.js) — **Implemented**
- **ICMP Poller**: Monitoring ping status devices (✅ running)
- **SNMP Poller**: Monitoring traffic & interface statistics (✅ running)
- **Retention Worker**: Cleanup metric data >30 hari (✅ running)

### 3. Background Workers (Node.js) — **Planned / Not Yet Implemented**
- **Backup Scheduler**: Automated config backup via SSH
- **Anomaly Detector**: ML-based anomaly detection (Isolation Forest)

### 4. External Integrations
- **Telegram Bot**: Alert notifications (✅ implemented, optional)
- **Network Devices**: SSH, SNMP connections
- **OLT Equipment**: Provisioning via SSH (Huawei/ZTE/Generic) — *template only, execution planned*

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         Browser                              │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTPS
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    Next.js Application                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Dashboard   │  │  Monitoring  │  │ Provisioning │      │
│  │     UI       │  │      UI      │  │      UI      │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              API Routes (REST)                        │   │
│  │  /api/devices  /api/metrics  /api/alerts            │   │
│  └──────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   Prisma ORM Layer                           │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                      MySQL Database                          │
│  Tables: devices, credentials, metrics, backups,             │
│          provisioning_logs, anomalies, alerts                │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    Background Workers                        │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ ICMP Poller  │  │ SNMP Poller  │  │  Retention   │      │
│  │  (1 min)     │  │  (5 min)     │  │  (daily)     │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
│         │                  │                  │              │
│         └──────────────────┴──────────────────┘              │
│                            │                                 │
│         ┌──────────────────┴──────────────────┐              │
│         ▼                                     ▼              │
│  ┌──────────────────┐               ┌──────────────────┐    │
│  │  Backup          │               │  Anomaly         │    │
│  │  Scheduler       │               │  Detector (ML)   │    │
│  │  (planned)       │               │  (planned)       │    │
│  └──────────────────┘               └──────────────────┘    │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  Network Devices                             │
│  Routers, Switches, OLT, Firewalls                          │
│  (ICMP, SNMP v2c/v3, SSH)                                   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    Alert Channel                             │
│                  Telegram Bot API                            │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Monitoring Flow (Implemented)
```
Device → Worker (ping/SNMP) → Database → API → UI
                ↓
        Alert System → Telegram
```

### 2. Provisioning Flow (Planned — Dual Mode)
```
UI Form → API → Provisioning Service
                      ↓
             ┌────────┴────────┐
             ▼                 ▼
       Dry-Run Mode      Execution Mode
     (Preview Only)      (Real SSH)
             ↓                 ↓
        Show Commands    Execute on OLT
             ↓                 ↓
          Log DB          Log DB + Device
```

### 3. Backup Flow (Planned)
```
Scheduler (cron) → SSH Connection → Device
                         ↓
                    Get Config
                         ↓
                  Hash Comparison
                         ↓
            ┌────────────┴────────────┐
            ▼                         ▼
     Changed: Save to DB       Unchanged: Skip
            ↓
     Store with timestamp
     (version control)
```

### 4. Anomaly Detection Flow (Planned)
```
Historical Metrics (30 days)
         ↓
Feature Engineering
(latency, loss, utilization, errors)
         ↓
Train Isolation Forest Model
         ↓
Score New Metrics (0-1)
         ↓
Threshold Classification
(0.7=Low, 0.8=Medium, 0.9=High)
         ↓
Store Anomaly + Alert → Telegram
```

## Security Architecture

### Credential Storage
```
User Input → Encryption (AES-256) → Database (encrypted)
                                          ↓
                                   When Needed
                                          ↓
                                  Decrypt in Memory
                                          ↓
                                    Use & Discard
```

### OLT Provisioning Safety
```
Request → Template Selection → Command Generation
                                      ↓
                              Feature Flag Check
                                      ↓
                    ┌─────────────────┴─────────────────┐
                    ▼                                   ▼
         ENABLE_OLT_EXECUTION=false         ENABLE_OLT_EXECUTION=true
                    ▼                                   ▼
            Preview Only (Safe)                  Execute via SSH
                    ↓                                   ↓
              Log Command                    Log Command + Response
```

## Database Schema

### Core Tables
- **devices**: Device inventory
- **credentials**: Encrypted SNMP/SSH credentials
- **metrics**: Time-series monitoring data
- **backups**: Config backup versions
- **provisioning_logs**: Provisioning execution logs
- **anomalies**: ML-detected anomalies
- **alerts**: Alert lifecycle tracking
- **audit_logs**: System audit trail
- **users**: Operator accounts

### Indexes
- Device status & type
- Metric timestamp ranges
- Alert status & severity
- Anomaly severity

## Worker Architecture

### Process Management (PM2) — Actual
```
pm2 ecosystem.config.js
├── hk-nova-web (Next.js)
├── hk-nova-icmp-worker
├── hk-nova-snmp-worker
├── hk-nova-retention-worker
├── hk-nova-backup-worker      # planned (not implemented)
├── hk-nova-anomaly-worker     # planned (not implemented)
└── hk-nova-demo-generator     # dev only
```

### Worker Pattern
```typescript
// Shared worker pattern
cron.schedule(INTERVAL, async () => {
  const devices = await getActiveDevices();
  
  // Process in batches (10-20 parallel)
  const batches = chunk(devices, 20);
  
  for (const batch of batches) {
    await Promise.all(
      batch.map(device => processDevice(device))
    );
  }
});
```

## ML Anomaly Detection

### Isolation Forest Algorithm
```
Historical Metrics (30 days)
         ↓
Feature Engineering
(latency, loss, utilization, errors)
         ↓
Train Isolation Forest Model
         ↓
Score New Metrics (0-1)
         ↓
Threshold Classification
(0.7=Low, 0.8=Medium, 0.9=High)
         ↓
Store Anomaly + Alert
```

## Technology Stack Layers

```
┌─────────────────────────────────────┐
│         Presentation Layer          │
│  Next.js 16, React 19, Tailwind    │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│          Business Logic             │
│  Workers (ICMP, SNMP, Retention),   │
│  ML Engine (planned)                │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│          Data Access Layer          │
│    Prisma ORM, Encryption Lib       │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│           Data Storage              │
│          MySQL 8.0                  │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│      External Integrations          │
│  Network Devices, Telegram Bot      │
└─────────────────────────────────────┘
```

## Scalability Considerations

### Current Design (Single Server)
- Suitable for: 100-500 devices
- Workers run on same machine as web app
- MySQL on same or separate server

### Future Scaling (Multi-Server)
- Separate worker servers
- Load balancer for web app
- Redis for job queue
- Database replication
- Horizontal scaling of workers

## Monitoring & Observability

### Logs
- PM2 logs for each worker
- Next.js request logs
- Database query logs (slow queries)

### Metrics
- Worker execution time
- API response time
- Database connection pool
- Memory & CPU usage (PM2)

### Alerts
- Worker failures → Auto-restart (PM2)
- Database connection lost → Alert
- High memory usage → Alert

## Deployment Strategy

### Development
```
pnpm dev             # Next.js dev server
pnpm worker:icmp     # Individual workers
```

### Production
```
pnpm build           # Build Next.js
pm2 start ecosystem.config.js  # Start all services
```

### Database Migrations
```
pnpm db:migrate      # Development — create & apply migration
pnpm db:migrate:prod # Production — apply pending migrations
prisma migrate status # Check status
```

## Configuration Management

### Environment Variables (.env)
- Database connection
- Encryption keys
- Feature flags
- Worker intervals
- External API tokens

### OLT Templates (JSON)
- Vendor-specific commands
- Variable placeholders
- Action definitions

### SNMP OIDs (TypeScript)
- Standard MIB OIDs
- Vendor-specific OIDs
- Interface statistics OIDs
