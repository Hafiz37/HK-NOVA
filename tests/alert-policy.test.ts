import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from './setup';
import {
  ALERT_POLICY_SETTING_KEY,
  DEFAULT_ALERT_POLICY,
  getAlertPolicy,
  saveAlertPolicy,
  normalizePolicy,
  maxSeverity,
} from '@/lib/alert-policy';

describe('Alert Policy — SLA & Eskalasi', () => {
  beforeAll(async () => {
    await prisma.setting.deleteMany({ where: { key: ALERT_POLICY_SETTING_KEY } });
  });

  afterAll(async () => {
    await prisma.setting.deleteMany({ where: { key: ALERT_POLICY_SETTING_KEY } });
  });

  it('menghasilkan default saat belum disimpan', async () => {
    const policy = await getAlertPolicy(prisma);
    expect(policy.ackSlaMinutes).toBe(DEFAULT_ALERT_POLICY.ackSlaMinutes);
    expect(policy.escalationStages.length).toBeGreaterThan(0);
  });

  it('mensortir stage eskalasi berdasarkan afterMinutes', () => {
    const normalized = normalizePolicy({
      escalationStages: [
        { afterMinutes: 90, severity: 'CRITICAL' },
        { afterMinutes: 30, severity: 'HIGH' },
        { afterMinutes: 'bukan-angka', severity: 'HIGH' },
        { severity: 'LOW' },
      ],
    });
    expect(normalized.escalationStages.map((s) => s.afterMinutes)).toEqual([30, 90]);
  });

  it('menyimpan & membaca ulang policy dari DB', async () => {
    await saveAlertPolicy(prisma, {
      ackSlaMinutes: 15,
      resolveSlaMinutes: 60,
      renotifyIntervalMinutes: 10,
      escalationStages: [{ afterMinutes: 15, severity: 'HIGH' }],
      digestEnabled: true,
      digestWindowMinutes: 20,
    });
    const policy = await getAlertPolicy(prisma);
    expect(policy.ackSlaMinutes).toBe(15);
    expect(policy.resolveSlaMinutes).toBe(60);
    expect(policy.escalationStages).toEqual([{ afterMinutes: 15, severity: 'HIGH' }]);
    expect(policy.digestEnabled).toBe(true);
    expect(policy.digestWindowMinutes).toBe(20);
  });

  it('maxSeverity memilih tingkat lebih parah', () => {
    expect(maxSeverity('MEDIUM', 'CRITICAL')).toBe('CRITICAL');
    expect(maxSeverity('CRITICAL', 'MEDIUM')).toBe('CRITICAL');
    expect(maxSeverity('HIGH', 'HIGH')).toBe('HIGH');
  });
});