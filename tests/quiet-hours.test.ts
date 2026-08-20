import { describe, it, expect } from 'vitest';
import { isInQuietWindow, channelInQuietHours, parseHHMM } from '@/lib/quiet-hours';
import type { QuietHours } from '@/lib/notify-config';

const base: QuietHours = { enabled: true, start: '22:00', end: '06:00', timezone: 'Asia/Jakarta', bypassFor: ['CRITICAL'] };

describe('Quiet Hours', () => {
  it('parseHHMM memvalidasi format manual', () => {
    expect(parseHHMM('22:00')).toEqual({ h: 22, m: 0 });
    expect(parseHHMM('25:00')).toBeNull();
    expect(parseHHMM('22:99')).toBeNull();
  });

  it('facebook: window langsung (22:00..06:00) di Asia/Jakarta', () => {
    // 2026-08-20 23:00 UTC = 2026-08-21 06:00 WIB (Asia/Jakarta)
    // Pilih 22:30 WIB → 15:30 UTC
    const inWindow = new Date('2026-08-20T15:30:00.000Z'); // 22:30 WIB
    expect(isInQuietWindow(base, inWindow)).toBe(true);
  });

  it('tidak dalam jendela pada siang WIB', () => {
    const noon = new Date('2026-08-20T05:00:00.000Z'); // 12:00 WIB
    expect(isInQuietWindow(base, noon)).toBe(false);
  });

  it('channelInQuietHours melewati bypass CRITICAL', () => {
    const inWindow = new Date('2026-08-20T15:30:00.000Z');
    expect(channelInQuietHours(base, 'LOW', inWindow)).toBe(true);
    expect(channelInQuietHours(base, 'CRITICAL', inWindow)).toBe(false);
  });

  it('nonaktif → selalu lolos', () => {
    expect(channelInQuietHours({ ...base, enabled: false }, 'LOW')).toBe(false);
  });
});