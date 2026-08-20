/**
 * Alert Streak — anti-flapping helper.
 *
 * Menghitung berapa kali berturut-turut sebuah kondisi breach terjadi
 * sebelum sebuah alert diangkat. Mencegah flapping (alert naik-turun cepat)
 * karena satu spike sesaat.
 *
 * State tersimpan di memori per-proses worker. Trade-off terdokumentasi:
 * streak hilang saat worker restart — acceptable untuk mencegah flapping
 * jangka pendek.
 */

const MAX_STREAK_ENTRIES = 10_000;

const streaks = new Map<string, number>();

export interface StreakResult {
  /** true jika streak sudah mencapai batas minimum → alert boleh dibuat. */
  qualifies: boolean;
  /** jumlah sampel berturut-turut yang melewati kondisi. */
  count: number;
}

/** Catat sebuah breach; kembalikan apakah sudah memenuhi batas konfigurasi. */
export function bumpStreak(
  key: string,
  minConsecutive: number
): StreakResult {
  validateKey(key);
  let count = (streaks.get(key) ?? 0) + 1;
  if (count > 100_000) count = 100_000;
  streaks.set(key, count);
  return { qualifies: count >= Math.max(1, minConsecutive), count };
}

/** Reset streak saat kondisi pulih (di bawah threshold). */
export function resetStreak(key: string): void {
  if (streaks.delete(key)) {
    // guard memori: bila map membesar tak terkendali, bersihkan entri tertua
    if (streaks.size > MAX_STREAK_ENTRIES) {
      let i = 0;
      for (const k of streaks.keys()) {
        streaks.delete(k);
        if (++i >= 1000) break;
      }
    }
  }
}

/** Konstanta default: berapa sampel poll berturut-turut sebelum alert. */
export const DEFAULT_MIN_CONSECUTIVE = Number(
  process.env.MIN_CONSECUTIVE_BREACHES_FOR_ALERT ?? '2'
);

function validateKey(key: string): void {
  if (typeof key !== 'string' || key.length === 0 || key.length > 512) {
    throw new Error(`Invalid alert streak key: ${String(key).slice(0, 64)}`);
  }
}