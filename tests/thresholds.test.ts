import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { resolveThresholds, normalizeThresholdInput } from '../src/lib/thresholds';
import {
  SNMP_HIGH_CPU_THRESHOLD,
  SNMP_HIGH_MEM_THRESHOLD,
  SNMP_HIGH_CPU_RESOLVE_THRESHOLD,
  SNMP_HIGH_MEM_RESOLVE_THRESHOLD,
} from '../src/lib/constants';
import { prisma } from './setup';
import { createTestDevice, cleanTestData } from './setup';
import { createTestAgent, loginAndGetToken } from './utils';

describe('Threshold Override - Unit (resolveThresholds)', () => {
  it('harus pakai nilai global saat tidak ada override', () => {
    const t = resolveThresholds(null);
    expect(t.cpuAlert).toBe(SNMP_HIGH_CPU_THRESHOLD);
    expect(t.memAlert).toBe(SNMP_HIGH_MEM_THRESHOLD);
    expect(t.cpuResolve).toBe(SNMP_HIGH_CPU_RESOLVE_THRESHOLD);
    expect(t.memResolve).toBe(SNMP_HIGH_MEM_RESOLVE_THRESHOLD);
  });

  it('harus pakai override alert jika diisi', () => {
    const t = resolveThresholds({ cpuThresholdOverride: 70, memThresholdOverride: 80 });
    expect(t.cpuAlert).toBe(70);
    expect(t.memAlert).toBe(80);
  });

  it('harus derive resolve = alert - 5 jika resolve override tidak diisi', () => {
    const t = resolveThresholds({ cpuThresholdOverride: 70 });
    expect(t.cpuAlert).toBe(70);
    expect(t.cpuResolve).toBe(65);
  });

  it('harus pakai resolve override eksplisit', () => {
    const t = resolveThresholds({ cpuThresholdOverride: 70, cpuResolveThresholdOverride: 60 });
    expect(t.cpuResolve).toBe(60);
  });
});

describe('Threshold Override - Unit (normalizeThresholdInput)', () => {
  it('undefined/null/kosong => null', () => {
    expect(normalizeThresholdInput(undefined)).toBeNull();
    expect(normalizeThresholdInput(null)).toBeNull();
    expect(normalizeThresholdInput('')).toBeNull();
  });

  it('bukan angka => null', () => {
    expect(normalizeThresholdInput('abc')).toBeNull();
  });

  it('dipaksa ke rentang 1..100', () => {
    expect(normalizeThresholdInput('150')).toBe(100);
    expect(normalizeThresholdInput('0')).toBe(1);
    expect(normalizeThresholdInput('-5')).toBe(1);
    expect(normalizeThresholdInput('85')).toBe(85);
  });
});

describe('Threshold Override - API Integration', () => {
  let adminToken: string;
  let testDeviceIds: string[] = [];

  beforeAll(async () => {
    adminToken = await loginAndGetToken('admin', 'admin123');
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

  beforeEach(async () => {
    await cleanTestData();
    testDeviceIds = [];
  });

  const adminAgent = () => createTestAgent({ token: adminToken });

  it('PATCH /api/devices/[id] menyimpan threshold override', async () => {
    const device = await createTestDevice();
    testDeviceIds.push(device.id);

    const patchRes = await adminAgent()
      .patch(`/api/devices/${device.id}`)
      .send({ cpuThresholdOverride: 70, memThresholdOverride: 80 });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.data.cpuThresholdOverride).toBe(70);
    expect(patchRes.body.data.memThresholdOverride).toBe(80);
  });

  it('PATCH dapat menghapus override (null)', async () => {
    const device = await createTestDevice();
    testDeviceIds.push(device.id);

    await adminAgent()
      .patch(`/api/devices/${device.id}`)
      .send({ cpuThresholdOverride: 70 });

    const res = await adminAgent()
      .patch(`/api/devices/${device.id}`)
      .send({ cpuThresholdOverride: null });

    expect(res.status).toBe(200);
    expect(res.body.data.cpuThresholdOverride).toBeNull();
  });
});