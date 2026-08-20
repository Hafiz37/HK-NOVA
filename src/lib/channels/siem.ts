import type { SiemChannelConfig, SiemFormat } from '../notify-config';

/**
 * SIEM Webhook Channel
 *
 * Mengirim event monitoring (metric polling) ke platform SIEM seperti
 * Splunk (HTTP Event Collector), Elasticsearch/ELK, atau HTTP collector
 * generic dalam format JSON.
 *
 *  - format 'generic': payload JSON dikirim apa adanya.
 *      Authorization: Bearer <token> (jika token di-set)
 *  - format 'splunk' : payload dibungkus sesuai protokol HEC:
 *      { event: <payload>, time: <epoch>, sourcetype: "hk_nova", host: "hk-nova" }
 *      Authorization: Splunk <token> (jika token di-set)
 */

const MAX_SIEM_BODY = 200_000;

// ─── Payload yang dikirim ke SIEM ─────────────────────────────────────────────
export interface SiemMetricEvent {
  event: string;
  source: string;
  '@timestamp': string;
  device: { id: string; name: string; ip: string };
  metricType: 'ICMP' | 'SNMP';
  metrics: Record<string, unknown>;
  maintenance: boolean;
}

function truncate(value: string, max = MAX_SIEM_BODY): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function buildSiemBody(event: SiemMetricEvent, format: SiemFormat): string {
  const payload = JSON.stringify(event);
  if (format === 'splunk') {
    const splunkEvent = {
      event: event,
      time: Math.floor(new Date(event['@timestamp']).getTime() / 1000),
      sourcetype: 'hk_nova',
      host: 'hk-nova',
    };
    return truncate(JSON.stringify(splunkEvent));
  }
  return truncate(payload);
}

/**
 * Kirim satu event metric ke semua URL SIEM yang dikonfigurasi.
 * Mengembalikan true jika minimal satu endpoint menerima (HTTP 2xx).
 */
export async function sendToSiem(
  config: Pick<SiemChannelConfig, 'urls' | 'token' | 'format'>,
  event: SiemMetricEvent
): Promise<boolean> {
  if (!config.urls.length) return false;

  const body = buildSiemBody(event, config.format);
  const token = config.token && config.token !== '***MASKED***' ? config.token : '';

  let anySuccess = false;
  for (const url of config.urls) {
    if (!url) continue;
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers.Authorization = config.format === 'splunk' ? `Splunk ${token}` : `Bearer ${token}`;
      }

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        anySuccess = true;
      } else {
        console.error(`[SIEM] POST ${url} gagal: HTTP ${res.status}`);
      }
    } catch (err) {
      console.error(`[SIEM] Kirim ke ${url} gagal:`, err instanceof Error ? err.message : err);
    }
  }
  return anySuccess;
}

/** Helper: cek kelayakan payload agar tidak dikirim saat device maintenance. */
export function buildSiemEvent(params: {
  device: { id: string; name: string; ip: string };
  metricType: 'ICMP' | 'SNMP';
  metrics: Record<string, unknown>;
  maintenance?: boolean;
}): SiemMetricEvent {
  return {
    event: 'metric_update',
    source: 'hk-nova',
    '@timestamp': new Date().toISOString(),
    device: params.device,
    metricType: params.metricType,
    metrics: params.metrics,
    maintenance: params.maintenance ?? false,
  };
}