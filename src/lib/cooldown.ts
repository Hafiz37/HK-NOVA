import type { PrismaClient } from '@prisma/client';

export const COOLDOWN_CHANNELS = ['telegram', 'email', 'webhook', 'sms'] as const;
export type CooldownChannel = (typeof COOLDOWN_CHANNELS)[number];

export const DEFAULT_COOLDOWN_KEY = 'default';

interface CooldownKeyInput {
  deviceId: string;
  channel: CooldownChannel;
  cooldownKey?: string;
  cooldownMs: number;
}

function resolveKey(k: CooldownKeyInput) {
  return {
    deviceId_channel_cooldownKey: {
      deviceId: k.deviceId,
      channel: k.channel,
      cooldownKey: k.cooldownKey ?? DEFAULT_COOLDOWN_KEY,
    },
  };
}

/**
 * Check whether a notification is allowed for the given (device, channel, key).
 * Persisted in the `AlertCooldown` table so it survives worker restarts.
 */
export async function checkCooldown(
  prisma: PrismaClient,
  input: CooldownKeyInput,
  now: number = Date.now()
): Promise<{ allowed: boolean; remainingMs: number }> {
  try {
    const record = await prisma.alertCooldown.findUnique({
      where: resolveKey(input),
    });
    if (!record) return { allowed: true, remainingMs: 0 };

    const elapsed = now - record.cooldownAt.getTime();
    if (elapsed >= input.cooldownMs) return { allowed: true, remainingMs: 0 };
    return { allowed: false, remainingMs: input.cooldownMs - elapsed };
  } catch (err) {
    // On DB error, fail-open (allow notification) so a broken DB never
    // silently suppresses alerts; the send layer handles its own errors.
    console.error('[Cooldown] Failed to check cooldown', err);
    return { allowed: true, remainingMs: 0 };
  }
}

/** Record the timestamp of a notification attempt for a (device, channel, key). */
export async function markNotified(
  prisma: PrismaClient,
  input: CooldownKeyInput,
  at: number = Date.now()
): Promise<void> {
  const cooldownAt = new Date(at);
  try {
    await prisma.alertCooldown.upsert({
      where: resolveKey(input),
      update: { cooldownAt },
      create: {
        deviceId: input.deviceId,
        channel: input.channel,
        cooldownKey: input.cooldownKey ?? DEFAULT_COOLDOWN_KEY,
        cooldownAt,
      },
    });
  } catch (err) {
    console.error('[Cooldown] Failed to persist cooldown', err);
  }
}

/**
 * Atomically check + mark. Returns true when the channel should send right now.
 */
export async function shouldSendNotification(
  prisma: PrismaClient,
  input: CooldownKeyInput,
  now: number = Date.now()
): Promise<boolean> {
  return await prisma.$transaction(async (tx) => {
    const { allowed } = await checkCooldown(tx, input, now);
    if (!allowed) return false;
    await markNotified(tx, input, now);
    return true;
  });
}