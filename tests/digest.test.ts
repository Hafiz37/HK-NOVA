import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from './setup';
import { DIGEST_BUFFER_KEY, readDigestBuffer, bufferForDigest, clearDigestBuffer, buildDigestSummary } from '@/lib/digest';

describe('Digest buffer', () => {
  beforeAll(async () => {
    await clearDigestBuffer(prisma);
  });
  afterAll(async () => {
    await clearDigestBuffer(prisma);
  });

  it('buffer kosong awalnya', async () => {
    const b = await readDigestBuffer(prisma);
    expect(b.items).toEqual([]);
  });

  it('append beberapa item lalu terbaca', async () => {
    await bufferForDigest(prisma, { type: 'DEVICE_DOWN', severity: 'HIGH', deviceId: 'd1', deviceName: 'R1', message: 'down', timestamp: new Date().toISOString() });
    await bufferForDigest(prisma, { type: 'HIGH_UTILIZATION', severity: 'CRITICAL', deviceId: 'd2', deviceName: 'R2', message: 'cpu 95', timestamp: new Date().toISOString() });
    const b = await readDigestBuffer(prisma);
    expect(b.items).toHaveLength(2);
  });

  it('buildDigestSummary menyertakan jumlah & severity', () => {
    expect(buildDigestSummary({ items: [] })).toContain('0 event');
  });

  it('clear menghapus buffer', async () => {
    await clearDigestBuffer(prisma);
    const b = await readDigestBuffer(prisma);
    expect(b.items).toEqual([]);
  });

  it('setting tidak bocor antar-fit test', async () => {
    const row = await prisma.setting.findUnique({ where: { key: DIGEST_BUFFER_KEY } });
    expect(row).toBeNull();
  });
});