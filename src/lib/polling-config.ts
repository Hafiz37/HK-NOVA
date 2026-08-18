import type { PrismaClient } from '@prisma/client';

export const POLL_INTERVAL_OPTIONS = [
  { label: '10 detik', valueMs: 10_000 },
  { label: '1 menit', valueMs: 60_000 },
  { label: '3 menit', valueMs: 180_000 },
  { label: '5 menit', valueMs: 300_000 },
  { label: '10 menit', valueMs: 600_000 },
] as const;

export const DEFAULT_POLL_INTERVAL_MS = 60_000; // 1 menit

export const SETTING_KEY = 'polling:real:interval';

/**
 * Baca interval polling terkonfigurasi dari DB.
 * Returns `null` saat terjadi error DB (caller harus menahan interval saat ini,
 * bukan langsung beralih ke default) — supaya gangguan DB sesaat tidak mengubah
 * frekuensi polling yang sudah ditetapkan operator.
 */
export async function getPollingIntervalMs(prisma: PrismaClient): Promise<number | null> {
  let setting;
  try {
    setting = await prisma.setting.findUnique({
      where: { key: SETTING_KEY },
    });
  } catch (err) {
    console.warn('[Polling Config] Failed to read interval from DB', err);
    return null;
  }

  if (!setting?.value) return DEFAULT_POLL_INTERVAL_MS;

  const value = setting.value as { intervalMs?: number };
  const candidate = value.intervalMs;
  if (candidate && POLL_INTERVAL_OPTIONS.some(opt => opt.valueMs === candidate)) {
    return candidate;
  }
  return DEFAULT_POLL_INTERVAL_MS;
}

export async function setPollingInterval(prisma: PrismaClient, intervalMs: number): Promise<void> {
  try {
    await prisma.setting.upsert({
      where: { key: SETTING_KEY },
      update: { value: { intervalMs } },
      create: { key: SETTING_KEY, value: { intervalMs } },
    });
  } catch (err) {
    console.error('[Polling Config] Failed to save interval', err);
  }
}

export function intervalToLabel(ms: number): string {
  const found = POLL_INTERVAL_OPTIONS.find(opt => opt.valueMs === ms);
  return found ? found.label : '1 menit';
}

export function isAllowedInterval(ms: number): boolean {
  return POLL_INTERVAL_OPTIONS.some(opt => opt.valueMs === ms);
}