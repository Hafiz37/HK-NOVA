import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from './setup';
import { createTestDevice, cleanTestData } from './setup';
import { createTestAgent, loginAndGetToken } from './utils';
import {
  createAlertIfNotDuplicate,
  processDeviceDownAlert,
  processUtilizationAlert,
  resolveUtilizationAlert,
  resolveDeviceDownAlert,
  processCustomOidAlert,
  resolveCustomOidAlert,
  dedupKeyCpu,
  dedupKeyDown,
  dedupKeyCustomOid,
} from '../src/lib/alert-engine';

describe('Alert Engine — Deduplikasi', () => {
  let testDeviceIds: string[] = [];

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
  });

  it('duplicate dedupKey → hanya 1 alert aktif', async () => {
    const device = await createTestDevice();
    testDeviceIds.push(device.id);

    const first = await createAlertIfNotDuplicate(prisma, {
      type: 'DEVICE_DOWN',
      deviceId: device.id,
      message: 'test down',
      severity: 'HIGH',
      dedupKey: dedupKeyDown(device.id),
    });

    const second = await createAlertIfNotDuplicate(prisma, {
      type: 'DEVICE_DOWN',
      deviceId: device.id,
      message: 'test down lagi',
      severity: 'HIGH',
      dedupKey: dedupKeyDown(device.id),
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);

    const count = await prisma.alert.count({
      where: { deviceId: device.id, type: 'DEVICE_DOWN', status: 'ACTIVE' },
    });
    expect(count).toBe(1);
  });

  it('proses utilization dua kali → hanya 1 alert aktif (dedupe by key)', async () => {
    const device = await createTestDevice();
    testDeviceIds.push(device.id);

    const first = await processUtilizationAlert(prisma, {
      device: { id: device.id, name: device.name, ip: device.ip },
      metric: 'cpu',
      value: 92,
      threshold: 85,
      minConsecutive: 1,
    });
    const second = await processUtilizationAlert(prisma, {
      device: { id: device.id, name: device.name, ip: device.ip },
      metric: 'cpu',
      value: 96,
      threshold: 85,
      minConsecutive: 1,
    });

    expect(first.action).toBe('created');
    expect(second.action).toBe('duplicate');

    const count = await prisma.alert.count({
      where: { deviceId: device.id, type: 'HIGH_UTILIZATION', status: 'ACTIVE' },
    });
    expect(count).toBe(1);
  });
});

describe('Alert Engine — Korelasi (Gabung + Eskalasi)', () => {
  let testDeviceIds: string[] = [];

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
  });

  it('DEVICE_DOWN menyerap HIGH_UTILIZATION aktif → eskalasi CRITICAL + child', async () => {
    const device = await createTestDevice();
    testDeviceIds.push(device.id);

    // Bikin HIGH_UTILIZATION aktif dulu
    await prisma.alert.create({
      data: {
        type: 'HIGH_UTILIZATION',
        deviceId: device.id,
        message: 'CPU utilization on X is 96.5%, exceeding threshold of 85%.',
        severity: 'CRITICAL',
        status: 'ACTIVE',
        dedupKey: dedupKeyCpu(device.id),
      },
    });

    const result = await processDeviceDownAlert(
      prisma,
      { id: device.id, name: device.name, ip: device.ip },
      'Device unreachable'
    );

    expect(result.alert.severity).toBe('CRITICAL');

    const util = await prisma.alert.findFirst({
      where: { deviceId: device.id, type: 'HIGH_UTILIZATION' },
    });
    expect(util).not.toBeNull();
    expect(util?.status).toBe('RESOLVED');
    expect(util?.parentId).toBe(result.alert.id);

    const down = await prisma.alert.findUnique({ where: { id: result.alert.id } });
    expect(down?.severity).toBe('CRITICAL');
    expect(down?.message).toContain('[Terkorelasi]');
  });

  it('HIGH_UTILIZATION saat perangkat DOWN → tidak buat baru, eskalasi DEVICE_DOWN', async () => {
    const device = await createTestDevice();
    testDeviceIds.push(device.id);

    // Perangkat sedang DOWN
    await prisma.alert.create({
      data: {
        type: 'DEVICE_DOWN',
        deviceId: device.id,
        message: 'Device unreachable',
        severity: 'HIGH',
        status: 'ACTIVE',
      },
    });

    const result = await processUtilizationAlert(prisma, {
      device: { id: device.id, name: device.name, ip: device.ip },
      metric: 'mem',
      value: 95,
      threshold: 90,
      minConsecutive: 1,
    });

    expect(result.action).toBe('correlated');

    // Tidak ada HIGH_UTILIZATION yang aktif (yang dibuat hanya child RESOLVED)
    const activeUtil = await prisma.alert.count({
      where: { deviceId: device.id, type: 'HIGH_UTILIZATION', status: 'ACTIVE' },
    });
    expect(activeUtil).toBe(0);

    const down = await prisma.alert.findFirst({
      where: { deviceId: device.id, type: 'DEVICE_DOWN', status: 'ACTIVE' },
    });
    expect(down?.severity).toBe('CRITICAL');
    expect(down?.message).toContain('[Terkorelasi]');
  });

  it('resolve DEVICE_DOWN ikut meresolve child alert', async () => {
    const device = await createTestDevice();
    testDeviceIds.push(device.id);

    const result = await processDeviceDownAlert(
      prisma,
      { id: device.id, name: device.name, ip: device.ip },
      'Device unreachable'
    );

    // Simulasi: buat child aktif tambahan
    const child = await prisma.alert.create({
      data: {
        type: 'HIGH_UTILIZATION',
        deviceId: device.id,
        message: 'CPU utilization high',
        severity: 'HIGH',
        status: 'ACTIVE',
        parentId: result.alert.id,
      },
    });

    const r = await resolveDeviceDownAlert(prisma, device.id);

    expect(r.downResolved).toBe(1);
    expect(r.childrenResolved).toBe(1);

    const parent = await prisma.alert.findUnique({ where: { id: result.alert.id } });
    expect(parent?.status).toBe('RESOLVED');

    const childAfter = await prisma.alert.findUnique({ where: { id: child.id } });
    expect(childAfter?.status).toBe('RESOLVED');
  });

  it('resolveUtilizationAlert (hysteresis) menutup alert aktif', async () => {
    const device = await createTestDevice();
    testDeviceIds.push(device.id);

    await processUtilizationAlert(prisma, {
      device: { id: device.id, name: device.name, ip: device.ip },
      metric: 'cpu',
      value: 92,
      threshold: 85,
      minConsecutive: 1,
    });

    const count = await resolveUtilizationAlert(prisma, {
      deviceId: device.id,
      metric: 'cpu',
      value: 70,
      resolveThreshold: 80,
    });

    expect(count).toBe(1);
    const open = await prisma.alert.count({
      where: { deviceId: device.id, type: 'HIGH_UTILIZATION', status: 'ACTIVE' },
    });
    expect(open).toBe(0);
  });
});

describe('Alert Engine — Tahap 1 (onset, snapshot, custom OID, streak)', () => {
  let testDeviceIds: string[] = [];

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
  });

  it('createAlertIfNotDuplicate mengisi firstTriggeredAt + valueSnapshot + aktivitas CREATED', async () => {
    const device = await createTestDevice();
    testDeviceIds.push(device.id);

    const result = await createAlertIfNotDuplicate(prisma, {
      type: 'DEVICE_DOWN',
      deviceId: device.id,
      message: 'down test',
      severity: 'HIGH',
      dedupKey: dedupKeyDown(device.id),
      valueSnapshot: { status: 'DOWN' },
    });

    expect(result.created).toBe(true);
    const alert = await prisma.alert.findUnique({ where: { id: result.alert.id } });
    expect(alert?.firstTriggeredAt).toBeDefined();
    expect((alert?.valueSnapshot as { status?: string })?.status).toBe('DOWN');

    const activity = await prisma.alertActivity.count({ where: { alertId: alert!.id, action: 'CREATED' } });
    expect(activity).toBe(1);
  });

  it('processCustomOidAlert membuat alert HIGH untuk ambang atas + resolve saat normal', async () => {
    const device = await createTestDevice();
    testDeviceIds.push(device.id);

    const created = await processCustomOidAlert(prisma, device, {
      oid: '1.3.6.1.4.1.9.2.1.56.0',
      name: 'CPU 5s (Cisco)',
      value: 92,
      unit: '%',
      direction: 'HIGH',
      alertHigh: 85,
      alertLow: null,
      minConsecutive: 1,
    });

    expect(created.created).toBe(true);
    expect(created.alert?.severity).toBe('HIGH');

    const open = await prisma.alert.count({
      where: { deviceId: device.id, type: 'CUSTOM_OID_OUT_OF_RANGE', status: 'ACTIVE' },
    });
    expect(open).toBe(1);

    // Dedupe: panggilan kedua tidak membuat duplikat
    const dup = await processCustomOidAlert(prisma, device, {
      oid: '1.3.6.1.4.1.9.2.1.56.0',
      name: 'CPU 5s (Cisco)',
      value: 94,
      unit: '%',
      direction: 'HIGH',
      alertHigh: 85,
      alertLow: null,
      minConsecutive: 1,
    });
    expect(dup.created).toBe(false);

    // Resolve saat nilai kembali normal
    const resolved = await resolveCustomOidAlert(prisma, device.id, '1.3.6.1.4.1.9.2.1.56.0');
    expect(resolved).toBe(1);
    const left = await prisma.alert.count({
      where: { deviceId: device.id, type: 'CUSTOM_OID_OUT_OF_RANGE', status: 'ACTIVE' },
    });
    expect(left).toBe(0);
  });

  it('dedup key custom OID unik per oid', () => {
    expect(dedupKeyCustomOid('dev-1', '1.1')).toBe('custom:oid:dev-1:1.1');
  });

  it('streak: tidak mengangkat alert sebelum N sampel berturut-turut', async () => {
    const device = await createTestDevice();
    testDeviceIds.push(device.id);

    // minConsecutive default 2 → panggilan pertama tidak mengangkat alert
    const first = await processUtilizationAlert(prisma, {
      device: { id: device.id, name: device.name, ip: device.ip },
      metric: 'cpu',
      value: 92,
      threshold: 85,
    });
    expect(first.action).toBe('duplicate');

    const open = await prisma.alert.count({
      where: { deviceId: device.id, type: 'HIGH_UTILIZATION', status: 'ACTIVE' },
    });
    expect(open).toBe(0);

    // Panggilan kedua → streak terpenuhi
    const second = await processUtilizationAlert(prisma, {
      device: { id: device.id, name: device.name, ip: device.ip },
      metric: 'cpu',
      value: 92,
      threshold: 85,
    });
    expect(second.action).toBe('created');

    const after = await prisma.alert.count({
      where: { deviceId: device.id, type: 'HIGH_UTILIZATION', status: 'ACTIVE' },
    });
    expect(after).toBe(1);
  });
});

describe('Alert Korelasi — API Integration', () => {
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
  });

  const adminAgent = () => createTestAgent({ token: adminToken });

  it('GET /api/alerts mengembalikan childAlerts ter-nest', async () => {
    const device = await createTestDevice();
    testDeviceIds.push(device.id);

    // Bikin HIGH_UTILIZATION aktif dulu agar di-absorb jadi child saat down
    await prisma.alert.create({
      data: {
        type: 'HIGH_UTILIZATION',
        deviceId: device.id,
        message: 'CPU utilization on X is 96.5%, exceeding threshold of 85%.',
        severity: 'CRITICAL',
        status: 'ACTIVE',
      },
    });

    const result = await processDeviceDownAlert(
      prisma,
      { id: device.id, name: device.name, ip: device.ip },
      'Device unreachable'
    );

    const res = await adminAgent().get('/api/alerts?status=ACTIVE');
    expect(res.status).toBe(200);

    const parent = res.body.data.find((a: { id: string }) => a.id === result.alert.id);
    expect(parent).toBeDefined();
    expect(Array.isArray(parent.childAlerts)).toBe(true);
    expect(parent.childAlerts.length).toBeGreaterThan(0);
    expect(parent.childAlerts[0].parentId).toBe(result.alert.id);
  });
});
