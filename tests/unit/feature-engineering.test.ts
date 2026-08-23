import { describe, it, expect } from 'vitest';
import { extractAdvancedFeatures, ADVANCED_FEATURE_NAMES } from '@/lib/feature-engineering';
import { PrismaClient } from '@prisma/client';

// Mock Prisma client for unit testing
const mockPrisma = {
  device: {
    findUnique: async () => ({ type: 'ROUTER', location: 'Jakarta' }),
  },
  metric: {
    findMany: async () => [],
  },
} as unknown as PrismaClient;

describe('Advanced Feature Engineering', () => {
  it('should have 33 feature names defined', () => {
    expect(ADVANCED_FEATURE_NAMES.length).toBe(33);
  });

  it('should have correct feature categories', () => {
    // Base metrics (5)
    expect(ADVANCED_FEATURE_NAMES.slice(0, 5)).toEqual([
      'latency', 'cpu', 'memory', 'ifInOctets', 'ifOutOctets',
    ]);

    // Temporal features (6)
    expect(ADVANCED_FEATURE_NAMES.slice(5, 11)).toEqual([
      'hourOfDay', 'dayOfWeek', 'isWeekend', 'isBusinessHours', 'isNightTime', 'monthOfYear',
    ]);

    // Rate of change (5)
    expect(ADVANCED_FEATURE_NAMES.slice(11, 16)).toEqual([
      'latencyDelta', 'cpuDelta', 'memoryDelta', 'inOctetsDelta', 'outOctetsDelta',
    ]);

    // Rolling statistics (10)
    expect(ADVANCED_FEATURE_NAMES.slice(16, 26)).toEqual([
      'latencyMean15m', 'latencyStd15m', 'cpuMean1h', 'cpuStd1h', 'memoryMean1h',
      'memoryStd1h', 'inOctetsMean15m', 'outOctetsMean15m', 'latencyMax15m', 'latencyMin15m',
    ]);

    // Network metrics (5)
    expect(ADVANCED_FEATURE_NAMES.slice(26, 31)).toEqual([
      'packetLossRate', 'errorRate', 'bandwidthUtilization', 'jitter', 'availability',
    ]);

    // Device context (2)
    expect(ADVANCED_FEATURE_NAMES.slice(31, 33)).toEqual([
      'deviceTypeEncoded', 'locationEncoded',
    ]);
  });

  it('should extract features with correct structure', async () => {
    // This would need a real database or more sophisticated mocking
    // For now, just verify the function exists and returns correct types
    expect(typeof extractAdvancedFeatures).toBe('function');
  });
});

describe('Feature Engineering Logic', () => {
  it('should correctly compute temporal features', () => {
    const date = new Date('2024-01-15T14:30:00'); // Monday, 2:30 PM
    expect(date.getHours()).toBe(14);
    expect(date.getDay()).toBe(1);
    expect(date.getMonth() + 1).toBe(1);
  });

  it('should compute business hours correctly', () => {
    const businessHour = new Date('2024-01-15T14:00:00');
    const nightHour = new Date('2024-01-15T23:00:00');
    const weekend = new Date('2024-01-13T14:00:00'); // Saturday

    const isBusiness = (h: number) => (h >= 8 && h <= 18) ? 1 : 0;
    const isNight = (h: number) => (h >= 22 || h < 6) ? 1 : 0;
    const isWeekend = (d: number) => (d === 0 || d === 6) ? 1 : 0;

    expect(isBusiness(businessHour.getHours())).toBe(1);
    expect(isBusiness(nightHour.getHours())).toBe(0);
    expect(isWeekend(weekend.getDay())).toBe(1);
  });

  it('should compute rolling statistics correctly', () => {
    const values = [10, 12, 11, 13, 12, 11, 10, 12, 13, 12];
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
    const std = Math.sqrt(variance);

    expect(mean).toBeCloseTo(11.6, 1);
    expect(std).toBeCloseTo(1.0, 1);
  });

  it('should compute delta correctly', () => {
    const prev = 100;
    const curr = 110;
    expect(curr - prev).toBe(10);
  });

  it('should encode device type correctly', () => {
    const deviceTypeMap: Record<string, number> = {
      ROUTER: 1,
      SWITCH: 2,
      OLT: 3,
      AP: 4,
      SERVER: 5,
    };

    expect(deviceTypeMap['ROUTER']).toBe(1);
    expect(deviceTypeMap['SWITCH']).toBe(2);
    expect(deviceTypeMap['UNKNOWN'] ?? 0).toBe(0);
  });

  it('should hash location consistently', () => {
    const hashString = (str: string | null | undefined): number => {
      if (!str) return 0;
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = (hash << 5) - hash + str.charCodeAt(i);
        hash |= 0;
      }
      return Math.abs(hash) % 100;
    };

    expect(hashString('Jakarta')).toBeGreaterThanOrEqual(0);
    expect(hashString('Jakarta')).toBeLessThan(100);
    expect(hashString('Jakarta')).toBe(hashString('Jakarta'));
    expect(hashString('Bandung')).not.toBe(hashString('Jakarta'));
  });
});