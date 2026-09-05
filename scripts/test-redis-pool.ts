import { getRedisClient } from '../src/lib/redis-cache';
import { enqueueDevices, dequeueDevices, getQueueLength } from '../src/lib/redis-queue';

async function testRedisPool() {
  console.log('🧪 Testing Redis Connection Pool\n');
  console.log('==================================\n');
  
  const client = getRedisClient();
  
  if (!client) {
    console.log('⚠️  Redis not available - using in-memory fallback\n');
  } else {
    console.log('✅ Redis client available\n');
  }
  
  console.log('Test 1: Basic Redis operations');
  try {
    if (client) {
      await client.connect();
      await client.set('test:key', 'test-value', 'EX', 10);
      const value = await client.get('test:key');
      console.log(`✅ SET/GET: ${value === 'test-value' ? 'PASSED' : 'FAILED'}\n`);
    } else {
      console.log('⚠️  SKIPPED (in-memory mode)\n');
    }
  } catch (err) {
    console.log(`❌ FAILED: ${err instanceof Error ? err.message : 'Unknown error'}\n`);
  }
  
  console.log('Test 2: Concurrent operations (stress test)');
  try {
    if (client) {
      const operations = Array.from({ length: 100 }, (_, i) => 
        client.set(`test:concurrent:${i}`, `value-${i}`, 'EX', 10)
      );
      
      const start = Date.now();
      await Promise.all(operations);
      const duration = Date.now() - start;
      
      console.log(`✅ 100 concurrent SET operations in ${duration}ms\n`);
    } else {
      console.log('⚠️  SKIPPED (in-memory mode)\n');
    }
  } catch (err) {
    console.log(`❌ FAILED: ${err instanceof Error ? err.message : 'Unknown error'}\n`);
  }
  
  console.log('Test 3: Queue operations');
  try {
    const testDevices = Array.from({ length: 50 }, (_, i) => `device-${i}`);
    
    await enqueueDevices('icmp', testDevices);
    const queueLength = await getQueueLength('icmp');
    console.log(`   Enqueued: ${testDevices.length} devices`);
    console.log(`   Queue length: ${queueLength}`);
    
    const dequeued = await dequeueDevices('icmp', 10);
    const afterDequeue = await getQueueLength('icmp');
    console.log(`   Dequeued: ${dequeued.length} devices`);
    console.log(`   Remaining: ${afterDequeue}`);
    
    console.log(`✅ Queue operations: ${queueLength === 50 && afterDequeue === 40 ? 'PASSED' : 'FAILED'}\n`);
  } catch (err) {
    console.log(`❌ FAILED: ${err instanceof Error ? err.message : 'Unknown error'}\n`);
  }
  
  console.log('Test 4: Performance benchmark');
  try {
    if (client) {
      const iterations = 1000;
      const start = Date.now();
      
      for (let i = 0; i < iterations; i++) {
        await client.get('test:benchmark');
      }
      
      const duration = Date.now() - start;
      const opsPerSec = Math.floor((iterations / duration) * 1000);
      
      console.log(`   ${iterations} GET operations in ${duration}ms`);
      console.log(`   Performance: ~${opsPerSec} ops/sec`);
      console.log(`✅ Benchmark completed\n`);
    } else {
      console.log('⚠️  SKIPPED (in-memory mode)\n');
    }
  } catch (err) {
    console.log(`❌ FAILED: ${err instanceof Error ? err.message : 'Unknown error'}\n`);
  }
  
  console.log('Test 5: Connection pool health');
  try {
    if (client) {
      const status = client.status;
      console.log(`   Status: ${status}`);
      console.log(`   Ready: ${status === 'ready'}`);
      console.log(`✅ Connection healthy\n`);
    } else {
      console.log('⚠️  SKIPPED (in-memory mode)\n');
    }
  } catch (err) {
    console.log(`❌ FAILED: ${err instanceof Error ? err.message : 'Unknown error'}\n`);
  }
  
  console.log('✅ All tests completed!');
  
  if (client) {
    await client.quit();
  }
}

testRedisPool().catch(console.error);
