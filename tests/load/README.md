# Load Testing Quick Start Guide

## Prerequisites

```bash
# Install required dependencies
pnpm add -D artillery k6 autocannon p-limit

# Make test scripts executable
chmod +x tests/load/run-tests.sh
```

## Quick Start

### 1. Start the Application

```bash
# Build for production
pnpm build

# Start production server
pnpm start

# Verify server is running
curl http://localhost:3000/api/health
```

### 2. Run Quick Performance Test

```bash
# Run spike test (1 minute)
./tests/load/run-tests.sh spike

# Output example:
# 📊 Running Spike Test...
# ✅ Total Requests: 12,450
# ✅ Requests/sec: 207.5
# ✅ Avg Latency: 241ms
# ✅ P95 Latency: 580ms
# ✅ Error Rate: 0.2%
```

### 3. Set Performance Baseline

```bash
# Record baseline metrics
node tests/load/benchmark.js baseline spike

# Baseline saved to: tests/load/reports/baseline.json
```

### 4. Run Full Test Suite

```bash
# Execute all tests (takes ~30 minutes)
./tests/load/run-tests.sh full

# Reports saved to: tests/load/reports/
```

### 5. Compare Performance After Changes

```bash
# Make your optimizations...

# Run comparison test
node tests/load/benchmark.js compare spike

# View comparison report
cat tests/load/reports/comparison-*.md
```

## Individual Test Scenarios

### Spike Test (Sudden Traffic)
```bash
node tests/load/load-runner.js spike

# Simulates: Black Friday, viral event
# Duration: 1 minute
# Connections: 500
```

### Capacity Test (Find Limits)
```bash
node tests/load/load-runner.js capacity

# Tests: 10, 25, 50, 100, 200, 300, 500, 750, 1000 connections
# Duration: 30 seconds per level
# Stops when error rate > 5%
```

### Soak Test (Long Duration)
```bash
node tests/load/load-runner.js soak

# Duration: 1 hour
# Connections: 50 (sustained)
# Purpose: Memory leak detection
```

### Breaking Test (Push to Failure)
```bash
node tests/load/load-runner.js breaking

# Extreme load test
# Connections: 2000
# Duration: 2 minutes
```

## Using K6 (Advanced)

```bash
# Install K6 (if not already installed)
# macOS
brew install k6

# Linux
sudo apt install k6

# Run K6 stress test
k6 run tests/load/scenarios/stress-test.js

# With custom settings
k6 run --vus 100 --duration 5m tests/load/scenarios/stress-test.js
```

## Using Artillery

```bash
# Run Artillery scenario
npx artillery run tests/load/scenarios/device-discovery.yml

# Generate HTML report
npx artillery run --output report.json tests/load/scenarios/device-discovery.yml
npx artillery report report.json
```

## Environment Variables

```bash
# Set custom configuration
export BASE_URL="http://localhost:3000"
export TEST_USERNAME="operator"
export TEST_PASSWORD="your-password"

# Run tests
./tests/load/run-tests.sh baseline
```

## Test Workflow

### For Development
1. Make code changes
2. Run quick spike test: `./tests/load/run-tests.sh spike`
3. Compare with baseline: `node tests/load/benchmark.js compare`
4. Iterate if performance regressed

### Before PR/Merge
1. Run full test suite: `./tests/load/run-tests.sh full`
2. Verify no regressions
3. Update baseline if improved: `node tests/load/benchmark.js baseline`
4. Commit updated baseline

### Before Production Deploy
1. Run soak test (1 hour): `./tests/load/run-tests.sh soak`
2. Run capacity test: `./tests/load/run-tests.sh capacity`
3. Verify all metrics meet targets
4. Document results in deployment notes

## Performance Targets

| Metric | Target | Critical Threshold |
|--------|--------|-------------------|
| Avg Latency | < 200ms | > 500ms |
| P95 Latency | < 500ms | > 2000ms |
| P99 Latency | < 1000ms | > 5000ms |
| Error Rate | < 1% | > 5% |
| Requests/sec | > 100 | < 50 |

## Interpreting Results

### Good Performance ✅
```
✅ Avg Latency: 150ms
✅ P95 Latency: 420ms
✅ Requests/sec: 250
✅ Error Rate: 0.5%
```

### Warning Signs ⚠️
```
⚠️  Avg Latency: 450ms (target: 200ms)
⚠️  P95 Latency: 1800ms (target: 500ms)
⚠️  Error Rate: 3% (target: 1%)
```

### Critical Issues ❌
```
❌ P95 Latency: 5200ms (CRITICAL)
❌ Error Rate: 12% (CRITICAL)
❌ Requests/sec: 35 (LOW)
```

## Troubleshooting

### Tests Fail to Connect
```bash
# Check if server is running
curl http://localhost:3000/api/health

# Check port
lsof -i :3000

# Restart server
pnpm start
```

### High Error Rates
```bash
# Check application logs
pm2 logs hk-nova

# Check for errors
tail -f logs/error.log

# Monitor resource usage
htop
```

### Out of Memory
```bash
# Increase Node.js memory
export NODE_OPTIONS="--max-old-space-size=4096"

# Monitor memory during test
watch -n 1 'ps aux | grep node'
```

### Connection Pool Exhausted
```bash
# Check pool metrics
curl http://localhost:3000/api/metrics | grep pool

# Increase pool size in config
# Edit src/lib/ssh-pool.ts
```

## CI/CD Integration

### GitHub Actions Example
```yaml
name: Performance Tests

on:
  pull_request:
    branches: [main]

jobs:
  performance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      
      - name: Install dependencies
        run: pnpm install
      
      - name: Build
        run: pnpm build
      
      - name: Start server
        run: pnpm start &
      
      - name: Wait for server
        run: npx wait-on http://localhost:3000
      
      - name: Run performance tests
        run: ./tests/load/run-tests.sh baseline
      
      - name: Compare with baseline
        run: node tests/load/benchmark.js compare
      
      - name: Upload results
        uses: actions/upload-artifact@v3
        with:
          name: performance-reports
          path: tests/load/reports/
```

## Next Steps

1. ✅ Run baseline test
2. ✅ Identify bottlenecks from results
3. ✅ Implement optimizations (see PERFORMANCE_OPTIMIZATION.md)
4. ✅ Re-test and compare
5. ✅ Iterate until targets met

## Support

For questions or issues:
- Check: [PERFORMANCE_OPTIMIZATION.md](../docs/PERFORMANCE_OPTIMIZATION.md)
- Review: [PHASE_4_LOAD_TESTING.md](../docs/PHASE_4_LOAD_TESTING.md)
- Team: Ask in #performance-testing channel
