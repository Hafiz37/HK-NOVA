/**
 * Digest buffer — anti-spam mode.
 *
 * Saat kebijakan alert mengaktifkan digest, notifikasi per-alert tidak
 * langsung dikirim; ia di-append ke buffer (Setting JSON). Worker
 * `digest-worker` lalu menyiram ringkasan setiap `digestWindowMinutes`.
 */

import { PrismaClient } from '@prisma/client';

export const DIGEST_BUFFER_KEY = 'notify:digest:buffer';

export interface DigestItem {
  type: string;
  severity: string;
  deviceId: string;
  deviceName: string;
  deviceIp?: string;
  message: string;
  timestamp: string;
}

export interface DigestBuffer {
  items: DigestItem[];
  updatedAt?: string;
}

export async function readDigestBuffer(prisma: PrismaClient): Promise<DigestBuffer> {
  try {
    const setting = await prisma.setting.findUnique({ where: { key: DIGEST_BUFFER_KEY } });
    const value = setting?.value as DigestBuffer | undefined;
    if (value && Array.isArray(value.items)) return value;
  } catch (err) {
    console.warn('[Digest] Gagal membaca buffer', err);
  }
  return { items: [], updatedAt: undefined };
}

export async function bufferForDigest(
  prisma: PrismaClient,
  item: DigestItem
): Promise<void> {
  const current = await readDigestBuffer(prisma);
  const next: DigestBuffer = {
    items: [...current.items, item].slice(-200), // cap buffer
    updatedAt: new Date().toISOString(),
  };
  try {
    await prisma.setting.upsert({
      where: { key: DIGEST_BUFFER_KEY },
      update: { value: next as unknown as Parameters<PrismaClient['setting']['create']>[0]['data']['value'] },
      create: { key: DIGEST_BUFFER_KEY, value: next as unknown as Parameters<PrismaClient['setting']['create']>[0]['data']['value'] },
    });
  } catch (err) {
    console.error('[Digest] Gagal menulis buffer', err);
  }
}

export async function clearDigestBuffer(prisma: PrismaClient): Promise<void> {
  try {
    await prisma.setting.deleteMany({ where: { key: DIGEST_BUFFER_KEY } });
  } catch (err) {
    console.error('[Digest] Gagal membersihkan buffer', err);
  }
}

/** Bangun ringkasan teks dari buffer. */
export function buildDigestSummary(buffer: DigestBuffer): string {
  const count = buffer.items.length;
  const severities = new Set(buffer.items.map((i) => i.severity));
  const sevLabel = [...severities].join(', ');
  const lines = buffer.items
    .slice(0, 20)
    .map((i) => `- [${i.severity}] ${i.type} · ${i.deviceName}: ${i.message}`)
    .join('\n');
  const more = count > 20 ? `\n... dan ${count - 20} alert lainnya.` : '';
  return `📦 Ringkasan alert HK-NOVA (${count} event, severity: ${sevLabel})\n\n${lines}${more}`;
}