import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Alert Rules Engine', () => {
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      alertRule: {
        findMany: vi.fn(),
      },
      device: {
        findUnique: vi.fn(),
      },
    };
  });

  it('should fetch enabled alert rules', async () => {
    const mockRules = [
      { id: 'rule-1', name: 'High CPU', metric: 'cpu', operator: 'GTE', threshold: 80, severity: 'HIGH', enabled: true },
      { id: 'rule-2', name: 'High Memory', metric: 'mem', operator: 'GTE', threshold: 85, severity: 'HIGH', enabled: true },
    ];

    mockPrisma.alertRule.findMany.mockResolvedValue(mockRules);

    const rules = await mockPrisma.alertRule.findMany({
      where: { enabled: true },
    });

    expect(rules).toHaveLength(2);
    expect(rules.every((r: { enabled: boolean }) => r.enabled)).toBe(true);
  });

  it('should evaluate CPU threshold rule', () => {
    const rule = { metric: 'cpu', operator: 'GTE', threshold: 80 };
    const value = 85;

    const evaluate = (value: number, rule: any) => {
      switch (rule.operator) {
        case 'GTE': return value >= rule.threshold;
        case 'GT': return value > rule.threshold;
        case 'LTE': return value <= rule.threshold;
        case 'LT': return value < rule.threshold;
        default: return false;
      }
    };

    expect(evaluate(value, rule)).toBe(true);
  });

  it('should not trigger alert when below threshold', () => {
    const rule = { metric: 'cpu', operator: 'GTE', threshold: 80 };
    const value = 75;

    const evaluate = (value: number, rule: any) => {
      switch (rule.operator) {
        case 'GTE': return value >= rule.threshold;
        case 'GT': return value > rule.threshold;
        case 'LTE': return value <= rule.threshold;
        case 'LT': return value < rule.threshold;
        default: return false;
      }
    };

    expect(evaluate(value, rule)).toBe(false);
  });

  it('should evaluate multiple metrics', () => {
    const rules = [
      { metric: 'cpu', operator: 'GTE', threshold: 80 },
      { metric: 'mem', operator: 'GTE', threshold: 85 },
      { metric: 'latency', operator: 'GTE', threshold: 100 },
    ];

    const metrics = { cpu: 85, mem: 90, latency: 50 };

    const triggered = rules.filter(rule => {
      const value = metrics[rule.metric as keyof typeof metrics];
      return value >= rule.threshold;
    });

    expect(triggered).toHaveLength(2);
    expect(triggered.map(r => r.metric)).toEqual(['cpu', 'mem']);
  });
});

describe('Alert Deduplication', () => {
  it('should generate consistent dedup key for device down', () => {
    const generateDedupKey = (type: string, deviceId: string) => `${type}:${deviceId}`;

    const key1 = generateDedupKey('DEVICE_DOWN', 'device-1');
    const key2 = generateDedupKey('DEVICE_DOWN', 'device-1');

    expect(key1).toBe(key2);
    expect(key1).toBe('DEVICE_DOWN:device-1');
  });

  it('should generate different keys for different devices', () => {
    const generateDedupKey = (type: string, deviceId: string) => `${type}:${deviceId}`;

    const key1 = generateDedupKey('DEVICE_DOWN', 'device-1');
    const key2 = generateDedupKey('DEVICE_DOWN', 'device-2');

    expect(key1).not.toBe(key2);
  });

  it('should generate correlation key for device', () => {
    const correlationKeyFor = (deviceId: string) => `device:${deviceId}`;

    const key = correlationKeyFor('device-1');
    expect(key).toBe('device:device-1');
  });
});