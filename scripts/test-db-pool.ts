import { prisma, getDatabasePoolMetrics } from '../src/lib/prisma';

async function testDatabasePool() {
  console.log('🧪 Testing Database Connection Pool\n');
  console.log('====================================\n');
  
  console.log('Test 1: Basic database connectivity');
  try {
    const deviceCount = await prisma.device.count();
    console.log(`✅ Connected - Found ${deviceCount} devices\n`);
  } catch (err) {
    console.log(`❌ Failed: ${err instanceof Error ? err.message : 'Unknown error'}\n`);
    process.exit(1);
  }
  
  console.log('Test 2: Concurrent queries (simulating load)');
  try {
    const queries = Array.from({ length: 20 }, (_, i) => 
      prisma.device.findMany({ take: 1 })
    );
    
    const start = Date.now();
    await Promise.all(queries);
    const duration = Date.now() - start;
    
    console.log(`✅ Executed 20 concurrent queries in ${duration}ms\n`);
  } catch (err) {
    console.log(`❌ Failed: ${err instanceof Error ? err.message : 'Unknown error'}\n`);
  }
  
  console.log('Test 3: Query performance monitoring');
  try {
    const start = Date.now();
    
    await prisma.device.findMany({
      take: 10,
      include: {
        metrics: {
          take: 1,
          orderBy: { timestamp: 'desc' },
        },
      },
    });
    
    const duration = Date.now() - start;
    console.log(`✅ Complex query executed in ${duration}ms\n`);
  } catch (err) {
    console.log(`❌ Failed: ${err instanceof Error ? err.message : 'Unknown error'}\n`);
  }
  
  console.log('Test 4: Database pool metrics');
  try {
    const metrics = await getDatabasePoolMetrics();
    console.log('📊 Pool Metrics:');
    console.log(`   Threads Connected: ${metrics.threadsConnected}`);
    console.log(`   Threads Running:   ${metrics.threadsRunning}`);
    console.log(`   Threads Cached:    ${metrics.threadsCached}`);
    console.log(`   Threads Created:   ${metrics.threadsCreated}`);
    console.log('');
  } catch (err) {
    console.log(`❌ Failed to get metrics: ${err instanceof Error ? err.message : 'Unknown error'}\n`);
  }
  
  console.log('Test 5: Connection pool stress test');
  try {
    console.log('   Running 50 sequential queries...');
    const start = Date.now();
    
    for (let i = 0; i < 50; i++) {
      await prisma.device.count();
    }
    
    const duration = Date.now() - start;
    const avgTime = duration / 50;
    
    console.log(`✅ Completed in ${duration}ms (avg: ${avgTime.toFixed(2)}ms per query)\n`);
  } catch (err) {
    console.log(`❌ Failed: ${err instanceof Error ? err.message : 'Unknown error'}\n`);
  }
  
  console.log('✅ All tests completed!');
  
  await prisma.$disconnect();
}

testDatabasePool().catch(console.error);
