import { getDatabasePoolMetrics, checkDatabaseHealth, prisma } from '../src/lib/prisma';

async function monitorDatabasePool() {
  console.log('🔍 Database Connection Pool Monitor');
  console.log('====================================\n');
  
  console.log('Testing database health...');
  const isHealthy = await checkDatabaseHealth();
  console.log(`Health Status: ${isHealthy ? '✅ Healthy' : '❌ Unhealthy'}\n`);
  
  if (!isHealthy) {
    console.error('Database is not healthy. Exiting...');
    process.exit(1);
  }
  
  console.log('Fetching initial metrics...\n');
  
  setInterval(async () => {
    const metrics = await getDatabasePoolMetrics();
    const now = new Date().toISOString();
    
    console.log(`[${now}]`);
    console.log('📊 MySQL Thread Metrics:');
    console.log(`   Threads Connected: ${metrics.threadsConnected}`);
    console.log(`   Threads Running:   ${metrics.threadsRunning}`);
    console.log(`   Threads Cached:    ${metrics.threadsCached}`);
    console.log(`   Threads Created:   ${metrics.threadsCreated}`);
    
    if (metrics.threadsConnected > 100) {
      console.warn(`⚠️  WARNING: High connection count (${metrics.threadsConnected})`);
    }
    
    console.log('');
  }, 5000);
  
  console.log('Monitoring started. Press Ctrl+C to stop.\n');
}

process.on('SIGINT', async () => {
  console.log('\n\n⏹️  Shutting down...');
  await prisma.$disconnect();
  process.exit(0);
});

monitorDatabasePool().catch(console.error);
