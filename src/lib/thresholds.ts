import {
  SNMP_HIGH_CPU_THRESHOLD,
  SNMP_HIGH_MEM_THRESHOLD,
  SNMP_HIGH_CPU_RESOLVE_THRESHOLD,
  SNMP_HIGH_MEM_RESOLVE_THRESHOLD,
} from './constants';

export interface ThresholdOverrides {
  cpuThresholdOverride?: number | null;
  memThresholdOverride?: number | null;
  cpuResolveThresholdOverride?: number | null;
  memResolveThresholdOverride?: number | null;
}

export interface EffectiveThresholds {
  cpuAlert: number;
  memAlert: number;
  cpuResolve: number;
  memResolve: number;
}

// Hysteresis default: resolve = alert - 5 (konsisten dengan constants global)
const HYSTERESIS_DELTA = 5;

/**
 * Hitung threshold efektif untuk sebuah perangkat.
 * Jika perangkat punya override, pakai override tsb; jika tidak, jatuh ke nilai global.
 */
export function resolveThresholds(overrides?: ThresholdOverrides | null): EffectiveThresholds {
  const cpuAlert = overrides?.cpuThresholdOverride ?? SNMP_HIGH_CPU_THRESHOLD;
  const memAlert = overrides?.memThresholdOverride ?? SNMP_HIGH_MEM_THRESHOLD;

  const cpuResolve =
    overrides?.cpuResolveThresholdOverride ??
    (overrides?.cpuThresholdOverride != null
      ? overrides.cpuThresholdOverride - HYSTERESIS_DELTA
      : SNMP_HIGH_CPU_RESOLVE_THRESHOLD);

  const memResolve =
    overrides?.memResolveThresholdOverride ??
    (overrides?.memThresholdOverride != null
      ? overrides.memThresholdOverride - HYSTERESIS_DELTA
      : SNMP_HIGH_MEM_RESOLVE_THRESHOLD);

  return { cpuAlert, memAlert, cpuResolve, memResolve };
}

/**
 * Normalize nilai threshold dari request (1..100).
 * Kosong / undefined / bukan angka → null (pakai nilai global).
 */
export function normalizeThresholdInput(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const num = Number(value);
  if (Number.isNaN(num)) return null;
  return Math.min(100, Math.max(1, num));
}
