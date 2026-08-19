import { PrismaClient, Prisma } from '@prisma/client';
import request from 'supertest';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const prisma = new PrismaClient();

async function loginAsAdmin(): Promise<string | null> {
  const res = await request(BASE_URL)
    .post('/api/auth/login')
    .send({ username: process.env.TEST_ADMIN_USER || 'admin', password: process.env.TEST_ADMIN_PASS || 'admin123' });
  if (res.status !== 200) {
    console.log(`  ❌ Login failed (HTTP ${res.status}): ${JSON.stringify(res.body)}`);
    return null;
  }
  const cookie = res.headers['set-cookie'];
  if (!cookie) {
    console.log('  ❌ No session cookie returned');
    return null;
  }
  const cookies = Array.isArray(cookie) ? cookie : [cookie];
  const sessionCookie = cookies.find((c: string) => c.startsWith('hk_nova_session='));
  if (!sessionCookie) return null;
  return sessionCookie.split(';')[0];
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🧪 HK-NOVA Anomaly Detection Test Script');
  console.log('═══════════════════════════════════════════════════════════\n');

  const adminCookie = await loginAsAdmin();
  if (!adminCookie) {
    console.log('❌ Cannot login. Make sure the dev server is running and admin/admin123 exists.');
    return;
  }
  const agent = request(BASE_URL);

  console.log('Step 1: Membuat device uji khusus (tidak menyentuh data real/demo)...');

  const deviceId = `test-anomaly-${Date.now()}`;
  const deviceIp = `10.201.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 254) + 1}`;

  const device = await prisma.device.create({
    data: {
      id: deviceId,
      name: `Anomaly Test ${Date.now()}`,
      ip: deviceIp,
      type: 'ROUTER',
      vendor: 'TestVendor',
      location: 'Test Lab',
      status: 'UNKNOWN',
    },
  });
  console.log(`  ✓ Device uji dibuat: ${device.name} (${device.ip})\n`);

  try {
    console.log('  Step 2: Seeding 7 hari data historis (200 samples)...');
    const now = new Date();
    const metrics: Prisma.MetricCreateManyInput[] = [];

    for (let i = 0; i < 200; i++) {
      const timestamp = new Date(now.getTime() - i * 30 * 60 * 1000);
      const baseLatency = 20 + Math.random() * 10;
      const baseCpu = 40 + Math.random() * 20;
      const baseMem = 50 + Math.random() * 15;

      metrics.push({
        deviceId,
        metricType: 'ICMP',
        timestamp,
        latency: baseLatency,
        cpuUtil: null,
        memUtil: null,
      });
      metrics.push({
        deviceId,
        metricType: 'SNMP',
        timestamp,
        latency: null,
        cpuUtil: baseCpu,
        memUtil: baseMem,
        interfaceData: {
          ifInOctets: Math.floor(Math.random() * 1000000),
          ifOutOctets: Math.floor(Math.random() * 1000000),
        },
      });
    }

    await prisma.metric.createMany({ data: metrics });
    console.log(`  ✓ Created ${metrics.length} historical metrics\n`);

    console.log('  Step 3: Injecting synthetic anomaly...');

    const injectRes = await agent
      .post('/api/anomalies/inject')
      .set('Cookie', adminCookie)
      .send({
        deviceId,
        metricType: 'cpu',
        value: 150,
      });

    if (injectRes.status === 200) {
      const body = injectRes.body;
      console.log('  ✓ Anomaly injected successfully');
      const anomaly = body?.data?.anomaly;
      console.log(`    Anomaly ID: ${anomaly?.id ?? 'N/A'}`);
      console.log(`    Score: ${anomaly?.anomalyScore != null ? Number(anomaly.anomalyScore).toFixed(3) : 'N/A'}`);
      console.log(`    Severity: ${anomaly?.severity ?? 'N/A'}`);

      if (body?.data?.alert) {
        console.log(`    Alert Created: ${body.data.alert.id}`);
        console.log(`    Alert Severity: ${body.data.alert.severity}`);
      } else {
        console.log('    Alert: Not created (severity too low / deduplicated)');
      }
    } else {
      console.log(`  ❌ Failed to inject anomaly (HTTP ${injectRes.status}): ${JSON.stringify(injectRes.body)}`);
    }

    console.log('\n  Step 4: Verifying anomaly was saved...');

    const anomalies = await prisma.anomaly.findMany({
      where: { deviceId },
      orderBy: { timestamp: 'desc' },
      take: 5,
    });

    console.log(`  Found ${anomalies.length} anomalies for this device`);

    if (anomalies.length > 0) {
      const latest = anomalies[0];
      console.log(`  Latest: ${latest.metricType} | Score: ${latest.anomalyScore.toFixed(3)} | Severity: ${latest.severity}`);
    }

    console.log('\n  Step 5: Checking alerts...');

    const alerts = await prisma.alert.findMany({
      where: {
        deviceId,
        type: 'ANOMALY_DETECTED',
      },
      orderBy: { createdAt: 'desc' },
      take: 3,
    });

    console.log(`  Found ${alerts.length} anomaly alerts for this device`);

    if (alerts.length > 0) {
      const latest = alerts[0];
      console.log(`  Latest: ${latest.severity} | Status: ${latest.status}`);
    }

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('✅ Test completed!');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('\nNext steps:');
    console.log('1. Start anomaly worker: pnpm worker:anomaly');
    console.log('2. Check dashboard: http://localhost:3000/dashboard/anomalies');
    console.log('3. Monitor alerts: http://localhost:3000/dashboard/alerts');
  } finally {
    console.log('\n  Cleanup: menghapus device uji & data terkait...');
    await prisma.alert.deleteMany({ where: { deviceId, type: 'ANOMALY_DETECTED' } });
    await prisma.anomaly.deleteMany({ where: { deviceId } });
    await prisma.alertCooldown.deleteMany({ where: { deviceId } });
    await prisma.metric.deleteMany({ where: { deviceId } });
    await prisma.device.delete({ where: { id: deviceId } }).catch(() => undefined);
    console.log('  ✓ Cleanup selesai (device uji dihapus)');
  }
}

main()
  .catch((err) => {
    console.error('Test failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });