import { describe, it, expect } from 'vitest';
import {
  checkRateLimit,
  rateLimitResponse,
  RATE_LIMITS,
  isLoopbackIp,
  type RateLimitConfig,
} from '@/lib/rate-limit';

describe('rate-limit utility', () => {
  describe('isLoopbackIp', () => {
    it('detects loopback addresses', () => {
      expect(isLoopbackIp('127.0.0.1')).toBe(true);
      expect(isLoopbackIp('::1')).toBe(true);
      expect(isLoopbackIp('::ffff:127.0.0.1')).toBe(true);
      expect(isLoopbackIp('localhost')).toBe(true);
      expect(isLoopbackIp('10.200.0.5')).toBe(false);
      expect(isLoopbackIp('192.168.1.1')).toBe(false);
    });
  });

  describe('checkRateLimit', () => {
    it('allows up to limit requests then blocks', () => {
      const options = { limit: 3, windowMs: 60_000 };
      const key = `unit-test-a:${Date.now()}`;

      expect(checkRateLimit(key, options).allowed).toBe(true);
      expect(checkRateLimit(key, options).allowed).toBe(true);
      expect(checkRateLimit(key, options).allowed).toBe(true);
      const blocked = checkRateLimit(key, options);
      expect(blocked.allowed).toBe(false);
      expect(blocked.remaining).toBe(0);
    });

    it('reports remaining count and reset time', () => {
      const options = { limit: 5, windowMs: 60_000 };
      const key = `unit-test-b:${Date.now()}`;

      const first = checkRateLimit(key, options);
      expect(first.remaining).toBe(4);
      expect(first.resetMs).toBeGreaterThan(0);
      expect(first.limit).toBe(5);
    });

    it('refills the bucket after the window elapses', async () => {
      const options = { limit: 1, windowMs: 50 };
      const key = `unit-test-c:${Date.now()}`;

      expect(checkRateLimit(key, options).allowed).toBe(true);
      expect(checkRateLimit(key, options).allowed).toBe(false);

      await new Promise((resolve) => setTimeout(resolve, 60));

      expect(checkRateLimit(key, options).allowed).toBe(true);
    });
  });

  describe('rateLimitResponse', () => {
    it('does not block when within limits', () => {
      const config: RateLimitConfig = { limit: 2, windowMs: 60_000, loopbackLimit: 2000 };
      // Loopback client uses the generous loopback limit
      expect(rateLimitResponse(config, 'unit', '127.0.0.1')).toBeNull();
    });

    it('blocks a non-loopback client that exceeds the strict limit', () => {
      const config: RateLimitConfig = { limit: 1, windowMs: 60_000 };
      const ip = `203.0.113.${Math.floor(Math.random() * 250) + 1}`;

      expect(rateLimitResponse(config, `unit-${ip}`, ip)).toBeNull();
      const blocked = rateLimitResponse(config, `unit-${ip}`, ip);
      expect(blocked).not.toBeNull();
      expect(blocked!.status).toBe(429);
      expect(blocked!.headers.get('Retry-After')).toBeDefined();
      expect(blocked!.headers.get('X-RateLimit-Limit')).toBe('1');
      expect(blocked!.headers.get('X-RateLimit-Remaining')).toBe('0');
    });

    it('uses per-username discriminator for login keys', () => {
      const ip = `198.51.100.${Math.floor(Math.random() * 250) + 1}`;
      const prefix = `login-key-${Date.now()}`;

      // 2 allowed for user A with strict limit 1 -> second should block
      const config: RateLimitConfig = { limit: 1, windowMs: 60_000 };
      expect(rateLimitResponse(config, prefix, ip, 'alice')).toBeNull();
      expect(rateLimitResponse(config, prefix, ip, 'alice')).not.toBeNull();

      // But a different username is not blocked
      expect(rateLimitResponse(config, prefix, ip, 'bob')).toBeNull();
    });
  });

  describe('RATE_LIMITS presets', () => {
    it('exposes sane defaults', () => {
      expect(RATE_LIMITS.login.limit).toBe(5);
      expect(RATE_LIMITS.test.limit).toBe(10);
      expect(RATE_LIMITS.mutation.limit).toBe(30);
      expect(RATE_LIMITS.users.limit).toBe(15);
      expect(RATE_LIMITS.settings.limit).toBe(15);
    });
  });
});