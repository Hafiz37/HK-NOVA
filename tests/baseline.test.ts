import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { prisma } from './setup';
import { createTestDevice, cleanTestData } from './setup';
import { createTestAgent, loginAndGetToken } from './utils';
import {
  computeBaseline,
  deviationScore,
  classifyDeviation,
  type BaselineStats,
} from '../src/lib/baseline';

describe('Baseline — Unit (computeBaseline)', () => {
  it('menghitung mean, stddev, min, max, p95, count', () => {
    const stats = computeBaseline([10, 20, 30, 40, 50]);
    expect(stats.mean).toBe(30);
    expect(stats.min).toBe(10);
    expect(stats.max).toBe(50);
    expect(stats.p95).toBe(50); // indeks ke-5 dari 5 data
    expect(stats.count).toBe(5);
    // stddev sampel dari [10..50]: sqrt(sum((v-30)^2)/4)
    const expectedStddev = Math.sqrt((400 + 100 + 0 + 100 + 400) / 4);
    expect(stats.stddev).toBeCloseTo(expectedStddev, 5);
  });

  it('data kosong → semua nol', () => {
    const stats = computeBaseline([]);
    expect(stats).toEqual({ mean: 0, stddev: 0, min: 0, max: 0, p95: 0, count: 0 });
  });

  it('p95 pada jumlah non-bulat memakai indeks terdekat', () => {
    const stats = computeBaseline([1, 2, 3, 4]);
    expect(stats.p95).toBe(4);
    expect(stats.mean).toBe(2.5);
  });
});

describe('Baseline — Unit (deviationScore & classifyDeviation)', () => {
  const baseline: BaselineStats = { mean: 50, stddev: 10, min: 30, max: 70, p95: 65, count: 100 };

  it('nilai = mean → skor 0, level NORMAL', () => {
    expect(deviationScore(50, baseline)).toBe(0);
    expect(classifyDeviation(50, baseline)).toBe('NORMAL');
  });

  it('z di bawah 2σ → NORMAL', () => {
    expect(classifyDeviation(68, baseline)).toBe('NORMAL'); // z=1.8
  });

  it('z 2–3σ → WARNING', () => {
    expect(classifyDeviation(75, baseline)).toBe('WARNING'); // z=2.5
  });

  it('z > 3σ → CRITICAL', () => {
    expect(classifyDeviation(90, baseline)).toBe('CRITICAL'); // z=4
  });

  it('sampel < 3 → INSUFFICIENT_DATA', () => {
    const few: BaselineStats = { ...baseline, count: 2 };
    expect(classifyDeviation(90, few)).toBe('INSUFFICIENT_DATA');
  });

  it('stddev 0 & nilai != mean → Infinity (melampaui ambang)', () => {
    const flat: BaselineStats = { mean: 50, stddev: 0, min: 50, max: 50, p95: 50, count: 100 };
    expect(deviationScore(60, flat)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('Baseline — API Integration', () => {
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

  it('baseline dari data historis stabil → current NORMAL', async () => {
    const device = await createTestDevice();
    testDeviceIds.push(device.id);

    // Seed 100 metric ICMP latensi konstan 50ms (1 menit per poin ≈ 100 menit terakhir)
    await prisma.metric.createMany({
      data: Array.from({ length: 100 }, (_, i) => ({
        deviceId: device.id,
        metricType: 'ICMP',
        latency: 50,
        timestamp: new Date(Date.now() - (100 - i) * 60_000),
      })),
    });

    const res = await adminAgent().get(`/api/devices/${device.id}/baseline?field=latency&hours=24`);
    expect(res.status).toBe(200);
    expect(res.body.baseline.mean).toBeCloseTo(50, 5);
    expect(res.body.baseline.count).toBe(100);
    expect(res.body.current).toBe(50);
    expect(res.body.deviation.level).toBe('NORMAL');
    expect(res.body.insufficientData).toBe(false);
  });

  it('spike di nilai terkini → level CRITICAL', async () => {
    const device = await createTestDevice();
    testDeviceIds.push(device.id);

    // 100 poin konstan 50ms, lalu 1 spike 200ms (terbaru)
    const rows = Array.from({ length: 100 }, (_, i) => ({
      deviceId: device.id,
      metricType: 'ICMP' as const,
      latency: 50,
      timestamp: new Date(Date.now() - (101 - i) * 60_000),
    }));
    rows.push({
      deviceId: device.id,
      metricType: 'ICMP',
      latency: 200,
      timestamp: new Date(),
    });

    await prisma.metric.createMany({ data: rows });

    const res = await adminAgent().get(`/api/devices/${device.id}/baseline?field=latency&hours=24`);
    expect(res.status).toBe(200);
    expect(res.body.current).toBe(200);
    expect(res.body.deviation.level).toBe('CRITICAL');
    expect(typeof res.body.deviation.score).toBe('number');
  });

  it('cold start (belum ada data) → INSUFFICIENT_DATA', async () => {
    const device = await createTestDevice();
    testDeviceIds.push(device.id);

    const res = await adminAgent().get(`/api/devices/${device.id}/baseline?field=cpu&hours=24`);
    expect(res.status).toBe(200);
    expect(res.body.current).toBeNull();
    expect(res.body.insufficientData).toBe(true);
    expect(res.body.deviation.level).toBe('INSUFFICIENT_DATA');
  });

  it('field tidak valid → 400', async () => {
    const device = await createTestDevice();
    testDeviceIds.push(device.id);

    const res = await adminAgent().get(`/api/devices/${device.id}/baseline?field=bogus`);
    expect(res.status).toBe(400);
  });

  it('device tidak ada → 404', async () => {
    const res = await adminAgent().get('/api/devices/nonexistent/baseline?field=cpu');
    expect(res.status).toBe(404);
  });

  it('overview /api/monitoring/baseline mengurutkan & menyertakan deviasi', async () => {
    const d1 = await createTestDevice();
    const d2 = await createTestDevice();
    testDeviceIds.push(d1.id, d2.id);

    const rows: Array<{ deviceId: string; metricType: 'SNMP'; cpuUtil: number; timestamp: Date }> = [];
    for (const d of [d1, d2]) {
      for (let i = 0; i < 50; i++) {
        rows.push({
          deviceId: d.id,
          metricType: 'SNMP',
          cpuUtil: 40,
          timestamp: new Date(Date.now() - (50 - i) * 300_000),
        });
      }
    }
    // Spike di d1 → jadi ranking teratas
    rows.push({ deviceId: d1.id, metricType: 'SNMP', cpuUtil: 98, timestamp: new Date() });
    rows.push({ deviceId: d2.id, metricType: 'SNMP', cpuUtil: 39, timestamp: new Date() });

    await prisma.metric.createMany({ data: rows });

    const res = await adminAgent().get('/api/monitoring/baseline?field=cpu&n=5');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    expect(res.body.data[0].device.id).toBe(d1.id);
    expect(res.body.data[0].deviation.level).toBe('CRITICAL');
  });
});