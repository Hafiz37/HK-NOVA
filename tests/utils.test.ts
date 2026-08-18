import { describe, it, expect } from 'vitest';
import {
  parsePositiveIntParam,
  parsePositiveNumberParam,
  isValidIpv4,
  escapeHtml,
} from '@/lib/utils';

describe('parsePositiveIntParam', () => {
  it('mengembalikan nilai valid yang di-clamp', () => {
    expect(parsePositiveIntParam('5', 1, 1, 20)).toBe(5);
    expect(parsePositiveIntParam('99', 1, 1, 20)).toBe(20);
    expect(parsePositiveIntParam('0', 1, 1, 20)).toBe(1);
    expect(parsePositiveIntParam('-3', 1, 1, 20)).toBe(1);
  });

  it('fallback saat nilai bukan angka (cegah NaN → Prisma 500)', () => {
    expect(parsePositiveIntParam('abc', 10, 1, 50)).toBe(10);
    expect(parsePositiveIntParam('', 10, 1, 50)).toBe(10);
    expect(parsePositiveIntParam(null, 10, 1, 50)).toBe(10);
    expect(parsePositiveIntParam('NaN', 10, 1, 50)).toBe(10);
  });

  it('nilai desimal dianggap tidak valid → fallback', () => {
    expect(parsePositiveIntParam('3.9', 10, 1, 20)).toBe(10);
  });
});

describe('parsePositiveNumberParam', () => {
  it('fallback saat bukan angka (cegah new Date(NaN))', () => {
    expect(parsePositiveNumberParam('x', 24, 1, 168)).toBe(24);
    expect(parsePositiveNumberParam(null, 24, 1, 168)).toBe(24);
  });

  it('clamp ke rentang', () => {
    expect(parsePositiveNumberParam('2.5', 24, 1, 168)).toBe(2.5);
    expect(parsePositiveNumberParam('999', 24, 1, 168)).toBe(168);
  });
});

describe('isValidIpv4', () => {
  it('menerima IPv4 valid', () => {
    expect(isValidIpv4('192.168.1.1')).toBe(true);
    expect(isValidIpv4('0.0.0.0')).toBe(true);
    expect(isValidIpv4('255.255.255.255')).toBe(true);
    expect(isValidIpv4('10.0.0.1')).toBe(true);
  });

  it('menolak IPv4 tak valid / hostname', () => {
    expect(isValidIpv4('999.999.999.999')).toBe(false);
    expect(isValidIpv4('256.1.1.1')).toBe(false);
    expect(isValidIpv4('192.168.1')).toBe(false);
    expect(isValidIpv4('router1.local')).toBe(false);
    expect(isValidIpv4('2001:db8::1')).toBe(false);
  });
});

describe('escapeHtml', () => {
  it('escape karakter HTML/XML', () => {
    expect(escapeHtml('<Router & "Box">')).toBe(
      '&lt;Router &amp; "Box"&gt;'
    );
    expect(escapeHtml('Core-01 A&B\nCore-01A')).toBe('Core-01 A&amp;B\nCore-01A');
  });
});