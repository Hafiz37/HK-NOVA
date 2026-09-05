import { sshPool } from '../src/lib/ssh-pool';

console.log('🔍 SSH Connection Pool Monitor');
console.log('================================\n');

sshPool.on('connection:created', ({ deviceId, poolSize }) => {
  console.log(`✅ [CREATE] Device: ${deviceId} | Pool size: ${poolSize}`);
});

sshPool.on('connection:reused', ({ deviceId, usageCount }) => {
  console.log(`♻️  [REUSE]  Device: ${deviceId} | Usage count: ${usageCount}`);
});

sshPool.on('connection:released', ({ deviceId, usageCount }) => {
  console.log(`🔓 [RELEASE] Device: ${deviceId} | Usage count: ${usageCount}`);
});

sshPool.on('connection:destroyed', ({ deviceId, reason }) => {
  console.log(`🗑️  [DESTROY] Device: ${deviceId} | Reason: ${reason}`);
});

sshPool.on('cleanup:completed', ({ cleaned, remaining }) => {
  console.log(`🧹 [CLEANUP] Cleaned: ${cleaned} | Remaining: ${remaining}`);
});

setInterval(() => {
  const metrics = sshPool.getMetrics();
  
  console.log('\n📊 Pool Metrics:');
  console.log(`   Total Created:   ${metrics.totalCreated}`);
  console.log(`   Total Reused:    ${metrics.totalReused}`);
  console.log(`   Total Destroyed: ${metrics.totalDestroyed}`);
  console.log(`   Active:          ${metrics.activeConnections}`);
  console.log(`   Devices:         ${metrics.poolsCount}`);
  
  if (metrics.connectionsPerDevice.length > 0) {
    console.log('\n   Per Device:');
    metrics.connectionsPerDevice.forEach(({ deviceId, total, inUse, idle }) => {
      console.log(`     ${deviceId}: ${total} total (${inUse} in-use, ${idle} idle)`);
    });
  }
  console.log('');
}, 10_000);

process.on('SIGINT', async () => {
  console.log('\n\n⏹️  Shutting down...');
  await sshPool.shutdown();
  process.exit(0);
});

console.log('Monitoring started. Press Ctrl+C to stop.\n');
