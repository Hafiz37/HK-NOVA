/**
 * Alert Rule Engine (Tahap 3)
 *
 * Menilai rule threshold user-defined terhadap nilai metrik SEGAR yang
 * diberikan oleh poller (bukan query DB ulang). Setiap rule:
 *  - device scope: ALL | DEVICE_TYPE | DEVICES
 *  - anti-flapping: `consecutiveSamples` berturut-turut sebelum alert
 *  - dedupe: `rule:{ruleId}:{deviceId}` (hanya satu alert terbuka)
 *  - menghasilkan Alert.RULE_BREACH via createAlertIfNotDuplicate
 */

import { PrismaClient, AlertSeverity, AlertRule, AlertRuleDeviceScope, AlertRuleOperator } from '@prisma/client';
import { bumpStreak, resetStreak } from './alert-streak';
import { createAlertIfNotDuplicate } from './alert-engine';

export interface RuleInput {
  name: string;
  metric: string;
  operator: AlertRuleOperator;
  threshold: number;
  severity: AlertSeverity;
  consecutiveSamples?: number;
  deviceScope?: AlertRuleDeviceScope;
  deviceType?: string | null;
  deviceIds?: string[] | null;
  customOidId?: string | null;
  cooldownMs?: number;
  enabled?: boolean;
}

export interface RuleDevice {
  id: string;
  name: string;
  ip: string;
  type: string;
}

export interface RuleEvalResult {
  ruleId: string;
  created: boolean;
  alert: { id: string; severity: AlertSeverity; message: string } | null;
}

/** Ambil rule yang aktif — dipanggil sekali per siklus poll, bukan per device. */
export async function fetchEnabledRules(prisma: PrismaClient): Promise<AlertRule[]> {
  return prisma.alertRule.findMany({ where: { enabled: true } });
}

function compare(operator: AlertRuleOperator, value: number, threshold: number): boolean {
  switch (operator) {
    case 'GT':  return value > threshold;
    case 'GTE': return value >= threshold;
    case 'LT':  return value < threshold;
    case 'LTE': return value <= threshold;
    default:    return false;
  }
}

function deviceScopeApplies(rule: AlertRule, device: RuleDevice): boolean {
  if (rule.deviceScope === AlertRuleDeviceScope.DEVICE_TYPE && rule.deviceType && rule.deviceType !== device.type) {
    return false;
  }
  if (rule.deviceScope === AlertRuleDeviceScope.DEVICES) {
    const ids = rule.deviceIds as string[] | null;
    if (!ids || !ids.includes(device.id)) return false;
  }
  return true;
}

function buildMessage(rule: AlertRule, device: RuleDevice, value: number): string {
  const metricLabel = rule.metric === 'customOid' ? rule.name : rule.metric.toUpperCase();
  return `[Rule] ${metricLabel} on ${device.name} (${device.ip}) is ${value} (${rule.operator} threshold ${rule.threshold}).`;
}

/**
 * Evaluasi SATU rule terhadap satu nilai metrik perangkat.
 * Mengembalikan hasil bila alert beneran dibuat; null jika tidak berlaku.
 */
export async function evaluateRuleForDevice(
  prisma: PrismaClient,
  rule: AlertRule,
  device: RuleDevice,
  value: number
): Promise<RuleEvalResult | null> {
  if (!deviceScopeApplies(rule, device)) return null;

  const streakKey = `rule:${rule.id}:${device.id}`;
  const streak = bumpStreak(streakKey, rule.consecutiveSamples);
  if (!streak.qualifies) return null;

  if (!compare(rule.operator, value, rule.threshold)) {
    resetStreak(streakKey);
    return null;
  }

  const message = buildMessage(rule, device, value);

  const result = await createAlertIfNotDuplicate(prisma, {
    type: 'RULE_BREACH',
    deviceId: device.id,
    message,
    severity: rule.severity,
    dedupKey: `rule:${rule.id}:${device.id}`,
    valueSnapshot: { ruleId: rule.id, metric: rule.metric, value },
  });

  if (!result.created) return { ruleId: rule.id, created: false, alert: null };

  return { ruleId: rule.id, created: true, alert: result.alert };
}