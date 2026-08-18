import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from './setup';
import { checkCooldown, markNotified, shouldSendNotification, DEFAULT_COOLDOWN_KEY } from '@/lib/cooldown';

const prefix = `test-cd-${Date.now()}`;

describe('Alert Cooldown — DB persistence', () => {
  beforeAll(async () => {
    await prisma.alertCooldown.deleteMany({ where: { deviceId: { startsWith: prefix } } });
  });

  afterAll(async () => {
    await prisma.alertCooldown.deleteMany({
      where: { deviceId: { startsWith: prefix } },
    });
  });

  it('mengizinkan saat tidak ada record cooldown', async () => {
    const deviceId = `${prefix}-fresh`;
    const r = await checkCooldown(prisma, {
      deviceId,
      channel: 'telegram',
      cooldownKey: DEFAULT_COOLDOWN_KEY,
      cooldownMs: 5000,
    });
    expect(r.allowed).toBe(true);
  });

  it('shouldSendNotification menandai dan mengizinkan pengiriman pertama', async () => {
    const deviceId = `${prefix}-first`;
    const allowed = await shouldSendNotification(prisma, {
      deviceId,
      channel: 'email',
      cooldownKey: 'cpu',
      cooldownMs: 5000,
    });
    expect(allowed).toBe(true);

    const record = await prisma.alertCooldown.findUnique({
      where: {
        deviceId_channel_cooldownKey: {
          deviceId,
          channel: 'email',
          cooldownKey: 'cpu',
        },
      },
    });
    expect(record).not.toBeNull();
    expect(record!.cooldownAt).toBeInstanceOf(Date);
  });

  it('menolak pengiriman kedua dalam window cooldown', async () => {
    const deviceId = `${prefix}-second`;
    await markNotified(prisma, {
      deviceId,
      channel: 'telegram',
      cooldownKey: 'default',
      cooldownMs: 60_000,
    });

    const allowed = await shouldSendNotification(prisma, {
      deviceId,
      channel: 'telegram',
      cooldownKey: 'default',
      cooldownMs: 60_000,
    });
    expect(allowed).toBe(false);
  });

  it('cooldown berlaku per channel (email tidak terblokir oleh telegram)', async () => {
    const deviceId = `${prefix}-channel-ind`;
    await markNotified(prisma, {
      deviceId,
      channel: 'telegram',
      cooldownKey: 'default',
      cooldownMs: 60_000,
    });

    const allowed = await shouldSendNotification(prisma, {
      deviceId,
      channel: 'email',
      cooldownKey: 'default',
      cooldownMs: 60_000,
    });
    expect(allowed).toBe(true);
  });

  it('cooldown berlaku per key (cpu vs mem independen)', async () => {
    const deviceId = `${prefix}-key-ind`;
    await markNotified(prisma, {
      deviceId,
      channel: 'telegram',
      cooldownKey: 'cpu',
      cooldownMs: 60_000,
    });

    const cpuBlocked = await shouldSendNotification(prisma, {
      deviceId,
      channel: 'telegram',
      cooldownKey: 'cpu',
      cooldownMs: 60_000,
    });
    const memAllowed = await shouldSendNotification(prisma, {
      deviceId,
      channel: 'telegram',
      cooldownKey: 'mem',
      cooldownMs: 60_000,
    });
    expect(cpuBlocked).toBe(false);
    expect(memAllowed).toBe(true);
  });

  it('mengizinkan kembali setelah window berlalu', async () => {
    const deviceId = `${prefix}-expire`;
    await markNotified(prisma, {
      deviceId,
      channel: 'webhook',
      cooldownKey: 'default',
      cooldownMs: 150,
    });

    const blocked = await shouldSendNotification(prisma, {
      deviceId,
      channel: 'webhook',
      cooldownKey: 'default',
      cooldownMs: 150,
    });
    expect(blocked).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 250));

    const allowed = await shouldSendNotification(prisma, {
      deviceId,
      channel: 'webhook',
      cooldownKey: 'default',
      cooldownMs: 150,
    });
    expect(allowed).toBe(true);
  });
});