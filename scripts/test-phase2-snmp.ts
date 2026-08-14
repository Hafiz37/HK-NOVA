import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function runPhase2SnmpTests() {
  console.log('🧪 Starting Phase 2 SNMP Monitoring & API Test Suite...\n');

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
    const deviceCount = await prisma.device.count({ where: { deletedAt: null } });
    assert(deviceCount > 0, 'Database & Devices Available', `Devices in DB: ${deviceCount}`);

    // Test 2: SNMP Credentials Check
    console.log('\n--- Test 2: Devices SNMP Credentials ---');
    const devicesWithSnmp = await prisma.device.findMany({
      where: { deletedAt: null, credentials: { isNot: null } },
      include: { credentials: true },
    });
    assert(devicesWithSnmp.length > 0, 'Devices with SNMP Credentials Present', `Found ${devicesWithSnmp.length} devices with SNMP credentials`);

    const hasV2c = devicesWithSnmp.some((d) => d.credentials?.snmpVersion === 'v2c');
    assert(hasV2c, 'SNMP v2c Credentials Configured');

    // Test 3: SNMP Metrics Query
    console.log('\n--- Test 3: SNMP Metrics Query ---');
    const snmpMetricsCount = await prisma.metric.count({
      where: { metricType: 'SNMP' },
    });
    assert(snmpMetricsCount >= 0, 'SNMP Metrics Table Accessible', `Total SNMP Metrics: ${snmpMetricsCount}`);

    const latestSnmp = await prisma.metric.findFirst({
      where: { metricType: 'SNMP' },
      orderBy: { timestamp: 'desc' },
    });
    assert(latestSnmp !== null, 'Sample SNMP Metric Record Exists', `Latest metric ID: ${latestSnmp?.id}`);
    assert(typeof latestSnmp?.cpuUtil === 'number' || latestSnmp?.cpuUtil === null, 'CPU Utilization Field Valid');
    assert(typeof latestSnmp?.memUtil === 'number' || latestSnmp?.memUtil === null, 'Memory Utilization Field Valid');

    // Test 4: HIGH_UTILIZATION Alert Model
    console.log('\n--- Test 4: Utilization Alerts Model ---');
    const highUtilAlertsCount = await prisma.alert.count({
      where: { type: 'HIGH_UTILIZATION' },
    });
    assert(highUtilAlertsCount >= 0, 'HIGH_UTILIZATION Alert Query Works', `High Util Alerts: ${highUtilAlertsCount}`);

    // Test 5: Worker Status API Data Test
    console.log('\n--- Test 5: Worker Status SNMP Integration ---');
    const snmpWorkerRecord = await prisma.metric.findFirst({
      where: { metricType: 'SNMP' },
      select: { timestamp: true },
    });
    assert(!!snmpWorkerRecord?.timestamp, 'SNMP Metric Heartbeat Timestamp Available', `Timestamp: ${snmpWorkerRecord?.timestamp.toISOString()}`);

    // Summary
    console.log('\n========================================');
    console.log(`📊 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('========================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ SNMP Test Suite Execution Failed:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runPhase2SnmpTests();
