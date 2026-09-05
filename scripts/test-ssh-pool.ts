import { execSshCommand, runSshCommands } from '../src/lib/device-console';
import { sshPool } from '../src/lib/ssh-pool';

async function testSSHPool() {
  console.log('🧪 Testing SSH Connection Pool\n');
  console.log('================================\n');
  
  const testDevice = {
    host: '192.168.1.100',
    username: 'admin',
    password: 'test123',
    port: 22,
    deviceId: 'test-device-1',
  };
  
  console.log('Test 1: Single command execution');
  try {
    const result = await execSshCommand({
      ...testDevice,
      command: 'show version',
      timeoutMs: 5000,
    });
    console.log(`✅ Result: ${result.ok ? 'SUCCESS' : 'FAILED'}`);
    if (result.error) console.log(`   Error: ${result.error}`);
  } catch (err) {
    console.log(`❌ Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
  
  console.log('\nTest 2: Connection reuse (same device)');
  try {
    const result1 = await execSshCommand({
      ...testDevice,
      command: 'show interfaces',
      timeoutMs: 5000,
    });
    console.log(`   Command 1: ${result1.ok ? 'SUCCESS' : 'FAILED'}`);
    
    const result2 = await execSshCommand({
      ...testDevice,
      command: 'show system',
      timeoutMs: 5000,
    });
    console.log(`   Command 2: ${result2.ok ? 'SUCCESS' : 'FAILED'}`);
    
    const metrics = sshPool.getMetrics();
    console.log(`✅ Reuse ratio: ${metrics.totalReused}/${metrics.totalCreated + metrics.totalReused}`);
  } catch (err) {
    console.log(`❌ Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
  
  console.log('\nTest 3: Multiple devices');
  try {
    const devices = [
      { ...testDevice, deviceId: 'device-1', host: '192.168.1.101' },
      { ...testDevice, deviceId: 'device-2', host: '192.168.1.102' },
      { ...testDevice, deviceId: 'device-3', host: '192.168.1.103' },
    ];
    
    const results = await Promise.allSettled(
      devices.map(dev =>
        execSshCommand({
          ...dev,
          command: 'show status',
          timeoutMs: 5000,
        })
      )
    );
    
    const successful = results.filter(r => r.status === 'fulfilled').length;
    console.log(`✅ Executed on ${devices.length} devices (${successful} successful)`);
    
    const metrics = sshPool.getMetrics();
    console.log(`   Active pools: ${metrics.poolsCount}`);
    console.log(`   Total connections: ${metrics.activeConnections}`);
  } catch (err) {
    console.log(`❌ Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
  }
  
  console.log('\nTest 4: Pool metrics');
  const metrics = sshPool.getMetrics();
  console.log('📊 Final Metrics:');
  console.log(`   Created:   ${metrics.totalCreated}`);
  console.log(`   Reused:    ${metrics.totalReused}`);
  console.log(`   Destroyed: ${metrics.totalDestroyed}`);
  console.log(`   Active:    ${metrics.activeConnections}`);
  console.log(`   Pools:     ${metrics.poolsCount}`);
  
  if (metrics.connectionsPerDevice.length > 0) {
    console.log('\n   Per Device:');
    metrics.connectionsPerDevice.forEach(({ deviceId, total, inUse, idle }) => {
      console.log(`     ${deviceId}: ${total} total (${inUse} in-use, ${idle} idle)`);
    });
  }
  
  console.log('\n✅ All tests completed!');
  await sshPool.shutdown();
}

testSSHPool().catch(console.error);
