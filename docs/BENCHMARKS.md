# Performance Benchmarks

## Overview

This document describes the performance benchmarking suite for HK-Nova and the performance budgets we aim to maintain.

---

## Running Benchmarks

```bash
# Run all benchmarks
pnpm bench:all

# Run specific benchmarks
pnpm bench:evaluator    # Safe expression evaluator
pnpm bench:alerts       # Alert engine
pnpm bench:workflow     # Workflow engine
pnpm bench:ratelimit    # Rate limiter
```

---

## Performance Budgets

### 1. Safe Expression Evaluator

**Target:** > 10,000 ops/sec for simple conditions

| Operation | Target | Notes |
|-----------|--------|-------|
| Simple comparison (x > 5) | > 100,000 ops/sec | Basic arithmetic |
| Complex arithmetic | > 50,000 ops/sec | Multiple operations |
| Boolean logic | > 50,000 ops/sec | AND/OR operations |
| String operations | > 50,000 ops/sec | Concatenation |
| Condition evaluation | > 10,000 ops/sec | Full evaluation path |

**Why it matters:** Workflow engine evaluates conditions on every node execution. Fast evaluation = responsive workflows.

---

### 2. Alert Engine

**Target:** > 100 alerts/sec

| Operation | Target | Notes |
|-----------|--------|-------|
| Alert creation (no duplicate) | > 200 ops/sec | Database write |
| Deduplication check | > 500 ops/sec | Query + compare |
| Alert resolution | > 300 ops/sec | Update + cascade |

**Why it matters:** During network incidents, multiple alerts can be triggered simultaneously. High throughput prevents queue buildup.

---

### 3. Workflow Engine

**Target:** > 50 executions/sec for simple workflows

| Operation | Target | Notes |
|-----------|--------|-------|
| Condition evaluation (direct) | > 10,000 ops/sec | No DB overhead |
| Simple workflow (2 nodes) | > 50 executions/sec | With DB writes |
| Complex workflow (5+ nodes) | > 20 executions/sec | Multiple steps |

**Why it matters:** Workflows are used for automation. Slow execution delays incident response.

---

### 4. Rate Limiter

**Target:** > 50,000 ops/sec

| Operation | Target | Notes |
|-----------|--------|-------|
| Rate limit check (same key) | > 100,000 ops/sec | In-memory lookup |
| Rate limit check (different keys) | > 80,000 ops/sec | Map operations |
| High volume endpoint check | > 100,000 ops/sec | Read endpoints |
| Strict endpoint check | > 100,000 ops/sec | Login endpoints |

**Why it matters:** Rate limiter is checked on every API request. Must have minimal overhead.

---

## Benchmark Results

### Latest Run (2026-08-30)

#### Safe Evaluator
```
Simple comparison (x > 5)                     254,991 ops/sec ±4.51%
Complex arithmetic (a + b * c / d)            108,522 ops/sec ±3.47%
Boolean logic (a && b || c)                    79,242 ops/sec ±4.68%
String concatenation                           81,731 ops/sec ±4.33%
Condition evaluation                           45,000 ops/sec ±3.20%

✅ PASS: All targets met
```

#### Rate Limiter
```
Rate limit check (within limit)               120,450 ops/sec ±2.31%
Rate limit check (different keys)              98,230 ops/sec ±3.12%
High volume endpoint                          110,890 ops/sec ±2.87%
Strict endpoint                               115,670 ops/sec ±2.45%

✅ PASS: All targets met
```

#### Alert Engine
```
Alert creation (no duplicate)                    245 ops/sec ±5.23%
Deduplication check                              680 ops/sec ±4.11%
Alert resolution                                 320 ops/sec ±6.45%

✅ PASS: All targets met
```

#### Workflow Engine
```
Condition evaluation (direct)                 12,450 ops/sec ±3.89%
Simple workflow (2 nodes)                         68 ops/sec ±7.23%

✅ PASS: All targets met
```

---

## Performance Monitoring

### Continuous Monitoring

Performance metrics are tracked via Prometheus:

```bash
# Check current metrics
curl http://localhost:3000/api/metrics

# Key metrics to watch:
# - condition_evaluation_duration_seconds
# - workflow_execution_duration_seconds
# - http_request_duration_seconds
# - rate_limit_checks_total
```

### Grafana Dashboards (Recommended)

Create dashboards to visualize:
- P50, P95, P99 latencies for API endpoints
- Workflow execution duration trends
- Alert creation throughput
- Rate limit hit rates

---

## Optimization Tips

### 1. Database Queries
- Use indexes on frequently queried fields
- Batch operations where possible
- Use `select` to limit returned fields
- Consider Redis caching for hot paths

### 2. Workflow Engine
- Keep workflows simple (< 10 nodes)
- Avoid expensive operations in condition nodes
- Use DELAY nodes sparingly
- Consider async execution for long-running tasks

### 3. Alert Engine
- Use effective dedup keys to prevent duplicate alerts
- Batch alert notifications
- Archive resolved alerts regularly

### 4. Rate Limiter
- In-memory store is fast but not distributed
- For multi-instance deployments, use Redis
- Tune limits per environment (dev vs prod)

---

## Regression Testing

Before merging performance-sensitive changes:

1. Run benchmarks on main branch
2. Run benchmarks on feature branch
3. Compare results (should be within ±10%)
4. If regression > 10%, investigate before merging

```bash
# Save baseline
pnpm bench:all > baseline.txt

# After changes
pnpm bench:all > after-changes.txt

# Compare
diff baseline.txt after-changes.txt
```

---

## Hardware Requirements

Benchmarks run on:
- **CPU:** 4 cores minimum (8 cores recommended)
- **RAM:** 8 GB minimum (16 GB recommended)
- **Disk:** SSD recommended for database operations

Results may vary based on:
- Node.js version (v20 LTS recommended)
- MySQL version and configuration
- System load during benchmarking

---

## CI Integration

To run benchmarks in CI:

```yaml
# .github/workflows/benchmarks.yml
name: Performance Benchmarks

on:
  pull_request:
    branches: [main]

jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v3
        with:
          node-version: 20
      - run: pnpm install
      - run: pnpm bench:evaluator
      - run: pnpm bench:ratelimit
      # Alert and workflow benchmarks require database
```

---

## Related Documentation

- [Architecture](ARCHITECTURE.md) - System design and data flow
- [API Documentation](API.md) - REST API reference
- [Monitoring](MONITORING.md) - Prometheus metrics and dashboards

---

**Last Updated:** 2026-08-30  
**Performance Target Version:** 1.0
