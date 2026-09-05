#!/usr/bin/env node

const autocannon = require('autocannon');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const USERNAME = process.env.TEST_USERNAME || 'operator';
const PASSWORD = process.env.TEST_PASSWORD || 'test-password';

let authToken = null;

async function authenticate() {
  const response = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  
  const data = await response.json();
  authToken = data.token;
  console.log('✅ Authenticated successfully');
}

async function runSpikeTest() {
  console.log('\n🔥 SPIKE TEST: Sudden traffic surge\n');
  console.log('Simulating: Black Friday / System restart / Viral event\n');
  
  await authenticate();
  
  const instance = autocannon({
    url: `${BASE_URL}/api/devices`,
    connections: 500,        // 500 concurrent connections
    duration: 60,            // 1 minute spike
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    },
    workers: 4,
  }, finishedBench);
  
  autocannon.track(instance, { renderProgressBar: true });
}

async function runSoakTest() {
  console.log('\n🕐 SOAK TEST: Extended load over time\n');
  console.log('Simulating: 24-hour continuous operation\n');
  
  await authenticate();
  
  const instance = autocannon({
    url: `${BASE_URL}/api/devices`,
    connections: 50,
    duration: 3600,          // 1 hour (use 86400 for full 24h)
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    },
    workers: 2,
  }, finishedBench);
  
  autocannon.track(instance, { renderProgressBar: true });
}

async function runCapacityTest() {
  console.log('\n📊 CAPACITY TEST: Finding maximum throughput\n');
  console.log('Incrementally increasing load until failure\n');
  
  await authenticate();
  
  const connectionLevels = [10, 25, 50, 100, 200, 300, 500, 750, 1000];
  const results = [];
  
  for (const connections of connectionLevels) {
    console.log(`\nTesting with ${connections} connections...`);
    
    const result = await new Promise((resolve) => {
      autocannon({
        url: `${BASE_URL}/api/devices`,
        connections,
        duration: 30,
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
      }, (err, res) => {
        if (err) {
          console.error('Error:', err);
          resolve(null);
        } else {
          resolve({
            connections,
            latency: res.latency,
            requests: res.requests,
            throughput: res.throughput,
            errors: res.errors,
            timeouts: res.timeouts,
            non2xx: res.non2xx,
          });
        }
      });
    });
    
    if (result) {
      results.push(result);
      
      const errorRate = (result.errors + result.timeouts + result.non2xx) / result.requests.total;
      console.log(`  Avg Latency: ${result.latency.mean.toFixed(2)}ms`);
      console.log(`  RPS: ${result.requests.mean.toFixed(2)}`);
      console.log(`  Error Rate: ${(errorRate * 100).toFixed(2)}%`);
      
      // Stop if error rate exceeds 5%
      if (errorRate > 0.05) {
        console.log('\n⚠️  Error threshold exceeded - capacity limit reached');
        break;
      }
    }
    
    // Cool down between tests
    await new Promise(resolve => setTimeout(resolve, 10000));
  }
  
  console.log('\n📈 CAPACITY TEST RESULTS:');
  console.log('═══════════════════════════════════════════════════');
  results.forEach(r => {
    const errorRate = (r.errors + r.timeouts + r.non2xx) / r.requests.total;
    console.log(`${r.connections} conn: ${r.requests.mean.toFixed(0)} RPS, ` +
                `${r.latency.mean.toFixed(0)}ms avg, ` +
                `${(errorRate * 100).toFixed(1)}% errors`);
  });
  
  // Find optimal capacity
  const optimal = results
    .filter(r => {
      const errorRate = (r.errors + r.timeouts + r.non2xx) / r.requests.total;
      return errorRate < 0.01 && r.latency.p99 < 2000;
    })
    .reduce((max, r) => r.requests.mean > max.requests.mean ? r : max, results[0]);
  
  console.log('\n✅ RECOMMENDED CAPACITY:');
  console.log(`   Max Connections: ${optimal.connections}`);
  console.log(`   Target RPS: ${Math.floor(optimal.requests.mean * 0.8)}`);
  console.log(`   Expected Latency: ${optimal.latency.mean.toFixed(0)}ms avg`);
}

async function runBreakingTest() {
  console.log('\n💥 BREAKING TEST: Push system to failure\n');
  console.log('Simulating: Intentional overload to find breaking point\n');
  
  await authenticate();
  
  const instance = autocannon({
    url: `${BASE_URL}/api/devices`,
    connections: 2000,       // Extreme load
    duration: 120,
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json',
    },
    workers: 8,
  }, finishedBench);
  
  autocannon.track(instance, { renderProgressBar: true });
}

function finishedBench(err, res) {
  if (err) {
    console.error('\n❌ Test failed:', err);
    return;
  }
  
  console.log('\n📊 TEST RESULTS:');
  console.log('═══════════════════════════════════════════════════');
  console.log(`Total Requests:  ${res.requests.total}`);
  console.log(`Requests/sec:    ${res.requests.mean.toFixed(2)}`);
  console.log(`Throughput:      ${(res.throughput.mean / 1024 / 1024).toFixed(2)} MB/s`);
  console.log('\nLatency:');
  console.log(`  Avg:           ${res.latency.mean.toFixed(2)}ms`);
  console.log(`  P50:           ${res.latency.p50.toFixed(2)}ms`);
  console.log(`  P95:           ${res.latency.p95.toFixed(2)}ms`);
  console.log(`  P99:           ${res.latency.p99.toFixed(2)}ms`);
  console.log(`  Max:           ${res.latency.max.toFixed(2)}ms`);
  console.log('\nErrors:');
  console.log(`  Errors:        ${res.errors}`);
  console.log(`  Timeouts:      ${res.timeouts}`);
  console.log(`  Non-2xx:       ${res.non2xx}`);
  
  const errorRate = (res.errors + res.timeouts + res.non2xx) / res.requests.total * 100;
  console.log(`  Error Rate:    ${errorRate.toFixed(2)}%`);
  
  // Evaluation
  console.log('\n🎯 EVALUATION:');
  if (errorRate < 1 && res.latency.p95 < 1000) {
    console.log('✅ EXCELLENT - System handling load well');
  } else if (errorRate < 5 && res.latency.p95 < 2000) {
    console.log('⚠️  ACCEPTABLE - System under stress but functional');
  } else {
    console.log('❌ POOR - System struggling under load');
  }
}

// Main execution
const testType = process.argv[2] || 'spike';

(async () => {
  try {
    switch (testType) {
      case 'spike':
        await runSpikeTest();
        break;
      case 'soak':
        await runSoakTest();
        break;
      case 'capacity':
        await runCapacityTest();
        break;
      case 'breaking':
        await runBreakingTest();
        break;
      default:
        console.log('Usage: node load-runner.js [spike|soak|capacity|breaking]');
        process.exit(1);
    }
  } catch (error) {
    console.error('Test error:', error);
    process.exit(1);
  }
})();
