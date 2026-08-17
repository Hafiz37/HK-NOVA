import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from './setup';
import { createTestDevice, cleanTestData } from './setup';
import { createTestAgent, loginAndGetToken } from './utils';

describe('Top-N Widgets — API Integration', () => {
  let adminToken: string;
  let testDeviceIds: string[] = [];

  beforeAll(async () => {
    adminToken = await loginAndGetToken('admin', 'admin123');
  });

  beforeEach(async () => {
    await cleanTestData();
    testDeviceIds = [];
  });

  afterAll(async () => {
    for (const id of testDeviceIds) {
      try {
        await prisma.device.delete({ where: { id } });
      } catch {
        // ignore
      }
    }
    await prisma.user.deleteMany({ where: { username: { startsWith: 'testop' } } });
  });

  const adminAgent = () => createTestAgent({ token: adminToken });

  it('topLatency diurutkan descending & mematuhi limit n', async () => {
    // Nilai dibuat dominan agar tak terkalahkan data demo
    const d1 = await createTestDevice();
    const d2 = await createTestDevice();
    const d3 = await createTestDevice();
    testDeviceIds.push(d1.id, d2.id, d3.id);

    const t = new Date();
    await prisma.metric.createMany({
      data: [
        { deviceId: d1.id, metricType: 'ICMP', latency: 99999, timestamp: t },
        { deviceId: d2.id, metricType: 'ICMP', latency: 88888, timestamp: t },
        { deviceId: d3.id, metricType: 'ICMP', latency: 77777, timestamp: t },
      ],
    });

    const res = await adminAgent().get('/api/monitoring/top?n=2');
    expect(res.status).toBe(200);
    expect(res.body.topLatency).toHaveLength(2);
    expect(res.body.topLatency[0].deviceId).toBe(d1.id);
    expect(res.body.topLatency[0].value).toBe(99999);
    expect(res.body.topLatency[1].deviceId).toBe(d2.id);
    // d3 (peringkat 3) tidak masuk karena limit n=2
    expect(res.body.topLatency.some((x: { deviceId: string }) => x.deviceId === d3.id)).toBe(false);
  });

  it('topCpu & topMem menggunakan metric SNMP terbaru', async () => {
    const d1 = await createTestDevice();
    const d2 = await createTestDevice();
    testDeviceIds.push(d1.id, d2.id);

    const t = new Date();
    await prisma.metric.createMany({
      data: [
        { deviceId: d1.id, metricType: 'SNMP', cpuUtil: 99.9, memUtil: 99.5, timestamp: t },
        { deviceId: d2.id, metricType: 'SNMP', cpuUtil: 30, memUtil: 50, timestamp: t },
      ],
    });

    const res = await adminAgent().get('/api/monitoring/top?n=5');
    expect(res.status).toBe(200);
    expect(res.body.topCpu[0].deviceId).toBe(d1.id);
    expect(res.body.topCpu[0].value).toBeCloseTo(99.9, 1);
    expect(res.body.topMem[0].deviceId).toBe(d1.id);
    expect(res.body.topMem[0].value).toBeCloseTo(99.5, 1);
  });

  it('topAlerts mengurutkan perangkat dengan alert aktif terbanyak', async () => {
    const d1 = await createTestDevice();
    const d2 = await createTestDevice();
    const d3 = await createTestDevice();
    testDeviceIds.push(d1.id, d2.id, d3.id);

    const rows: Array<Record<string, unknown>> = [];
    for (let i = 0; i < 5; i++) rows.push({ type: 'DEVICE_DOWN', deviceId: d1.id, message: `a${i}`, severity: 'HIGH', status: 'ACTIVE' });
    for (let i = 0; i < 3; i++) rows.push({ type: 'HIGH_UTILIZATION', deviceId: d2.id, message: `b${i}`, severity: 'HIGH', status: 'ACTIVE' });
    for (let i = 0; i < 2; i++) rows.push({ type: 'DEVICE_DOWN', deviceId: d3.id, message: `c${i}`, severity: 'HIGH', status: 'ACTIVE' });

    await prisma.alert.createMany({
      data: rows as Array<{
        type: 'DEVICE_DOWN' | 'HIGH_UTILIZATION';
        deviceId: string;
        message: string;
        severity: 'HIGH';
        status: 'ACTIVE';
      }>,
    });

    const res = await adminAgent().get('/api/monitoring/top?n=5');
    expect(res.status).toBe(200);
    expect(res.body.topAlerts[0].deviceId).toBe(d1.id);
    expect(res.body.topAlerts[0].value).toBe(5);
    expect(res.body.topAlerts[1].deviceId).toBe(d2.id);
    expect(res.body.topAlerts[1].value).toBe(3);
    // d3 hadir dengan 2 alert
    const d3Entry = res.body.topAlerts.find((x: { deviceId: string }) => x.deviceId === d3.id);
    expect(d3Entry).toBeDefined();
    expect(d3Entry.value).toBe(2);
  });

  it('device tanpa metric tidak muncul di daftar nilai', async () => {
    const d1 = await createTestDevice();
    const d2 = await createTestDevice(); // tidak punya metric
    testDeviceIds.push(d1.id, d2.id);

    await prisma.metric.create({
      data: { deviceId: d1.id, metricType: 'ICMP', latency: 88888, timestamp: new Date() },
    });

    const res = await adminAgent().get('/api/monitoring/top?n=5');
    expect(res.status).toBe(200);
    const d1Entry = res.body.topLatency.find((x: { deviceId: string }) => x.deviceId === d1.id);
    expect(d1Entry).toBeDefined();
    expect(res.body.topLatency.some((x: { deviceId: string }) => x.deviceId === d2.id)).toBe(false);
  });

  it('return 401 tanpa autentikasi', async () => {
    const agent = createTestAgent();
    const res = await agent.get('/api/monitoring/top');
    expect(res.status).toBe(401);
  });
});