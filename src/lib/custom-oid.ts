/**
 * Custom OID SNMP Helper
 *
 * Menangani polling SNMP OID kustom per device / per vendor.
 * OID kustom dikonfigurasi melalui tabel CustomOid di DB dan diambil
 * pada setiap siklus poll SNMP.
 *
 * Mendukung:
 *  - Huawei (prefix: 1.3.6.1.4.1.2011)
 *  - ZTE    (prefix: 1.3.6.1.4.1.3902)
 *  - Cisco  (prefix: 1.3.6.1.4.1.9)
 *  - Generic (OID apapun dalam format dotted-decimal)
 *
 * Hasil polling disimpan ke kolom `customOidData` (JSON) di tabel Metric.
 * Alert opsional berdasarkan threshold `alertHigh` / `alertLow` di CustomOid.
 */

import { PrismaClient } from '@prisma/client';

// ─── Vendor OID presets (referensi cepat) ────────────────────────────────────
export const VENDOR_OID_PRESETS: Record<string, Array<{ name: string; oid: string; unit?: string }>> = {
  huawei: [
    { name: 'CPU Util (Huawei)',    oid: '1.3.6.1.4.1.2011.5.2.1.1.1.3.0',  unit: '%' },
    { name: 'Mem Util (Huawei)',    oid: '1.3.6.1.4.1.2011.5.2.1.1.1.4.0',  unit: '%' },
    { name: 'Fan Speed (Huawei)',   oid: '1.3.6.1.4.1.2011.5.2.2.1.2.1.3',  unit: 'rpm' },
    { name: 'Temp (Huawei)',        oid: '1.3.6.1.4.1.2011.5.2.2.1.2.1.4',  unit: '°C' },
    { name: 'Uptime (Huawei)',      oid: '1.3.6.1.2.1.1.3.0',               unit: 'ticks' },
  ],
  zte: [
    { name: 'CPU Util (ZTE)',       oid: '1.3.6.1.4.1.3902.1015.1.1.1.2.1.1.1',  unit: '%' },
    { name: 'Mem Total (ZTE)',      oid: '1.3.6.1.4.1.3902.1015.1.1.1.2.1.1.2',  unit: 'KB' },
    { name: 'Mem Free (ZTE)',       oid: '1.3.6.1.4.1.3902.1015.1.1.1.2.1.1.3',  unit: 'KB' },
    { name: 'Temp Board (ZTE)',     oid: '1.3.6.1.4.1.3902.1015.1.1.1.2.1.1.4',  unit: '°C' },
  ],
  cisco: [
    { name: 'CPU 5s (Cisco)',       oid: '1.3.6.1.4.1.9.2.1.56.0',  unit: '%' },
    { name: 'CPU 1m (Cisco)',       oid: '1.3.6.1.4.1.9.2.1.57.0',  unit: '%' },
    { name: 'CPU 5m (Cisco)',       oid: '1.3.6.1.4.1.9.2.1.58.0',  unit: '%' },
    { name: 'Free Mem (Cisco)',     oid: '1.3.6.1.4.1.9.2.1.8.0',   unit: 'bytes' },
    { name: 'Temp (Cisco)',         oid: '1.3.6.1.4.1.9.9.13.1.3.1.3', unit: '°C' },
  ],
  mikrotik: [
    { name: 'CPU Load (Mikrotik)',  oid: '1.3.6.1.2.1.25.3.3.1.2.1', unit: '%' },
    { name: 'Temp (Mikrotik)',      oid: '1.3.6.1.4.1.14988.1.1.3.10', unit: '°C' },
    { name: 'Voltage (Mikrotik)',   oid: '1.3.6.1.4.1.14988.1.1.3.8',  unit: 'mV' },
  ],
};

// ─── Types ───────────────────────────────────────────────────────────────────
export interface CustomOidRecord {
  id: string;
  name: string;
  oid: string;
  unit: string | null;
  description: string | null;
  alertHigh: number | null;
  alertLow: number | null;
  enabled: boolean;
}

export interface CustomOidResult {
  oid: string;
  name: string;
  value: number | string | null;
  unit: string | null;
  alertTriggered: 'HIGH' | 'LOW' | null;
  error?: string;
}

// ─── Fetch enabled custom OIDs for a device ───────────────────────────────────
export async function getEnabledCustomOids(
  prisma: PrismaClient,
  deviceId: string
): Promise<CustomOidRecord[]> {
  return prisma.customOid.findMany({
    where: { deviceId, enabled: true },
    select: {
      id: true,
      name: true,
      oid: true,
      unit: true,
      description: true,
      alertHigh: true,
      alertLow: true,
      enabled: true,
    },
  });
}

/**
 * Poll semua custom OID untuk satu device menggunakan SNMP session yang sudah ada.
 * Menggunakan GET (bukan subtree walk) karena OID-nya sudah spesifik (scalar).
 *
 * @param session  net-snmp session (any — no types)
 * @param oids     Array CustomOidRecord
 * @returns        Array CustomOidResult
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function pollCustomOids(session: any, oids: CustomOidRecord[]): Promise<CustomOidResult[]> {
  if (oids.length === 0) return [];

  const oidStrings = oids.map((o) => o.oid);

  // SNMP GET (scalar)
  const rawValues = await new Promise<Record<string, unknown>>((resolve) => {
    const result: Record<string, unknown> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    session.get(oidStrings, (error: Error | null, varbinds: any[]) => {
      if (error) {
        resolve(result);
        return;
      }
      for (const vb of varbinds) {
        if (vb && !isVarbindError(session, vb)) {
          result[vb.oid as string] = vb.value;
        } else if (vb) {
          result[vb.oid as string] = null;
        }
      }
      resolve(result);
    });
  });

  return oids.map((oidRecord) => {
    const raw = rawValues[oidRecord.oid];
    let value: number | string | null = null;

    if (raw !== null && raw !== undefined) {
      const num = Number(raw);
      value = isNaN(num) ? String(raw) : num;
    }

    // Check alert threshold
    let alertTriggered: 'HIGH' | 'LOW' | null = null;
    if (typeof value === 'number') {
      if (oidRecord.alertHigh !== null && value >= oidRecord.alertHigh) {
        alertTriggered = 'HIGH';
      } else if (oidRecord.alertLow !== null && value <= oidRecord.alertLow) {
        alertTriggered = 'LOW';
      }
    }

    return {
      oid: oidRecord.oid,
      name: oidRecord.name,
      value,
      unit: oidRecord.unit,
      alertTriggered,
    };
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isVarbindError(session: any, vb: any): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const snmp = require('net-snmp');
    return snmp.isVarbindError(vb) as boolean;
  } catch {
    return false;
  }
}

/**
 * Serialize hasil custom OID poll ke format JSON untuk disimpan ke DB.
 */
export function serializeCustomOidResults(
  results: CustomOidResult[]
): Record<string, { name: string; value: number | string | null; unit: string | null; alertTriggered: string | null }> {
  const out: Record<string, { name: string; value: number | string | null; unit: string | null; alertTriggered: string | null }> = {};
  for (const r of results) {
    out[r.oid] = {
      name: r.name,
      value: r.value,
      unit: r.unit,
      alertTriggered: r.alertTriggered,
    };
  }
  return out;
}
