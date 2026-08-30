# Phase 4 - Command Reference Card

Quick reference for all Phase 4 features.

## 🧪 Testing & Coverage

```bash
# Run tests with coverage
pnpm test:coverage

# View coverage report (HTML)
open coverage/index.html

# View coverage summary
cat coverage/coverage-summary.json

# Run specific test file
pnpm test tests/unit/safe-evaluator.test.ts
```

## ⚡ Performance Benchmarking

```bash
# Quick benchmarks (no database required)
pnpm bench

# Run all benchmarks
pnpm bench:all

# Individual benchmarks
pnpm bench:evaluator      # Expression evaluator (254k ops/sec)
pnpm bench:ratelimit      # Rate limiter (120k ops/sec)
pnpm bench:alerts         # Alert engine (245 ops/sec)
pnpm bench:workflow       # Workflow engine (68 exec/sec)
```

## 📊 Monitoring & Metrics

```bash
# View Prometheus metrics
curl http://localhost:3000/api/metrics

# View metrics in browser
open http://localhost:3000/api/metrics

# Platform monitoring dashboard
open http://localhost:3000/dashboard/platform-monitoring

# Get monitoring data (JSON)
curl http://localhost:3000/api/monitoring/platform | jq

# Get suspicious patterns
curl http://localhost:3000/api/audit-logs/monitoring/patterns | jq

# Check worker health
curl http://localhost:3000/api/workers/status | jq
```

## 📚 API Documentation

```bash
# Generate OpenAPI spec + Postman collection
pnpm generate:postman

# View generated files
ls -lh openapi.json postman-collection.json

# Interactive API docs (Swagger UI)
open http://localhost:3000/docs/api

# Read API documentation
cat docs/API.md
cat docs/BENCHMARKS.md
cat docs/MONITORING.md
```

## 🔍 Key Metrics to Monitor

```bash
# Device metrics
curl http://localhost:3000/api/metrics | grep devices_total

# Alert metrics
curl http://localhost:3000/api/metrics | grep alerts_active

# Workflow metrics
curl http://localhost:3000/api/metrics | grep workflow_executions_total
curl http://localhost:3000/api/metrics | grep condition_evaluations_total

# Rate limit metrics
curl http://localhost:3000/api/metrics | grep rate_limit_violations_total

# Worker health
curl http://localhost:3000/api/metrics | grep worker_last_run_timestamp

# HTTP metrics
curl http://localhost:3000/api/metrics | grep http_requests_total
curl http://localhost:3000/api/metrics | grep http_request_duration_seconds
```

## 🎯 Quick Health Checks

```bash
# Check if metrics endpoint is working
curl -s http://localhost:3000/api/metrics | head -20

# Check platform monitoring
curl -s http://localhost:3000/api/monitoring/platform | jq '.workerHealth'

# Check for suspicious patterns
curl -s http://localhost:3000/api/audit-logs/monitoring/patterns | jq '.summary'

# Verify OpenAPI spec
jq '.info.version' openapi.json

# Test Postman collection (requires newman)
newman run postman-collection.json --env-var "baseUrl=http://localhost:3000"
```

## 📖 Documentation Files

| File | Description |
|------|-------------|
| `docs/API.md` | Complete REST API reference |
| `docs/BENCHMARKS.md` | Performance benchmarking guide |
| `docs/MONITORING.md` | Observability & monitoring guide |
| `PHASE4_QUICKSTART.md` | Quick start guide |
| `PHASE4_COMPLETION_REPORT.txt` | Detailed completion report |
| `PHASE4_FINAL_SUMMARY.txt` | Executive summary |
| `openapi.json` | OpenAPI 3.1 specification |
| `postman-collection.json` | Postman API collection |

## 🚀 Next Steps

See Phase 5 task list for production deployment steps.

---

**Last Updated:** 2026-08-30  
**Phase:** 4 - Additional Enhancements  
**Status:** ✅ Complete
