#!/usr/bin/env node

/**
 * API Load Testing Script
 * Tests API endpoints under load with concurrent requests
 */

import http from 'http';
import https from 'https';

interface TestConfig {
  name: string;
  method: string;
  path: string;
  body?: unknown;
  concurrent: number;
  requests: number;
}

interface TestResult {
  name: string;
  totalRequests: number;
  successful: number;
  failed: number;
  avgResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  p95ResponseTime: number;
  requestsPerSecond: number;
  duration: number;
}

const API_URL = process.env.API_URL || 'http://localhost:3000';
const isHttps = API_URL.startsWith('https');

function makeRequest(method: string, path: string, body?: unknown): Promise<{ status: number; time: number }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API_URL);
    const client = isHttps ? https : http;
    
    const startTime = Date.now();
    
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };
    
    const req = client.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        const time = Date.now() - startTime;
        resolve({ status: res.statusCode || 0, time });
      });
    });
    
    req.on('error', (err) => {
      reject(err);
    });
    
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    if (body) {
      req.write(JSON.stringify(body));
    }
    
    req.end();
  });
}

async function runTest(config: TestConfig): Promise<TestResult> {
  console.log(`\n🧪 Running test: ${config.name}`);
  console.log(`   Requests: ${config.requests} (${config.concurrent} concurrent)`);
  
  const results: Array<{ success: boolean; time: number }> = [];
  const startTime = Date.now();
  
  let completed = 0;
  const total = config.requests;
  
  // Run requests in batches based on concurrency
  for (let i = 0; i < total; i += config.concurrent) {
    const batchSize = Math.min(config.concurrent, total - i);
    const batch = Array(batchSize).fill(null).map(() => 
      makeRequest(config.method, config.path, config.body)
        .then((result) => ({ success: result.status >= 200 && result.status < 400, time: result.time }))
        .catch(() => ({ success: false, time: 0 }))
    );
    
    const batchResults = await Promise.all(batch);
    results.push(...batchResults);
    
    completed += batchSize;
    const progress = Math.round((completed / total) * 100);
    process.stdout.write(`   Progress: ${completed}/${total} (${progress}%)\r`);
  }
  
  console.log('');
  
  const duration = Date.now() - startTime;
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const times = results.filter(r => r.success).map(r => r.time);
  
  times.sort((a, b) => a - b);
  
  const avgResponseTime = times.length > 0 
    ? times.reduce((sum, t) => sum + t, 0) / times.length 
    : 0;
  
  const minResponseTime = times.length > 0 ? times[0] : 0;
  const maxResponseTime = times.length > 0 ? times[times.length - 1] : 0;
  const p95Index = Math.floor(times.length * 0.95);
  const p95ResponseTime = times.length > 0 ? times[p95Index] : 0;
  
  const requestsPerSecond = (successful / duration) * 1000;
  
  return {
    name: config.name,
    totalRequests: config.requests,
    successful,
    failed,
    avgResponseTime,
    minResponseTime,
    maxResponseTime,
    p95ResponseTime,
    requestsPerSecond,
    duration,
  };
}

function printResults(results: TestResult[]): void {
  console.log('\n');
  console.log('='.repeat(80));
  console.log('📊 Load Test Results');
  console.log('='.repeat(80));
  
  results.forEach((result) => {
    console.log(`\n${result.name}:`);
    console.log(`  Total Requests:    ${result.totalRequests}`);
    console.log(`  Successful:        ${result.successful} (${((result.successful / result.totalRequests) * 100).toFixed(1)}%)`);
    console.log(`  Failed:            ${result.failed} (${((result.failed / result.totalRequests) * 100).toFixed(1)}%)`);
    console.log(`  Duration:          ${(result.duration / 1000).toFixed(2)}s`);
    console.log(`  Requests/sec:      ${result.requestsPerSecond.toFixed(2)}`);
    console.log(`  Avg Response Time: ${result.avgResponseTime.toFixed(2)}ms`);
    console.log(`  Min Response Time: ${result.minResponseTime.toFixed(2)}ms`);
    console.log(`  Max Response Time: ${result.maxResponseTime.toFixed(2)}ms`);
    console.log(`  P95 Response Time: ${result.p95ResponseTime.toFixed(2)}ms`);
    
    // Pass/Fail criteria
    const passed = 
      result.successful / result.totalRequests >= 0.99 &&  // 99% success rate
      result.p95ResponseTime < 500;  // P95 < 500ms
    
    console.log(`  Status:            ${passed ? '✅ PASS' : '❌ FAIL'}`);
  });
  
  console.log('\n' + '='.repeat(80));
  
  // Overall summary
  const totalRequests = results.reduce((sum, r) => sum + r.totalRequests, 0);
  const totalSuccessful = results.reduce((sum, r) => sum + r.successful, 0);
  const totalFailed = results.reduce((sum, r) => sum + r.failed, 0);
  const overallSuccessRate = (totalSuccessful / totalRequests) * 100;
  
  console.log('\n📈 Overall Summary:');
  console.log(`  Total Requests:  ${totalRequests}`);
  console.log(`  Successful:      ${totalSuccessful} (${overallSuccessRate.toFixed(1)}%)`);
  console.log(`  Failed:          ${totalFailed} (${(100 - overallSuccessRate).toFixed(1)}%)`);
  console.log(`  Overall Status:  ${overallSuccessRate >= 99 ? '✅ PASS' : '❌ FAIL'}`);
  console.log('');
}

async function main(): Promise<void> {
  console.log('🚀 API Load Testing');
  console.log(`   Target: ${API_URL}`);
  
  // Check if API is available
  try {
    await makeRequest('GET', '/api/health');
    console.log('   ✅ API is responding\n');
  } catch (error) {
    console.error('   ❌ API is not responding');
    console.error(`   Please start the server at ${API_URL}`);
    process.exit(1);
  }
  
  const tests: TestConfig[] = [
    {
      name: 'GET /api/devices (list devices)',
      method: 'GET',
      path: '/api/devices',
      concurrent: 10,
      requests: 100,
    },
    {
      name: 'GET /api/metrics (get metrics)',
      method: 'GET',
      path: '/api/metrics',
      concurrent: 10,
      requests: 100,
    },
    {
      name: 'GET /api/alerts (list alerts)',
      method: 'GET',
      path: '/api/alerts',
      concurrent: 10,
      requests: 100,
    },
    {
      name: 'GET /api/queue/metrics (queue status)',
      method: 'GET',
      path: '/api/queue/metrics',
      concurrent: 5,
      requests: 50,
    },
  ];
  
  const results: TestResult[] = [];
  
  for (const test of tests) {
    const result = await runTest(test);
    results.push(result);
    
    // Cool down between tests
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  printResults(results);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
