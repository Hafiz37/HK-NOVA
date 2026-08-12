import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function runPhase1Tests() {
  console.log('🧪 Starting Phase 1 ICMP Monitoring & API Test Suite...\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(` ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(` ❌ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
      failed++;
    }
  }

  try {
    // Test 1: Database Connection
    console.log('--- Test 1: Database Connectivity ---');
    const userCount = await prisma.user.count();
    assert(userCount >= 0, 'Prisma Database Connection', `Users in DB: ${userCount}`);

    // Test 2: Seed Devices Check
    console.log('\n--- Test 2: Devices Seeding Verification ---');
    const devices = await prisma.device.findMany({ where: { deletedAt: null } });
    assert(devices.length > 0, 'Device Table Not Empty', `Found ${devices.length} active devices`);

    const hasReachable = devices.some((d) => d.ip === '8.8.8.8' || d.ip === '127.0.0.1');
    assert(hasReachable, 'Reachable Demo IP Present (8.8.8.8 / 127.0.0.1)');

    // Test 3: Create & Delete Device (CRUD validation)
    console.log('\n--- Test 3: Device CRUD Operations ---');
    const testIp = '192.168.99.99';
    
    // Clean up if previous test left record
    await prisma.device.deleteMany({ where: { ip: testIp } });

    const newDev = await prisma.device.create({
      data: {
        name: 'Test Device Temp',
        ip: testIp,
        type: 'ROUTER',
        vendor: 'TestVendor',
        status: 'UNKNOWN',
      },
    });
    assert(!!newDev.id, 'Device Creation (POST /api/devices mock)', `ID: ${newDev.id}`);

    const updatedDev = await prisma.device.update({
      where: { id: newDev.id },
      data: { name: 'Test Device Temp Updated' },
    });
    assert(updatedDev.name === 'Test Device Temp Updated', 'Device Update (PUT /api/devices/[id] mock)');

    const softDeleted = await prisma.device.update({
      where: { id: newDev.id },
      data: { deletedAt: new Date() },
    });
    assert(!!softDeleted.deletedAt, 'Device Soft Delete (DELETE /api/devices/[id] mock)');

    // Clean up test record completely
    await prisma.device.delete({ where: { id: newDev.id } });

    // Test 4: ICMP Metrics & Alerts Query
    console.log('\n--- Test 4: Metrics & Alert Models ---');
    const recentMetricsCount = await prisma.metric.count({
      where: { metricType: 'ICMP' },
    });
    assert(recentMetricsCount >= 0, 'ICMP Metrics Table Accessible', `Total ICMP Metrics: ${recentMetricsCount}`);

    const activeAlertsCount = await prisma.alert.count({
      where: { status: 'ACTIVE' },
    });
    assert(activeAlertsCount >= 0, 'Alert Table Accessible', `Active Alerts: ${activeAlertsCount}`);

    // Test 5: Credential encryption round-trip
    console.log('\n--- Test 5: Encryption Utility ---');
    const { encrypt, decrypt, safeDecrypt } = await import('../src/lib/encryption');
    const sample = 'snmp-public-test';
    const enc = encrypt(sample);
    const dec = decrypt(enc);
    assert(enc.includes(':') && enc !== sample, 'encrypt() produces ciphertext');
    assert(dec === sample, 'decrypt() restores plaintext');
    assert(safeDecrypt(enc) === sample, 'safeDecrypt() handles ciphertext');
    assert(safeDecrypt('legacy-plain') === 'legacy-plain', 'safeDecrypt() keeps legacy plaintext');

    // Test 6: Operator user exists for login
    console.log('\n--- Test 6: Operator Auth Seed ---');
    const admin = await prisma.user.findUnique({ where: { username: 'admin' } });
    assert(!!admin, 'Admin user exists for login');
    assert(!!admin?.passwordHash && admin.passwordHash.length > 20, 'Admin password is hashed');

    // Summary
    console.log('\n========================================');
    console.log(`📊 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('========================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ Test Suite Execution Failed:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runPhase1Tests();
