import { getRedisClient } from '../src/lib/redis-cache';

async function monitorRedisPool() {
  console.log('🔍 Redis Connection Pool Monitor');
  console.log('==================================\n');
  
  const client = getRedisClient();
  
  if (!client) {
    console.error('❌ Redis client not available');
    console.log('Using in-memory fallback mode\n');
    return;
  }
  
  console.log('Testing Redis connectivity...');
  
  try {
    await client.connect();
    await client.ping();
    console.log('✅ Redis connected\n');
  } catch (err) {
    console.error(`❌ Failed to connect: ${err instanceof Error ? err.message : 'Unknown error'}\n`);
    process.exit(1);
  }
  
  console.log('Fetching Redis INFO...\n');
  
  setInterval(async () => {
    try {
      const info = await client.info('clients');
      const lines = info.split('\r\n');
      
      const metrics: Record<string, string> = {};
      lines.forEach(line => {
        const [key, value] = line.split(':');
        if (key && value) {
          metrics[key] = value;
        }
      });
      
      const now = new Date().toISOString();
      
      console.log(`[${now}]`);
      console.log('📊 Redis Client Metrics:');
      console.log(`   Connected Clients:     ${metrics['connected_clients'] || 'N/A'}`);
      console.log(`   Blocked Clients:       ${metrics['blocked_clients'] || 'N/A'}`);
      console.log(`   Max Clients:           ${metrics['maxclients'] || 'N/A'}`);
      
      const serverInfo = await client.info('server');
      const serverLines = serverInfo.split('\r\n');
      serverLines.forEach(line => {
        if (line.startsWith('uptime_in_seconds:')) {
          const uptime = parseInt(line.split(':')[1], 10);
          console.log(`   Uptime:                ${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`);
        }
      });
      
      const memInfo = await client.info('memory');
      const memLines = memInfo.split('\r\n');
      memLines.forEach(line => {
        if (line.startsWith('used_memory_human:')) {
          console.log(`   Memory Used:           ${line.split(':')[1]}`);
        }
      });
      
      const statsInfo = await client.info('stats');
      const statsLines = statsInfo.split('\r\n');
      statsLines.forEach(line => {
        if (line.startsWith('total_connections_received:')) {
          console.log(`   Total Connections:     ${line.split(':')[1]}`);
        }
        if (line.startsWith('total_commands_processed:')) {
          console.log(`   Total Commands:        ${line.split(':')[1]}`);
        }
      });
      
      const dbKeys = await client.dbsize();
      console.log(`   Keys in DB:            ${dbKeys}`);
      
      console.log('');
    } catch (err) {
      console.error(`❌ Error fetching metrics: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  }, 5000);
  
  console.log('Monitoring started. Press Ctrl+C to stop.\n');
}

process.on('SIGINT', async () => {
  console.log('\n\n⏹️  Shutting down...');
  const client = getRedisClient();
  if (client) {
    await client.quit();
  }
  process.exit(0);
});

monitorRedisPool().catch(console.error);
