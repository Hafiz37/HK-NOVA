/**
 * Silent hours (jadwal senyap) per channel.
 *
 * Saat berada dalam jendela quiet, notifikasi channel DILEWATI kecuali
 * severity termasuk dalam `bypassFor` (mis. CRITICAL selalu terkirim).
 * Menghitung waktu lokal per timezone memakai Intl (tanpa tambahan dep).
 */

import type { QuietHours } from './notify-config';

export function parseHHMM(value: string): { h: number; m: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const h = Number(m[1]);
  const mm = Number(m[2]);
  if (h > 23 || mm > 59) return null;
  return { h, m: mm };
}

/** Apakah `now` berada dalam jendela start..end pada `timezone` (mendukung lintas tengah malam). */
export function isInQuietWindow(q: QuietHours, now: Date = new Date()): boolean {
  if (!q.enabled) return false;
  const start = parseHHMM(q.start);
  const end = parseHHMM(q.end);
  if (!start || !end) return false;

  let hour = now.getHours();
  let minute = now.getMinutes();
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: q.timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    hour = Number(parts.find((p) => p.type === 'hour')?.value ?? hour);
    minute = Number(parts.find((p) => p.type === 'minute')?.value ?? minute);
  } catch {
    // timezone tidak valid → fallback waktu lokal server
  }

  const cur = hour * 60 + minute;
  const s = start.h * 60 + start.m;
  const e = end.h * 60 + end.m;
  return s <= e ? cur >= s && cur < e : cur >= s || cur < e;
}

/** true bila channel harus diredam untuk severity ini pada `now`. */
export function channelInQuietHours(
  q: QuietHours | undefined,
  severity: string,
  now: Date = new Date()
): boolean {
  if (!q || !q.enabled) return false;
  if ((q.bypassFor ?? []).includes(severity as never)) return false;
  return isInQuietWindow(q, now);
}