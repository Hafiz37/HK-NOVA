#!/usr/bin/env node

/**
 * Simple Load Test Runner - Direct API Testing
 * Bypasses authentication for baseline testing
 */

const autocannon = require('autocannon');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

async function runSimpleLoadTest() {
  console.log('\n📊 SIMPLE LOAD TEST\n');
  console.log(`Target: ${BASE_URL}`);
  console.log('Testing without authentication to get baseline metrics\n');
  
  // Test 1: Health endpoint (if exists)
  console.log('Test 1: Health Check Endpoint');
  const healthTest = autocannon({
    url: `${BASE_URL}/api/health`,
    connections: 10,
    duration: 10,
  }, (err, result) => {
    if (err) {
      console.error('Health test error:', err);
    } else {
      printResults('Health Check', result);
    }
  });
  
  await new Promise(resolve => {
    healthTest.on('done', resolve);
  });
  
  console.log('\n---\n');
  
  // Test 2: Simple GET request
  console.log('Test 2: Baseline Load Test (50 connections, 30s)');
  const baselineTest = autocannon({
    url: `${BASE_URL}`,
    connections: 50,
    duration: 30,
  }, (err, result) => {
    if (err) {
      console.error('Baseline test error:', err);
    } else {
      printResults('Baseline', result);
    }
  });
  
  autocannon.track(baselineTest, { renderProgressBar: true });
  
  await new Promise(resolve => {
    baselineTest.on('done', resolve);
  });
  
  console.log('\n---\n');
  
  // Test 3: Higher load
  console.log('Test 3: Stress Test (200 connections, 30s)');
  const stressTest = autocannon({
    url: `${BASE_URL}`,
    connections: 200,
    duration: 30,
  }, (err, result) => {
    if (err) {
      console.error('Stress test error:', err);
    } else {
      printResults('Stress Test', result);
    }
  });
  
  autocannon.track(stressTest, { renderProgressBar: true });
  
  await new Promise(resolve => {
    stressTest.on('done', resolve);
  });
}

function printResults(testName, result) {
  console.log(`\n📈 ${testName} Results:`);
  console.log('═══════════════════════════════════════');
  
  if (!result || !result.requests) {
    console.log('❌ No results collected - test may have failed');
    return;
  }
  
  console.log(`Total Requests:  ${result.requests.total || 0}`);
  console.log(`Requests/sec:    ${(result.requests.mean || 0).toFixed(2)}`);
  console.log(`Throughput:      ${((result.throughput?.mean || 0) / 1024 / 1024).toFixed(2)} MB/s`);
  console.log('\nLatency:');
  console.log(`  Avg:           ${(result.latency?.mean || 0).toFixed(2)}ms`);
  console.log(`  P50:           ${(result.latency?.p50 || 0).toFixed(2)}ms`);
  console.log(`  P95:           ${(result.latency?.p95 || 0).toFixed(2)}ms`);
  console.log(`  P99:           ${(result.latency?.p99 || 0).toFixed(2)}ms`);
  console.log('\nErrors:');
  console.log(`  Errors:        ${result.errors || 0}`);
  console.log(`  Timeouts:      ${result.timeouts || 0}`);
  console.log(`  Non-2xx:       ${result.non2xx || 0}`);
}

// Run tests
runSimpleLoadTest().catch(console.error);
