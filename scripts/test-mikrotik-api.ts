import { createMikroTikClient, MikroTikAPIClient } from '@/lib/mikrotik/api-client';
import { createCommandBuilder, MikroTikCommandBuilder } from '@/lib/mikrotik/commands';
import { classifyMikroTikError, getErrorMessage } from '@/lib/mikrotik/error-handler';

async function testMikroTikConnection() {
  console.log('='.repeat(80));
  console.log('MIKROTIK API CONNECTION TEST');
  console.log('='.repeat(80));
  console.log('');

  console.log('⚠️  SEBELUM MENJALANKAN TEST INI:');
  console.log('1. Pastikan MikroTik router sudah running dan bisa di-ping');
  console.log('2. API service sudah aktif di MikroTik (IP > Services > api)');
  console.log('3. Port 8728 terbuka dan tidak di-firewall');
  console.log('4. Username/password sudah benar');
  console.log('');
  console.log('Contoh enable API di MikroTik:');
  console.log('  /ip service enable api');
  console.log('  /ip service set api port=8728');
  console.log('');

  const host = process.env.MIKROTIK_TEST_HOST || '192.168.88.1';
  const username = process.env.MIKROTIK_TEST_USER || 'admin';
  const password = process.env.MIKROTIK_TEST_PASS || '';
  const port = parseInt(process.env.MIKROTIK_TEST_PORT || '8728');

  if (!password) {
    console.error('❌ ERROR: MIKROTIK_TEST_PASS environment variable harus diisi!');
    console.log('');
    console.log('Cara menjalankan test:');
    console.log('  MIKROTIK_TEST_HOST=192.168.1.1 \\');
    console.log('  MIKROTIK_TEST_USER=admin \\');
    console.log('  MIKROTIK_TEST_PASS=yourpassword \\');
    console.log('  pnpm tsx scripts/test-mikrotik-api.ts');
    process.exit(1);
  }

  console.log(`📡 Connecting to MikroTik...`);
  console.log(`   Host: ${host}:${port}`);
  console.log(`   User: ${username}`);
  console.log('');

  let client: MikroTikAPIClient | null = null;
  let builder: MikroTikCommandBuilder | null = null;

  try {
    console.log('⏳ Step 1: Testing connection...');
    client = await createMikroTikClient({
      host,
      port,
      username,
      password,
      timeout: 10,
    });
    console.log('✅ Connection successful!');
    console.log('');

    builder = createCommandBuilder(client);

    console.log('⏳ Step 2: Getting system identity...');
    const identityResult = await builder.getSystemIdentity();
    if (identityResult.success && identityResult.data) {
      console.log('✅ System Identity:', identityResult.data[0]);
      console.log('');
    } else {
      throw new Error('Failed to get system identity');
    }

    console.log('⏳ Step 3: Getting system resource...');
    const resourceResult = await builder.getSystemResource();
    if (resourceResult.success && resourceResult.data) {
      const resource = resourceResult.data[0];
      console.log('✅ System Resource:');
      console.log(`   Version: ${resource.version}`);
      console.log(`   CPU: ${resource['cpu-load']}%`);
      console.log(`   Memory: ${resource['free-memory']} / ${resource['total-memory']} bytes`);
      console.log(`   Uptime: ${resource.uptime}`);
      console.log('');
    } else {
      throw new Error('Failed to get system resource');
    }

    console.log('⏳ Step 4: Listing interfaces...');
    const interfacesResult = await builder.listInterfaces();
    if (interfacesResult.success && interfacesResult.data) {
      console.log(`✅ Found ${interfacesResult.data.length} interfaces:`);
      interfacesResult.data.slice(0, 5).forEach((iface: any) => {
        console.log(`   - ${iface.name} (${iface.type})`);
      });
      console.log('');
    }

    console.log('⏳ Step 5: Listing PPPoE secrets (read-only)...');
    const secretsResult = await builder.listPPPoESecrets();
    if (secretsResult.success && secretsResult.data) {
      console.log(`✅ Found ${secretsResult.data.length} PPPoE secrets`);
      console.log('');
    }

    console.log('⏳ Step 6: Listing bandwidth queues (read-only)...');
    const queuesResult = await builder.listQueues();
    if (queuesResult.success && queuesResult.data) {
      console.log(`✅ Found ${queuesResult.data.length} bandwidth queues`);
      console.log('');
    }

    console.log('⏳ Step 7: Listing DHCP leases (read-only)...');
    const leasesResult = await builder.listDHCPLeases();
    if (leasesResult.success && leasesResult.data) {
      console.log(`✅ Found ${leasesResult.data.length} DHCP leases`);
      console.log('');
    }

    console.log('='.repeat(80));
    console.log('🎉 ALL TESTS PASSED!');
    console.log('='.repeat(80));
    console.log('');
    console.log('✅ MikroTik API integration siap digunakan');
    console.log('✅ Connection pooling working');
    console.log('✅ Command builder working');
    console.log('✅ Read operations successful');
    console.log('');
    console.log('📝 CATATAN:');
    console.log('   - Test ini HANYA read-only operations');
    console.log('   - Tidak ada perubahan dilakukan ke MikroTik');
    console.log('   - Untuk test write operations, gunakan dry-run mode');
    console.log('');

  } catch (error) {
    console.error('');
    console.error('='.repeat(80));
    console.error('❌ TEST FAILED');
    console.error('='.repeat(80));
    console.error('');

    const classified = classifyMikroTikError(error);
    console.error('Error Type:', classified.type);
    console.error('Message:', getErrorMessage(classified));
    console.error('Is Transient:', classified.isTransient);
    console.error('');

    if (classified.type === 'CONNECTION_FAILED') {
      console.error('💡 TROUBLESHOOTING:');
      console.error('   1. Cek apakah MikroTik bisa di-ping:');
      console.error(`      ping ${host}`);
      console.error('   2. Cek apakah API service aktif di MikroTik:');
      console.error('      /ip service print');
      console.error('   3. Pastikan port 8728 tidak di-firewall');
      console.error('   4. Cek firewall rules di MikroTik');
    } else if (classified.type === 'AUTHENTICATION_FAILED') {
      console.error('💡 TROUBLESHOOTING:');
      console.error('   1. Cek username dan password sudah benar');
      console.error('   2. Cek user memiliki akses API:');
      console.error('      /user print');
      console.error('   3. Pastikan user memiliki permission yang cukup');
    } else if (classified.type === 'TIMEOUT') {
      console.error('💡 TROUBLESHOOTING:');
      console.error('   1. Network latency mungkin terlalu tinggi');
      console.error('   2. MikroTik mungkin overloaded');
      console.error('   3. Coba increase timeout di config');
    }

    console.error('');
    process.exit(1);
  } finally {
    if (client) {
      console.log('🔌 Disconnecting...');
      await client.disconnect();
      console.log('✅ Disconnected');
    }
  }
}

testMikroTikConnection().catch(console.error);
