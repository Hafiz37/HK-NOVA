import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

export function formatBps(bps: number): string {
  if (bps === 0) return '0 bps';
  const k = 1000;
  const sizes = ['bps', 'Kbps', 'Mbps', 'Gbps'];
  const i = Math.floor(Math.log(bps) / Math.log(k));
  return Math.round((bps / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

export function formatLatency(ms: number): string {
  return `${ms.toFixed(2)} ms`;
}

export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function calculateUtilization(current: number, max: number): number {
  if (max === 0) return 0;
  return Math.round((current / max) * 100);
}

/**
 * Parse & clamp integer query param. Returns fallback when value is not a
 * finite number. Prevents NaN from reaching Prisma (`skip`/`take`/dates).
 */
export function parsePositiveIntParam(
  value: string | null,
  fallback: number,
  min: number,
  max: number
): number {
  if (value == null || !/^-?\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
}

/**
 * Parse & clamp positive numeric query param (can be fractional).
 */
export function parsePositiveNumberParam(
  value: string | null,
  fallback: number,
  min: number,
  max: number
): number {
  if (value == null || !/^-?\d+(?:\.\d+)?$/.test(value)) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

const IPV4_PART = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
const IPV4_REGEX = new RegExp(`^${IPV4_PART}(?:\\.${IPV4_PART}){3}$`);

/**
 * Validate an IPv4 address (octets 0-255). Hostname/IPv6 not supported yet.
 */
export function isValidIpv4(ip: string): boolean {
  return IPV4_REGEX.test(ip);
}

/** HTML-escape a string for use with Telegram's parse_mode=HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
