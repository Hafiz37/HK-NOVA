import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from './setup';
import {
  POLL_INTERVAL_OPTIONS,
  DEFAULT_POLL_INTERVAL_MS,
  SETTING_KEY,
  intervalToLabel,
  isAllowedInterval,
  getPollingIntervalMs,
  setPollingInterval,
} from '@/lib/polling-config';
import { createTestAgent, loginAndGetToken, expectSuccessResponse, expectErrorResponse } from './utils';

describe('Polling Config — Pure Helpers', () => {
  it('menyediakan 5 opsi interval sesuai permintaan', () => {
    const labels = POLL_INTERVAL_OPTIONS.map((opt) => opt.label);
    expect(labels).toEqual(['10 detik', '1 menit', '3 menit', '5 menit', '10 menit']);

    const values = POLL_INTERVAL_OPTIONS.map((opt) => opt.valueMs);
    expect(values).toEqual([10_000, 60_000, 180_000, 300_000, 600_000]);
  });

  it('DEFAULT_POLL_INTERVAL_MS = 1 menit dan termasuk opsi yang valid', () => {
    expect(DEFAULT_POLL_INTERVAL_MS).toBe(60_000);
    expect(isAllowedInterval(DEFAULT_POLL_INTERVAL_MS)).toBe(true);
  });

  it('isAllowedInterval menolak nilai tak dikenal', () => {
    expect(isAllowedInterval(60_000)).toBe(true);
    expect(isAllowedInterval(20_000)).toBe(false);
    expect(isAllowedInterval(60)).toBe(false);
  });

  it('intervalToLabel memetakan ms ke label', () => {
    expect(intervalToLabel(10_000)).toBe('10 detik');
    expect(intervalToLabel(60_000)).toBe('1 menit');
    expect(intervalToLabel(180_000)).toBe('3 menit');
    expect(intervalToLabel(300_000)).toBe('5 menit');
    expect(intervalToLabel(600_000)).toBe('10 menit');
  });

  it('intervalToLabel fallback untuk nilai tak dikenal', () => {
    expect(intervalToLabel(999)).toBe('1 menit');
  });
});

describe('Polling Interval — DB Functions', () => {
  afterAll(async () => {
    await prisma.setting.deleteMany({ where: { key: SETTING_KEY } });
  });

  it('getPollingIntervalMs mengembalikan default saat belum tersimpan', async () => {
    await prisma.setting.deleteMany({ where: { key: SETTING_KEY } });
    const ms = await getPollingIntervalMs(prisma);
    expect(ms).toBe(DEFAULT_POLL_INTERVAL_MS);
  });

  it('setPollingInterval menyimpan nilai yang valid', async () => {
    await setPollingInterval(prisma, 300_000);
    const saved = await getPollingIntervalMs(prisma);
    expect(saved).toBe(300_000);
  });

  it('getPollingIntervalMs menolak nilai tidak valid di DB dan kembali ke default', async () => {
    await prisma.setting.upsert({
      where: { key: SETTING_KEY },
      update: { value: { intervalMs: 20_000 } },
      create: { key: SETTING_KEY, value: { intervalMs: 20_000 } },
    });
    const ms = await getPollingIntervalMs(prisma);
    expect(ms).toBe(DEFAULT_POLL_INTERVAL_MS);
  });
});

describe('Polling Interval API Integration Tests', () => {
  let adminToken: string;
  let operatorToken: string;

  beforeAll(async () => {
    adminToken = await loginAndGetToken('admin', 'admin123');

    // Buat user OPERATOR untuk menguji aturan role
    const operatorUser = await prisma.user.create({
      data: {
        id: `test-op-poll-${Date.now()}`,
        username: `testoppoll${Date.now()}`,
        passwordHash: await (await import('bcryptjs')).hash('testpass123', 10),
        role: 'OPERATOR',
      },
    });
    operatorToken = await loginAndGetToken(operatorUser.username, 'testpass123');
  });

  afterAll(async () => {
    await prisma.setting.deleteMany({ where: { key: SETTING_KEY } });
    await prisma.user.deleteMany({ where: { username: { startsWith: 'testoppoll' } } });
  });

  it('GET tanpa sesi → 401', async () => {
    const res = await createTestAgent().get('/api/settings/polling-interval');
    expectErrorResponse(res, 401);
  });

  it('GET dengan ADMIN mengembalikan interval + daftar opsi', async () => {
    const res = await createTestAgent({ token: adminToken }).get('/api/settings/polling-interval');
    const data = expectSuccessResponse(res);
    expect(isAllowedInterval(data.intervalMs)).toBe(true);
    expect(Array.isArray(data.options)).toBe(true);
    expect(data.options.length).toBe(5);
  });

  it('POST sebagai OPERATOR → 403', async () => {
    const res = await createTestAgent({ token: operatorToken })
      .post('/api/settings/polling-interval')
      .send({ intervalMs: 60_000 });
    expectErrorResponse(res, 403);
  });

  it('POST dengan interval tidak valid → 400', async () => {
    const res = await createTestAgent({ token: adminToken })
      .post('/api/settings/polling-interval')
      .send({ intervalMs: 20_000 });
    expectErrorResponse(res, 400);
  });

  it('POST dengan interval valid menyimpan dan mengembalikan data', async () => {
    const res = await createTestAgent({ token: adminToken })
      .post('/api/settings/polling-interval')
      .send({ intervalMs: 300_000 });
    const data = expectSuccessResponse(res);
    expect(data.intervalMs).toBe(300_000);
    expect(data.label).toBe('5 menit');

    const saved = await getPollingIntervalMs(prisma);
    expect(saved).toBe(300_000);
  });
});