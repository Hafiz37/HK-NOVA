import { PrismaClient } from '@prisma/client';
import { getNotificationConfig, type SiemFormat } from './notify-config';
import { sendToSiem, buildSiemEvent, type SiemMetricEvent } from './channels/siem';
import { isDeviceInMaintenance } from './maintenance';

/**
 * Forward satu event metric dari worker polling ke semua endpoint SIEM.
 *
 * - Tidak melakukan apa-apa bila channel SIEM nonaktif / belum dikonfigurasi.
 * - Melewati perangkat yang sedang dalam maintenance window (suppression).
 * - Fire-and-forget: error tidak mengganggu siklus polling utama.
 */
export async function forwardMetricsToSiem(
  prisma: PrismaClient,
  input: {
    device: { id: string; name: string; ip: string };
    metricType: 'ICMP' | 'SNMP';
    metrics: Record<string, unknown>;
  }
): Promise<boolean> {
  try {
    const cfg = await getNotificationConfig(prisma);
    if (!cfg.siem.enabled || cfg.siem.urls.length === 0) return false;

    const inMaintenance = await isDeviceInMaintenance(input.device.id);
    if (inMaintenance) return false;

    const event: SiemMetricEvent = buildSiemEvent({
      device: input.device,
      metricType: input.metricType,
      metrics: input.metrics,
      maintenance: false,
    });

    return await sendToSiem(
      {
        urls: cfg.siem.urls,
        token: cfg.siem.token,
        format: cfg.siem.format as SiemFormat,
      },
      event
    );
  } catch (err) {
    console.error('[SIEM] Gagal meneruskan metric:', err instanceof Error ? err.message : err);
    return false;
  }
}