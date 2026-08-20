import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { prisma } from './setup';
import { createTestDevice, cleanTestData } from './setup';
import { evaluateRuleForDevice, fetchEnabledRules } from '@/lib/alert-rules';

describe('Alert Rule Engine', () => {
  const deviceIds: string[] = [];

  beforeEach(async () => {
    await cleanTestData();
    deviceIds.length = 0;
  });

  afterAll(async () => {
    for (const id of deviceIds) {
      try { await prisma.device.delete({ where: { id } }); } catch { /* ignore */ }
    }
  });

  it('membuat RULE_BREACH saat threshold GTE terlampaui', async () => {
    const device = await createTestDevice({ type: 'ROUTER' });
    deviceIds.push(device.id);

    const rule = await prisma.alertRule.create({
      data: {
        name: 'CPU Tinggi',
        metric: 'cpu',
        operator: 'GTE',
        threshold: 85,
        severity: 'HIGH',
        consecutiveSamples: 1,
        deviceScope: 'ALL',
      },
    });

    const res = await evaluateRuleForDevice(
      prisma,
      rule,
      { id: device.id, name: device.name, ip: device.ip, type: 'ROUTER' },
      92
    );
    expect(res?.created).toBe(true);
    expect(res?.alert?.severity).toBe('HIGH');

    const alert = await prisma.alert.findFirst({ where: { deviceId: device.id, type: 'RULE_BREACH' } });
    expect(alert).not.toBeNull();
  });

  it('tidak membuat alert berulang (dedupe) saat rule tetap melanggar', async () => {
    const device = await createTestDevice();
    deviceIds.push(device.id);

    const rule = await prisma.alertRule.create({
      data: { name: 'Rule', metric: 'latency', operator: 'GT', threshold: 100, severity: 'HIGH', consecutiveSamples: 1, deviceScope: 'ALL' },
    });

    const r1 = await evaluateRuleForDevice(prisma, rule, { id: device.id, name: device.name, ip: device.ip, type: 'SWITCH' }, 150);
    const r2 = await evaluateRuleForDevice(prisma, rule, { id: device.id, name: device.name, ip: device.ip, type: 'SWITCH' }, 160);
    expect(r1?.created).toBe(true);
    expect(r2?.created).toBe(false);
  });

  it('menghormati deviceScope DEVICE_TYPE', async () => {
    const device = await createTestDevice({ type: 'ONT' });
    deviceIds.push(device.id);

    const rule = await prisma.alertRule.create({
      data: { name: 'Only Router', metric: 'jitter', operator: 'GT', threshold: 5, severity: 'MEDIUM', consecutiveSamples: 1, deviceScope: 'DEVICE_TYPE', deviceType: 'ROUTER' },
    });

    const res = await evaluateRuleForDevice(prisma, rule, { id: device.id, name: device.name, ip: device.ip, type: 'ONT' }, 9);
    expect(res).toBeNull();

    const count = await prisma.alert.count({ where: { deviceId: device.id, type: 'RULE_BREACH' } });
    expect(count).toBe(0);
  });

  it('fetchEnabledRules hanya mengambil rule aktif', async () => {
    const a = await prisma.alertRule.create({ data: { name: 'Aktif', metric: 'cpu', operator: 'GTE', threshold: 80, severity: 'HIGH' } });
    await prisma.alertRule.create({ data: { name: 'Nonaktif', metric: 'mem', operator: 'GTE', threshold: 90, severity: 'HIGH', enabled: false } });
    const rules = await fetchEnabledRules(prisma);
    expect(rules.some((r) => r.id === a.id)).toBe(true);
    expect(rules.every((r) => r.enabled)).toBe(true);
    await prisma.alertRule.deleteMany({ where: { name: { in: ['Aktif', 'Nonaktif'] } } });
  });
});