# Phase 4 Quick Start Guide

## 🚀 New Features Available

Phase 4 added comprehensive monitoring, benchmarking, and documentation capabilities to HK-Nova.

---

## 1️⃣ Code Coverage

### Run Coverage Reports

```bash
# Generate full coverage report
pnpm test:coverage

# View HTML report
open coverage/index.html

# Check LCOV report
cat coverage/lcov.info
```

### Coverage Thresholds

Configured in `vitest.config.mjs`:
- **Lines:** 70%
- **Functions:** 70%
- **Branches:** 65%
- **Statements:** 70%

Targets business logic in `src/lib/` and `src/app/api/`.

---

## 2️⃣ Performance Benchmarking

### Run Benchmarks

```bash
# Quick benchmarks (evaluator + rate limiter)
pnpm bench

# All benchmarks (requires database)
pnpm bench:all

# Individual benchmarks
pnpm bench:evaluator      # Expression evaluation (254k+ ops/sec)
pnpm bench:ratelimit      # Rate limiter (120k+ ops/sec)
pnpm bench:alerts         # Alert engine (245+ ops/sec)
pnpm bench:workflow       # Workflow engine (68+ exec/sec)
```

### Performance Budgets

All targets met or exceeded:
- ✅ Safe evaluator: >10k ops/sec (achieved 254k)
- ✅ Rate limiter: >50k ops/sec (achieved 120k)
- ✅ Alert creation: >100 ops/sec (achieved 245)
- ✅ Workflow execution: >50 exec/sec (achieved 68)

See `docs/BENCHMARKS.md` for details.

---

## 3️⃣ Prometheus Metrics

### View Metrics

```bash
# Start the server
pnpm dev

# Access metrics endpoint
curl http://localhost:3000/api/metrics

# Or open in browser
open http://localhost:3000/api/metrics
```

### Available Metrics (31 total)

**HTTP Layer:**
- `http_requests_total` - Total requests
- `http_request_duration_seconds` - Latency histogram
- `http_errors_total` - Error count

**Business Metrics:**
- `devices_total` - Devices by status/type
- `alerts_active` - Active alerts by severity
- `workflow_executions_total` - Workflow runs
- `condition_evaluations_total` - Condition checks
- `rate_limit_violations_total` - Rate limit violations
- `worker_last_run_timestamp` - Worker health
- `suspicious_patterns_detected_total` - Security alerts
- And 21 more...

### Platform Monitoring Dashboard

```bash
# Start server
pnpm dev

# Access dashboard
open http://localhost:3000/dashboard/platform-monitoring
```

**Features:**
- Real-time condition evaluation trends
- Rate limit violations by endpoint
- Suspicious pattern detection
- Worker health status
- Auto-refresh every 30s

---

## 4️⃣ API Documentation

### Interactive API Docs

```bash
# Swagger UI
open http://localhost:3000/docs/api
```

### Generate Postman Collection

```bash
# Generate OpenAPI spec + Postman collection
pnpm generate:postman

# Files created:
# - openapi.json (325 KB)
# - postman-collection.json (1.6 MB)

# Import to Postman
# File → Import → postman-collection.json
```

### Documentation Files

- **`docs/API.md`** - Complete REST API reference
  - Authentication guide
  - Rate limiting docs
  - Code examples (JS, Python, cURL)
  - Common workflows
  - Error handling

- **`docs/BENCHMARKS.md`** - Performance guide
  - Running benchmarks
  - Performance budgets
  - Optimization tips
  - CI integration

- **`docs/MONITORING.md`** - Observability guide
  - Prometheus metrics catalog
  - Grafana integration
  - Alert rules
  - Troubleshooting

---

## 🔧 Grafana Setup (Optional)

### 1. Install Grafana

```bash
# Docker
docker run -d -p 3001:3000 --name=grafana grafana/grafana

# Access Grafana
open http://localhost:3001
# Default: admin/admin
```

### 2. Add Prometheus Data Source

1. Configuration → Data Sources → Add data source
2. Select "Prometheus"
3. URL: `http://localhost:9090`
4. Save & Test

### 3. Create Dashboard

Sample queries from `docs/MONITORING.md`:

```promql
# Request rate
rate(http_requests_total[5m])

# P95 latency
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))

# Active alerts by severity
sum by (severity) (alerts_active)

# Worker lag
time() - worker_last_run_timestamp
```

---

## 📊 Monitoring Quick Checks

### Check System Health

```bash
# Prometheus metrics
curl http://localhost:3000/api/metrics | grep -E "alerts_active|worker_last_run"

# Platform monitoring
curl http://localhost:3000/api/monitoring/platform | jq '.workerHealth'

# Worker status
curl http://localhost:3000/api/workers/status
```

### Common Metrics

```bash
# Total devices
curl http://localhost:3000/api/metrics | grep "devices_total"

# Active alerts
curl http://localhost:3000/api/metrics | grep "alerts_active"

# Condition evaluations
curl http://localhost:3000/api/metrics | grep "condition_evaluations_total"

# Rate limit violations
curl http://localhost:3000/api/metrics | grep "rate_limit_violations_total"
```

---

## 🐛 Troubleshooting

### Benchmarks Won't Run

```bash
# Ensure database is running
pnpm db:migrate

# Set environment variables
export DATABASE_URL="mysql://root:password@localhost:3306/hk_nova_dev"
export ENCRYPTION_KEY="your-key"
export JWT_SECRET="your-secret"

# Try individual benchmarks
pnpm bench:evaluator  # No DB required
pnpm bench:ratelimit  # No DB required
```

### Metrics Not Updating

```bash
# Check if server is running
curl http://localhost:3000/api/health

# Restart server
pnpm dev

# Verify metrics endpoint
curl http://localhost:3000/api/metrics
```

### Coverage Report Empty

```bash
# Run tests with coverage
export DATABASE_URL="mysql://root:password@localhost:3306/hk_nova_dev"
pnpm test:coverage

# Check if coverage directory exists
ls -la coverage/

# View HTML report
open coverage/index.html
```

---

## 📚 Documentation Index

| Document | Description | Size |
|----------|-------------|------|
| `docs/API.md` | REST API reference with examples | 8.5 KB |
| `docs/BENCHMARKS.md` | Performance benchmarking guide | 5.5 KB |
| `docs/MONITORING.md` | Observability & metrics guide | 10.5 KB |
| `PHASE4_COMPLETION_REPORT.txt` | Detailed completion report | 15 KB |
| `PHASE4_SUMMARY.md` | Executive summary | 2 KB |

---

## 🎯 Next Steps

1. **Run benchmarks** to establish baseline performance
2. **Set up Grafana** for long-term metrics visualization
3. **Configure alerts** in Prometheus AlertManager
4. **Review API docs** and share Postman collection with team
5. **Monitor coverage** as you add new features

---

## 🆘 Support

- **Documentation:** See `/docs` folder
- **Issues:** Review `docs/MONITORING.md` troubleshooting section
- **Runbook:** `RUNBOOK.md` for operational procedures
- **Architecture:** `docs/ARCHITECTURE.md` for system design

---

**Phase 4 Complete** ✅  
**Ready for Production** 🚀

Last Updated: 2026-08-30
