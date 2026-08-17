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
  dedupKeyCpu,
  dedupKeyDown,
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
    });
    const second = await processUtilizationAlert(prisma, {
      device: { id: device.id, name: device.name, ip: device.ip },
      metric: 'cpu',
      value: 96,
      threshold: 85,
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
