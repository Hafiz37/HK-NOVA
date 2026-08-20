import { NextResponse } from 'next/server';

interface RateLimitStore {
  tokens: number;
  lastReset: number;
}

interface RateLimitOptions {
  /** Maximum number of requests allowed within windowMs */
  limit: number;
  /** Window size in milliseconds */
  windowMs: number;
}

export interface RateLimitConfig extends RateLimitOptions {
  /** Limit applied to loopback / localhost clients (used to avoid false
   *  positives in local dev & integration tests). Falls back to `limit`. */
  loopbackLimit?: number;
}

const stores = new Map<string, RateLimitStore>();

// Cleanup stale entries every 5 minutes to prevent memory leak
if (typeof setInterval !== 'undefined') {
  const CLEANUP_INTERVAL = 5 * 60 * 1000;
  const interval = setInterval(() => {
    const now = Date.now();
    for (const [key, store] of stores.entries()) {
      if (now - store.lastReset > 10 * 60 * 1000) {
        stores.delete(key);
      }
    }
  }, CLEANUP_INTERVAL);
  if (interval.unref) {
    interval.unref();
  }
}

const LOOPBACK_IPS = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost']);

export function isLoopbackIp(ip: string): boolean {
  return LOOPBACK_IPS.has(ip.toLowerCase());
}

/**
 * Parse a positive integer from env (used to tune limits without code changes).
 */
function envLimit(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Centralized, environment-tunable rate limit presets.
 */
export const RATE_LIMITS: Record<'login' | 'test' | 'mutation' | 'users' | 'settings' | 'export' | 'provision' | 'read', RateLimitConfig> = {
  // Brute-force protection: 5 attempts / minute / (IP + username)
  login: {
    limit: envLimit('RATE_LIMIT_LOGIN_LIMIT', 5),
    windowMs: 60 * 1000,
    loopbackLimit: envLimit('RATE_LIMIT_LOGIN_LOOPBACK_LIMIT', 2000),
  },
  // Network-active endpoints (connection test to real devices)
  test: {
    limit: envLimit('RATE_LIMIT_TEST_LIMIT', 10),
    windowMs: 60 * 1000,
    loopbackLimit: envLimit('RATE_LIMIT_TEST_LOOPBACK_LIMIT', 2000),
  },
  // Generic CRUD mutations (devices, alerts, maintenance windows)
  mutation: {
    limit: envLimit('RATE_LIMIT_MUTATION_LIMIT', 30),
    windowMs: 60 * 1000,
    loopbackLimit: envLimit('RATE_LIMIT_MUTATION_LOOPBACK_LIMIT', 2000),
  },
  // Admin-heavy user management
  users: {
    limit: envLimit('RATE_LIMIT_USERS_LIMIT', 15),
    windowMs: 60 * 1000,
    loopbackLimit: envLimit('RATE_LIMIT_USERS_LOOPBACK_LIMIT', 2000),
  },
  // Operational settings
  settings: {
    limit: envLimit('RATE_LIMIT_SETTINGS_LIMIT', 15),
    windowMs: 60 * 1000,
    loopbackLimit: envLimit('RATE_LIMIT_SETTINGS_LOOPBACK_LIMIT', 2000),
  },
  // Data export (CPU/DB heavy — keep strict)
  export: {
    limit: envLimit('RATE_LIMIT_EXPORT_LIMIT', 5),
    windowMs: 60 * 1000,
    loopbackLimit: envLimit('RATE_LIMIT_EXPORT_LOOPBACK_LIMIT', 2000),
  },
  // Read-only data endpoint (metrics / snmp-metrics — diakses dashboard berkala)
  read: {
    limit: envLimit('RATE_LIMIT_READ_LIMIT', 60),
    windowMs: 60 * 1000,
    loopbackLimit: envLimit('RATE_LIMIT_READ_LOOPBACK_LIMIT', 2000),
  },
  // Device console actions (backup on-demand, OLT provisioning)
  provision: {
    limit: envLimit('RATE_LIMIT_PROVISION_LIMIT', 10),
    windowMs: 60 * 1000,
    loopbackLimit: envLimit('RATE_LIMIT_PROVISION_LOOPBACK_LIMIT', 2000),
  },
};

/**
 * Check and record a rate limit hit for a specific key (e.g. "login:127.0.0.1:admin").
 */
export function checkRateLimit(
  key: string,
  options: RateLimitOptions
): { allowed: boolean; limit: number; remaining: number; resetMs: number } {
  const now = Date.now();
  const { limit, windowMs } = options;

  let store = stores.get(key);
  if (!store || now - store.lastReset > windowMs) {
    store = { tokens: limit, lastReset: now };
    stores.set(key, store);
  }

  if (store.tokens > 0) {
    store.tokens -= 1;
    const resetMs = Math.max(0, windowMs - (now - store.lastReset));
    return {
      allowed: true,
      limit,
      remaining: store.tokens,
      resetMs,
    };
  }

  const resetMs = Math.max(0, windowMs - (now - store.lastReset));
  return {
    allowed: false,
    limit,
    remaining: 0,
    resetMs,
  };
}

/**
 * Convenience helper to enforce a rate limit preset on a NextRequest.
 * Returns a 429 response if the limit is exceeded, or null if allowed.
 *
 * @param config   Rate limit preset to apply.
 * @param prefix   Logical category used to namespace the key (e.g. "login").
 * @param ip       Client IP; also used for loopback detection.
 * @param identity Optional per-client discriminator (e.g. username for login).
 */
export function rateLimitResponse(
  config: RateLimitConfig,
  prefix: string,
  ip: string,
  identity?: string
): NextResponse | null {
  const key = `${prefix}:${ip}${identity ? `:${identity}` : ''}`;

  // Loopback clients get a much higher ceiling so local dev & integration
  // tests never hit false 429s; production-facing traffic keeps strict limits.
  const effectiveLimit = isLoopbackIp(ip) ? config.loopbackLimit ?? config.limit : config.limit;

  const result = checkRateLimit(key, {
    limit: effectiveLimit,
    windowMs: config.windowMs,
  });

  if (!result.allowed) {
    const retryAfterSec = Math.ceil(result.resetMs / 1000);
    return NextResponse.json(
      { error: 'Terlalu banyak permintaan. Silakan coba lagi nanti.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfterSec),
          'X-RateLimit-Limit': String(result.limit),
          'X-RateLimit-Remaining': String(result.remaining),
          'X-RateLimit-Reset': String(Math.ceil((Date.now() + result.resetMs) / 1000)),
        },
      }
    );
  }

  return null;
}