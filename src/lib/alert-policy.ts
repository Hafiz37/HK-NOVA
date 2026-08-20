/**
 * Alert Policy — SLA target + tangga eskalasi + interval reminder.
 *
 * Disimpan di Setting (`alert:policies`) sehingga bisa diubah dari UI tanpa
 * restart. Skema:
 *
 *  ackSlaMinutes        : target waktu untuk acknowledge (menit)
 *  resolveSlaMinutes    : target waktu untuk resolve / MTTR (menit)
 *  renotifyIntervalMinutes: interval reminder ulang saat alert masih open
 *                          (level eskalasi 0)
 *  escalationStages     : [{ afterMinutes, severity }] diurutkan naik —
 *                          alert yang masih open setelah N menit dinaikkan
 *                          severity-nya & dikirim ulang (level 1..N).
 */

import { PrismaClient } from '@prisma/client';

export const ALERT_POLICY_SETTING_KEY = 'alert:policies';

export type PolicySeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface EscalationStage {
  afterMinutes: number;
  severity: PolicySeverity;
}

export interface AlertPolicy {
  ackSlaMinutes: number;
  resolveSlaMinutes: number;
  renotifyIntervalMinutes: number;
  escalationStages: EscalationStage[];
  digestEnabled: boolean;
  digestWindowMinutes: number;
}

export const DEFAULT_ALERT_POLICY: AlertPolicy = {
  ackSlaMinutes: 30,
  resolveSlaMinutes: 120,
  renotifyIntervalMinutes: 30,
  escalationStages: [
    { afterMinutes: 30, severity: 'HIGH' },
    { afterMinutes: 90, severity: 'CRITICAL' },
  ],
  digestEnabled: false,
  digestWindowMinutes: 15,
};

export const SEVERITY_RANK: Record<PolicySeverity, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

export function severityRank(severity: string): number {
  return SEVERITY_RANK[severity as PolicySeverity] ?? 0;
}

export function maxSeverity(a: string, b: string): PolicySeverity {
  return severityRank(b) > severityRank(a) ? (b as PolicySeverity) : (a as PolicySeverity);
}

function clampStage(s: unknown): EscalationStage | null {
  if (!s || typeof s !== 'object') return null;
  const { afterMinutes, severity } = s as Partial<EscalationStage>;
  const mins = Number(afterMinutes);
  if (!Number.isFinite(mins) || mins < 0) return null;
  if (!severity || !(severity in SEVERITY_RANK)) return null;
  return { afterMinutes: mins, severity };
}

export function normalizePolicy(p: unknown): AlertPolicy {
  const src = (p && typeof p === 'object' ? p : {}) as Partial<AlertPolicy>;
  const stages = Array.isArray(src.escalationStages)
    ? src.escalationStages.map(clampStage).filter((s): s is EscalationStage => s !== null)
    : [];

  stages.sort((a, b) => a.afterMinutes - b.afterMinutes);

  return {
    ackSlaMinutes: clampPosInt(src.ackSlaMinutes, DEFAULT_ALERT_POLICY.ackSlaMinutes),
    resolveSlaMinutes: clampPosInt(src.resolveSlaMinutes, DEFAULT_ALERT_POLICY.resolveSlaMinutes),
    renotifyIntervalMinutes: clampPosInt(
      src.renotifyIntervalMinutes,
      DEFAULT_ALERT_POLICY.renotifyIntervalMinutes
    ),
    escalationStages: stages.length > 0 ? stages : DEFAULT_ALERT_POLICY.escalationStages,
    digestEnabled: Boolean(src.digestEnabled),
    digestWindowMinutes: clampPosInt(src.digestWindowMinutes, DEFAULT_ALERT_POLICY.digestWindowMinutes),
  };
}

function clampPosInt(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : fallback;
}

/** Baca policy efektif dari DB (fallback ke default bila belum diset). */
export async function getAlertPolicy(prisma: PrismaClient): Promise<AlertPolicy> {
  try {
    const setting = await prisma.setting.findUnique({ where: { key: ALERT_POLICY_SETTING_KEY } });
    if (setting?.value && typeof setting.value === 'object') {
      return normalizePolicy(setting.value);
    }
  } catch (err) {
    console.warn('[Alert Policy] Gagal membaca policy dari DB', err);
  }
  return { ...DEFAULT_ALERT_POLICY };
}

/** Simpan policy ke DB. */
export async function saveAlertPolicy(prisma: PrismaClient, policy: AlertPolicy): Promise<void> {
  const normalized = normalizePolicy(policy);
  await prisma.setting.upsert({
    where: { key: ALERT_POLICY_SETTING_KEY },
    update: { value: normalized as unknown as Parameters<PrismaClient['setting']['create']>[0]['data']['value'] },
    create: { key: ALERT_POLICY_SETTING_KEY, value: normalized as unknown as Parameters<PrismaClient['setting']['create']>[0]['data']['value'] },
  });
}