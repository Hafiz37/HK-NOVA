# HK-NOVA Runbook

## Quick Start

### Development (All Workers + Web)
```bash
# Terminal 1 - Web server
pnpm dev

# Terminal 2 - All workers (ICMP + Demo Generator + SNMP + Backup + Anomaly + Retention)
pnpm dev:workers
```

### Individual Workers
```bash
pnpm worker:icmp       # ICMP poller for real devices (isDemo: false)
pnpm demo:generator    # Synthetic metrics for demo devices (isDemo: true)
pnpm worker:snmp       # SNMP poller for real devices
pnpm worker:retention  # Data retention cleanup
```

### Production (PM2)
```bash
pnpm build
pnpm pm2:start         # Starts web + all workers
pnpm pm2:logs          # View logs
pnpm pm2:status        # Check status
pnpm pm2:stop          # Stop all
```

---

## Architecture: Dual-Mode Monitoring

| Mode | Worker | Target Devices | Metric Source | Use Case |
|------|--------|----------------|---------------|----------|
| **Real** | `worker:icmp` | `isDemo: false` | `REAL` (actual ping) | Production monitoring |
| **Demo** | `demo:generator` | `isDemo: true` | `GENERATOR` (synthetic) | UI testing, demos, dev |

### Device Classification
- **Real devices** (`isDemo: false`): User-added devices, require network reachability
- **Demo devices** (`isDemo: true`): 18 pre-seeded devices with known behaviors:
  - `8.8.x.x`, `1.1.1.x`, `9.9.9.9`, `127.0.0.x` → **UP** (reachable)
  - `10.10.x.x` → **DOWN** (fictitious private IPs)

---

## Common Operations

### Seed Database
```bash
pnpm db:seed        # Core devices (3 real + credentials + SNMP history)
pnpm demo:seed      # 18 demo devices + 24h metrics + sample alerts
pnpm demo:reset     # Full reset: migrate + seed + demo:seed
```

### Toggle Demo Generator (Admin)
1. Go to `/dashboard/devices`
2. Toggle **⚡ Demo Generator** switch
3. Or via API: `POST /api/settings/demo-mode { "enabled": true }`

### Add Real Device
1. Go to `/dashboard/devices` → **Tambah Device**
2. Fill: Name, IP, Type, Vendor, Location
3. Device starts as `UNKNOWN` → becomes `UP`/`DOWN` after ICMP poller runs

### View Logs
```bash
# PM2 logs
pnpm pm2:logs hk-nova-icmp-worker
pnpm pm2:logs hk-nova-demo-generator

# Direct (development)
pnpm worker:icmp      # See ICMP poll cycles
pnpm demo:generator   # See synthetic metric generation
```

---

## Troubleshooting

### All Devices Show UNKNOWN
**Cause**: ICMP poller not running
```bash
pnpm worker:icmp      # Start in dev
# or
pnpm pm2:start        # Start in production
```

### Demo Devices Not Updating
**Cause**: Demo generator disabled
```bash
pnpm demo:generator   # Start in dev
# or enable in UI: /dashboard/devices → ⚡ Demo Generator toggle
```

### Real Device Stays UNKNOWN (Not Changing to UP/DOWN)
**Causes**:
1. ICMP poller not running → start it
2. IP not reachable from server → check firewall/network
3. Device in MAINTENANCE status → excluded from polling
4. Check logs: `pnpm pm2:logs hk-nova-icmp-worker`

### No Metrics in Charts
- Select a device in dropdown (Monitoring page)
- Check time range (1h/6h/24h/7d)
- Verify metric exists: `SELECT * FROM Metric WHERE deviceId='...' AND metricType='ICMP'`

---

## Configuration

### Environment Variables (`.env`)
```env
DATABASE_URL="mysql://user:pass@localhost:3306/hk_nova"
JWT_SECRET="your-secret-key"
TELEGRAM_BOT_TOKEN="..."       # Optional: alerts
TELEGRAM_CHAT_ID="..."         # Optional: alerts

# Polling intervals (cron format)
ICMP_POLL_INTERVAL="*/1 * * * *"        # Every minute
SNMP_POLL_INTERVAL="*/5 * * * *"        # Every 5 minutes
BACKUP_SCHEDULE="0 2 * * *"             # Daily 2 AM
ANOMALY_DETECTION_INTERVAL="*/10 * * * *" # Every 10 min
RETENTION_SCHEDULE="0 3 * * *"          # Daily 3 AM
```

### Key Constants (`src/lib/constants.ts`)
```typescript
ICMP_BATCH_SIZE = 20          # Devices per batch
ICMP_PING_RETRIES = 2         # Retries per ping
ICMP_PING_TIMEOUT = 3000      # ms per attempt
ICMP_ALERT_COOLDOWN_MS = 5*60*1000  # 5 min notification cooldown
```

---

## Monitoring Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/devices` | List devices with latest metrics |
| `GET /api/monitoring/summary` | Dashboard stats (up/down/unknown counts) |
| `GET /api/devices/:id/metrics` | Time-series metrics for charts |
| `GET /api/alerts` | Active alerts |
| `GET /api/settings/demo-mode` | Demo generator status |

---

## Database Schema Key Models

```prisma
Device {
  id, name, ip, type, vendor, model, location
  status: UP | DOWN | UNKNOWN | MAINTENANCE
  isDemo: Boolean
  metrics: Metric[]
  alerts: Alert[]
}

Metric {
  deviceId, timestamp, metricType: 'ICMP' | 'SNMP'
  source: REAL | DEMO | GENERATOR
  latency?, packetLoss?
  cpuUtil?, memUtil?, interfaceData?
}

Alert {
  type: DEVICE_DOWN | DEVICE_UP | HIGH_UTILIZATION | ANOMALY_DETECTED | BACKUP_FAILED
  severity: LOW | MEDIUM | HIGH | CRITICAL
  status: ACTIVE | RESOLVED | ACKNOWLEDGED
}
```

---

## Production Checklist

- [ ] `DATABASE_URL` configured
- [ ] `JWT_SECRET` set (32+ chars)
- [ ] `pnpm build` succeeds
- [ ] `pnpm db:migrate:prod` applied
- [ ] `pnpm pm2:start` - all processes online
- [ ] ICMP poller reaching real devices (check logs)
- [ ] Demo generator enabled (if demo devices needed)
- [ ] Telegram alerts configured (optional)
- [ ] Backup schedule verified
- [ ] Log rotation configured (PM2 handles)

---

## Useful Commands Reference

```bash
# Database
pnpm db:studio        # Prisma Studio UI
pnpm db:migrate       # Dev migration
pnpm generate         # Regenerate Prisma client

# Testing
pnpm test             # Unit tests
pnpm test:watch       # Watch mode
pnpm test:coverage    # Coverage report

# Demo
pnpm demo:agents      # Setup SNMP agent simulators (requires Docker)
pnpm demo:setup       # demo:seed + agents hint

# Lint/Format
pnpm lint             # ESLint
pnpm format           # Prettier
```