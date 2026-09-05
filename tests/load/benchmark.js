#!/usr/bin/env node

/**
 * Performance Benchmark Runner
 * Compares current performance against baseline
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

const BASELINE_FILE = './tests/load/reports/baseline.json';
const REPORT_DIR = './tests/load/reports';

interface BenchmarkResult {
  timestamp: string;
  testType: string;
  metrics: {
    requestsPerSecond: number;
    avgLatency: number;
    p95Latency: number;
    p99Latency: number;
    errorRate: number;
    throughput: number;
  };
  metadata: {
    connections: number;
    duration: number;
    url: string;
  };
}

async function runBenchmark(testType: string): Promise<BenchmarkResult> {
  console.log(`\n🏃 Running ${testType} benchmark...`);
  
  const result = await execAsync(`node tests/load/load-runner.js ${testType}`);
  
  // Parse output (simplified - you'd need to parse actual output)
  return {
    timestamp: new Date().toISOString(),
    testType,
    metrics: {
      requestsPerSecond: 0,
      avgLatency: 0,
      p95Latency: 0,
      p99Latency: 0,
      errorRate: 0,
      throughput: 0,
    },
    metadata: {
      connections: 50,
      duration: 60,
      url: process.env.BASE_URL || 'http://localhost:3000',
    },
  };
}

async function loadBaseline(): Promise<BenchmarkResult | null> {
  try {
    if (!fs.existsSync(BASELINE_FILE)) {
      return null;
    }
    
    const data = fs.readFileSync(BASELINE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Failed to load baseline:', error);
    return null;
  }
}

function saveBaseline(result: BenchmarkResult): void {
  fs.writeFileSync(BASELINE_FILE, JSON.stringify(result, null, 2));
  console.log(`✅ Baseline saved to ${BASELINE_FILE}`);
}

function compareResults(baseline: BenchmarkResult, current: BenchmarkResult): void {
  console.log('\n📊 Performance Comparison');
  console.log('═══════════════════════════════════════════════════');
  
  const metrics = [
    { key: 'requestsPerSecond', label: 'Requests/sec', unit: '', higher: true },
    { key: 'avgLatency', label: 'Avg Latency', unit: 'ms', higher: false },
    { key: 'p95Latency', label: 'P95 Latency', unit: 'ms', higher: false },
    { key: 'p99Latency', label: 'P99 Latency', unit: 'ms', higher: false },
    { key: 'errorRate', label: 'Error Rate', unit: '%', higher: false },
    { key: 'throughput', label: 'Throughput', unit: 'MB/s', higher: true },
  ];
  
  for (const metric of metrics) {
    const baseValue = baseline.metrics[metric.key];
    const currValue = current.metrics[metric.key];
    const diff = currValue - baseValue;
    const diffPct = (diff / baseValue) * 100;
    
    const improved = metric.higher ? diff > 0 : diff < 0;
    const symbol = improved ? '✅' : '❌';
    const sign = diff > 0 ? '+' : '';
    
    console.log(
      `${symbol} ${metric.label.padEnd(20)} ` +
      `Baseline: ${baseValue.toFixed(2)}${metric.unit} | ` +
      `Current: ${currValue.toFixed(2)}${metric.unit} | ` +
      `Change: ${sign}${diffPct.toFixed(1)}%`
    );
  }
  
  // Overall assessment
  const improvements = metrics.filter(m => {
    const diff = current.metrics[m.key] - baseline.metrics[m.key];
    return m.higher ? diff > 0 : diff < 0;
  }).length;
  
  const improvementRate = (improvements / metrics.length) * 100;
  
  console.log('\n🎯 Overall Assessment');
  console.log('═══════════════════════════════════════════════════');
  
  if (improvementRate >= 80) {
    console.log('✅ EXCELLENT: Performance significantly improved!');
  } else if (improvementRate >= 60) {
    console.log('⚠️  GOOD: Performance improved in most areas');
  } else if (improvementRate >= 40) {
    console.log('⚠️  MIXED: Some improvements, some regressions');
  } else {
    console.log('❌ REGRESSION: Performance degraded - investigation needed');
  }
  
  console.log(`Improved metrics: ${improvements}/${metrics.length} (${improvementRate.toFixed(0)}%)`);
}

async function generateComparisonReport(
  baseline: BenchmarkResult,
  current: BenchmarkResult
): Promise<void> {
  const reportFile = path.join(
    REPORT_DIR,
    `comparison-${new Date().toISOString().replace(/:/g, '-')}.md`
  );
  
  const report = `# Performance Comparison Report

**Generated:** ${new Date().toISOString()}
**Test Type:** ${current.testType}

## Baseline
- **Date:** ${baseline.timestamp}
- **URL:** ${baseline.metadata.url}
- **Connections:** ${baseline.metadata.connections}
- **Duration:** ${baseline.metadata.duration}s

## Current
- **Date:** ${current.timestamp}
- **URL:** ${current.metadata.url}
- **Connections:** ${current.metadata.connections}
- **Duration:** ${current.metadata.duration}s

## Metrics Comparison

| Metric | Baseline | Current | Change | Status |
|--------|----------|---------|--------|--------|
| Requests/sec | ${baseline.metrics.requestsPerSecond.toFixed(2)} | ${current.metrics.requestsPerSecond.toFixed(2)} | ${((current.metrics.requestsPerSecond - baseline.metrics.requestsPerSecond) / baseline.metrics.requestsPerSecond * 100).toFixed(1)}% | ${current.metrics.requestsPerSecond >= baseline.metrics.requestsPerSecond ? '✅' : '❌'} |
| Avg Latency (ms) | ${baseline.metrics.avgLatency.toFixed(2)} | ${current.metrics.avgLatency.toFixed(2)} | ${((current.metrics.avgLatency - baseline.metrics.avgLatency) / baseline.metrics.avgLatency * 100).toFixed(1)}% | ${current.metrics.avgLatency <= baseline.metrics.avgLatency ? '✅' : '❌'} |
| P95 Latency (ms) | ${baseline.metrics.p95Latency.toFixed(2)} | ${current.metrics.p95Latency.toFixed(2)} | ${((current.metrics.p95Latency - baseline.metrics.p95Latency) / baseline.metrics.p95Latency * 100).toFixed(1)}% | ${current.metrics.p95Latency <= baseline.metrics.p95Latency ? '✅' : '❌'} |
| P99 Latency (ms) | ${baseline.metrics.p99Latency.toFixed(2)} | ${current.metrics.p99Latency.toFixed(2)} | ${((current.metrics.p99Latency - baseline.metrics.p99Latency) / baseline.metrics.p99Latency * 100).toFixed(1)}% | ${current.metrics.p99Latency <= baseline.metrics.p99Latency ? '✅' : '❌'} |
| Error Rate (%) | ${baseline.metrics.errorRate.toFixed(2)} | ${current.metrics.errorRate.toFixed(2)} | ${((current.metrics.errorRate - baseline.metrics.errorRate) / baseline.metrics.errorRate * 100).toFixed(1)}% | ${current.metrics.errorRate <= baseline.metrics.errorRate ? '✅' : '❌'} |
| Throughput (MB/s) | ${baseline.metrics.throughput.toFixed(2)} | ${current.metrics.throughput.toFixed(2)} | ${((current.metrics.throughput - baseline.metrics.throughput) / baseline.metrics.throughput * 100).toFixed(1)}% | ${current.metrics.throughput >= baseline.metrics.throughput ? '✅' : '❌'} |

## Recommendations

${current.metrics.avgLatency > baseline.metrics.avgLatency * 1.1 ? '- ⚠️  Latency increased - review recent code changes\n' : ''}
${current.metrics.errorRate > baseline.metrics.errorRate * 1.1 ? '- ⚠️  Error rate increased - check logs for failures\n' : ''}
${current.metrics.requestsPerSecond < baseline.metrics.requestsPerSecond * 0.9 ? '- ⚠️  Throughput decreased - investigate bottlenecks\n' : ''}
${current.metrics.p99Latency > 2000 ? '- ⚠️  P99 latency exceeds 2s - optimize slow queries\n' : ''}
${current.metrics.errorRate > 0.05 ? '- ⚠️  Error rate exceeds 5% - critical issue\n' : ''}

## Next Steps

1. Review detailed logs in: \`${REPORT_DIR}\`
2. Profile slow endpoints using performance monitor
3. Check database query performance
4. Verify connection pool utilization
5. Monitor memory usage over time
`;
  
  fs.writeFileSync(reportFile, report);
  console.log(`\n📄 Detailed report saved to ${reportFile}`);
}

async function main() {
  const command = process.argv[2] || 'compare';
  const testType = process.argv[3] || 'spike';
  
  if (!fs.existsSync(REPORT_DIR)) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
  }
  
  switch (command) {
    case 'baseline':
      console.log('📊 Setting new performance baseline...');
      const baselineResult = await runBenchmark(testType);
      saveBaseline(baselineResult);
      break;
      
    case 'compare':
      const baseline = await loadBaseline();
      
      if (!baseline) {
        console.error('❌ No baseline found. Run: node benchmark.js baseline');
        process.exit(1);
      }
      
      console.log('📊 Running performance comparison...');
      console.log(`Baseline from: ${baseline.timestamp}`);
      
      const currentResult = await runBenchmark(testType);
      compareResults(baseline, currentResult);
      await generateComparisonReport(baseline, currentResult);
      break;
      
    case 'reset':
      if (fs.existsSync(BASELINE_FILE)) {
        fs.unlinkSync(BASELINE_FILE);
        console.log('✅ Baseline reset');
      }
      break;
      
    default:
      console.log('Usage: node benchmark.js [baseline|compare|reset] [testType]');
      console.log('Test types: spike, soak, capacity');
      process.exit(1);
  }
}

main().catch(console.error);
