'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { POLL_INTERVAL_OPTIONS, intervalToLabel } from '@/lib/polling-config';

type Toast = { ok: boolean; msg: string } | null;

type QuietLocal = {
  enabled: boolean;
  start: string;
  end: string;
  timezone: string;
  bypass: string;
};

const emptyQuiet = (): QuietLocal => ({
  enabled: false,
  start: '22:00',
  end: '06:00',
  timezone: 'Asia/Jakarta',
  bypass: 'CRITICAL',
});

interface NotificationSettings {
  telegram: {
    enabled: boolean;
    botToken: string;
    chatIds: string;
    minSeverity: string;
    quietHours: QuietLocal;
    configured: boolean;
  };
  email: {
    enabled: boolean;
    host: string;
    port: number;
    secure: boolean;
    username: string;
    password: string;
    from: string;
    recipients: string;
    minSeverity: string;
    quietHours: QuietLocal;
    configured: boolean;
  };
  webhook: {
    enabled: boolean;
    urls: string;
    minSeverity: string;
    format: 'slack' | 'discord' | 'teams' | 'generic';
    signatureSecret: string;
    headers: string;
    quietHours: QuietLocal;
    configured: boolean;
  };
  sms: {
    enabled: boolean;
    provider: 'generic' | 'twilio';
    apiUrl: string;
    apiKey: string;
    accountSid: string;
    senderId: string;
    toNumbers: string;
    minSeverity: string;
    quietHours: QuietLocal;
    configured: boolean;
  };
  siem: {
    enabled: boolean;
    urls: string;
    token: string;
    format: 'generic' | 'splunk';
    minSeverity: string;
    quietHours: QuietLocal;
    configured: boolean;
  };
}

const MASK = '***MASKED***';

function EmptySettings(): NotificationSettings {
  return {
    telegram: {
      enabled: false,
      botToken: '',
      chatIds: '',
      minSeverity: 'LOW',
      quietHours: emptyQuiet(),
      configured: false,
    },
    email: {
      enabled: false,
      host: '',
      port: 465,
      secure: true,
      username: '',
      password: '',
      from: '',
      recipients: '',
      minSeverity: 'LOW',
      quietHours: emptyQuiet(),
      configured: false,
    },
    webhook: {
      enabled: false,
      urls: '',
      minSeverity: 'LOW',
      format: 'slack',
      signatureSecret: '',
      headers: '',
      quietHours: emptyQuiet(),
      configured: false,
    },
    sms: {
      enabled: false,
      provider: 'generic',
      apiUrl: '',
      apiKey: '',
      accountSid: '',
      senderId: '',
      toNumbers: '',
      minSeverity: 'LOW',
      quietHours: emptyQuiet(),
      configured: false,
    },
    siem: {
      enabled: false,
      urls: '',
      token: '',
      format: 'generic',
      minSeverity: 'LOW',
      quietHours: emptyQuiet(),
      configured: false,
    },
  };
}

function toList(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseJsonHeaders(value: string): Record<string, string> | null {
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
    return null;
  } catch {
    return null;
  }
}

function apiQuietToLocal(
  q?: {
    enabled?: boolean;
    start?: string;
    end?: string;
    timezone?: string;
    bypassFor?: string[];
  } | null
): QuietLocal {
  return {
    enabled: Boolean(q?.enabled),
    start: q?.start || '22:00',
    end: q?.end || '06:00',
    timezone: q?.timezone || 'Asia/Jakarta',
    bypass: (q?.bypassFor && q.bypassFor[0]) || 'CRITICAL',
  };
}

function localQuietToApi(q: QuietLocal) {
  return {
    enabled: q.enabled,
    start: q.start,
    end: q.end,
    timezone: q.timezone,
    bypassFor: [q.bypass],
  };
}

/** Keep the stored secret when the field was left empty / masked. */
function secretValue(configured: boolean, current: string): string {
  if (current === MASK) return MASK;
  if (configured && current === '') return MASK;
  return current;
}

export default function SettingsPage() {
  const { isAdmin } = useAuth();
  const [intervalMs, setIntervalMs] = useState<number>(POLL_INTERVAL_OPTIONS[1].valueMs);
  const [notif, setNotif] = useState<NotificationSettings>(EmptySettings);
  const [savingPoll, setSavingPoll] = useState(false);
  const [savingNotif, setSavingNotif] = useState(false);
  const [pollToast, setPollToast] = useState<Toast>(null);
  const [notifToast, setNotifToast] = useState<Toast>(null);

  const [testingChannel, setTestingChannel] = useState<string | null>(null);
  const [testToast, setTestToast] = useState<Toast>(null);

  // Kebijakan alert (SLA + eskalasi)
  const [policy, setPolicyForm] = useState<{
    ackSlaMinutes: number;
    resolveSlaMinutes: number;
    renotifyIntervalMinutes: number;
    digestEnabled: boolean;
    digestWindowMinutes: number;
    stages: { afterMinutes: number; severity: string }[];
  } | null>(null);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [policyToast, setPolicyToast] = useState<Toast>(null);

  useEffect(() => {
    fetch('/api/settings/alert-policies')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.data) {
          setPolicyForm({
            ackSlaMinutes: j.data.ackSlaMinutes ?? 30,
            resolveSlaMinutes: j.data.resolveSlaMinutes ?? 120,
            renotifyIntervalMinutes: j.data.renotifyIntervalMinutes ?? 30,
            digestEnabled: Boolean(j.data.digestEnabled),
            digestWindowMinutes: j.data.digestWindowMinutes ?? 15,
            stages: (j.data.escalationStages ?? []).map(
              (s: { afterMinutes?: number; severity?: string }) => ({
                afterMinutes: Number(s.afterMinutes) || 0,
                severity: s.severity || 'HIGH',
              })
            ),
          });
        }
      })
      .catch(() => {
        /* non-admin — abaikan */
      });
  }, []);

  const savePolicy = async () => {
    if (!policy) return;
    setSavingPolicy(true);
    setPolicyToast(null);
    try {
      const res = await fetch('/api/settings/alert-policies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ackSlaMinutes: Number(policy.ackSlaMinutes),
          resolveSlaMinutes: Number(policy.resolveSlaMinutes),
          renotifyIntervalMinutes: Number(policy.renotifyIntervalMinutes),
          digestEnabled: policy.digestEnabled,
          digestWindowMinutes: Number(policy.digestWindowMinutes),
          escalationStages: policy.stages.map((s) => ({
            afterMinutes: Number(s.afterMinutes),
            severity: s.severity,
          })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Gagal menyimpan policy');
      setPolicyToast({ ok: true, msg: json.message || 'Kebijakan alert berhasil disimpan' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan';
      setPolicyToast({ ok: false, msg: message });
    } finally {
      setSavingPolicy(false);
    }
  };

  const testChannel = async (channel: string) => {
    if (testingChannel) return;
    setTestingChannel(channel);
    setTestToast(null);
    try {
      const res = await fetch('/api/settings/notifications/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Gagal mengirim test');
      setTestToast({ ok: true, msg: json.message || `Notifikasi uji terkirim via ${channel}` });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan';
      setTestToast({ ok: false, msg: message });
    } finally {
      setTestingChannel(null);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;

    const fetchSettings = async () => {
      try {
        const [pollRes, notifRes] = await Promise.all([
          fetch('/api/settings/polling-interval'),
          fetch('/api/settings/notifications'),
        ]);
        if (pollRes.ok) {
          const data = await pollRes.json();
          setIntervalMs(data.data.intervalMs);
        }
        if (notifRes.ok) {
          const data = await notifRes.json();
          const t = data.data.telegram;
          const e = data.data.email;
          const w = data.data.webhook;
          const s = data.data.sms;
          const si = data.data.siem;
          setNotif({
            telegram: {
              enabled: t.enabled,
              botToken: t.botToken === MASK ? MASK : '',
              chatIds: t.chatIds.join(', '),
              minSeverity: t.minSeverity || 'LOW',
              quietHours: apiQuietToLocal(t.quietHours),
              configured: t.configured,
            },
            email: {
              enabled: e.enabled,
              host: e.host,
              port: e.port,
              secure: e.secure,
              username: e.username,
              password: e.password === MASK ? MASK : '',
              from: e.from,
              recipients: e.recipients.join(', '),
              minSeverity: e.minSeverity || 'LOW',
              quietHours: apiQuietToLocal(e.quietHours),
              configured: e.configured,
            },
            webhook: {
              enabled: w.enabled,
              urls: w.urls.join(', '),
              minSeverity: w.minSeverity || 'LOW',
              format: w.format || 'slack',
              signatureSecret: w.signatureSecret === MASK ? MASK : '',
              headers:
                w.headers && Object.keys(w.headers).length > 0 ? JSON.stringify(w.headers) : '',
              quietHours: apiQuietToLocal(w.quietHours),
              configured: w.configured,
            },
            sms: {
              enabled: s.enabled,
              provider: s.provider,
              apiUrl: s.apiUrl,
              apiKey: s.apiKey === MASK ? MASK : '',
              accountSid: s.accountSid,
              senderId: s.senderId,
              toNumbers: s.toNumbers.join(', '),
              minSeverity: s.minSeverity || 'LOW',
              quietHours: apiQuietToLocal(s.quietHours),
              configured: s.configured,
            },
            siem: {
              enabled: si.enabled,
              urls: si.urls.join(', '),
              token: si.token === MASK ? MASK : '',
              format: si.format,
              minSeverity: si.minSeverity || 'LOW',
              quietHours: apiQuietToLocal(si.quietHours),
              configured: si.configured,
            },
          });
        }
      } catch (err) {
        console.error(err);
      }
    };

    void fetchSettings();
  }, [isAdmin]);

  const savePolling = async () => {
    if (!isAdmin) return;
    setSavingPoll(true);
    setPollToast(null);
    try {
      const res = await fetch('/api/settings/polling-interval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intervalMs }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save');
      }
      setPollToast({
        ok: true,
        msg: `Interval polling berhasil diubah menjadi ${intervalToLabel(intervalMs)}`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan';
      setPollToast({ ok: false, msg: message });
    } finally {
      setSavingPoll(false);
    }
  };

  const saveNotif = async () => {
    if (!isAdmin) return;
    setSavingNotif(true);
    setNotifToast(null);
    try {
      const t = notif.telegram;
      const e = notif.email;
      const w = notif.webhook;
      const s = notif.sms;
      const si = notif.siem;

      const payload = {
        telegram: {
          enabled: t.enabled,
          botToken: secretValue(t.configured, t.botToken),
          chatIds: toList(t.chatIds),
          minSeverity: t.minSeverity,
          quietHours: localQuietToApi(t.quietHours),
        },
        email: {
          enabled: e.enabled,
          host: e.host,
          port: Number(e.port),
          secure: e.secure,
          username: e.username,
          password: secretValue(e.configured, e.password),
          from: e.from,
          recipients: toList(e.recipients),
          minSeverity: e.minSeverity,
          quietHours: localQuietToApi(e.quietHours),
        },
        webhook: {
          enabled: w.enabled,
          urls: toList(w.urls),
          minSeverity: w.minSeverity,
          format: w.format,
          signatureSecret: secretValue(w.configured, w.signatureSecret),
          headers: w.headers.length > 0 ? parseJsonHeaders(w.headers) : null,
          quietHours: localQuietToApi(w.quietHours),
        },
        sms: {
          enabled: s.enabled,
          provider: s.provider,
          apiUrl: s.apiUrl,
          apiKey: secretValue(s.configured, s.apiKey),
          accountSid: s.accountSid,
          senderId: s.senderId,
          toNumbers: toList(s.toNumbers),
          minSeverity: s.minSeverity,
          quietHours: localQuietToApi(s.quietHours),
        },
        siem: {
          enabled: si.enabled,
          urls: toList(si.urls),
          token: secretValue(si.configured, si.token),
          format: si.format,
          minSeverity: si.minSeverity,
          quietHours: localQuietToApi(si.quietHours),
        },
      };

      const res = await fetch('/api/settings/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save notifications');
      }
      const data = await res.json();
      const returned = data.data;
      const nt = returned.telegram;
      const ne = returned.email;
      const nw = returned.webhook;
      const ns = returned.sms;
      const nsi = returned.siem;
      // Refresh local state with the returned (masked) values
      setNotif({
        telegram: {
          enabled: nt.enabled,
          botToken: nt.botToken === MASK ? MASK : nt.botToken,
          chatIds: nt.chatIds.join(', '),
          minSeverity: nt.minSeverity || 'LOW',
          quietHours: apiQuietToLocal(nt.quietHours),
          configured: nt.configured,
        },
        email: {
          enabled: ne.enabled,
          host: ne.host,
          port: ne.port,
          secure: ne.secure,
          username: ne.username,
          password: ne.password === MASK ? MASK : ne.password,
          from: ne.from,
          recipients: ne.recipients.join(', '),
          minSeverity: ne.minSeverity || 'LOW',
          quietHours: apiQuietToLocal(ne.quietHours),
          configured: ne.configured,
        },
        webhook: {
          enabled: nw.enabled,
          urls: nw.urls.join(', '),
          minSeverity: nw.minSeverity || 'LOW',
          format: nw.format || 'slack',
          signatureSecret: nw.signatureSecret === MASK ? MASK : nw.signatureSecret,
          headers:
            nw.headers && Object.keys(nw.headers).length > 0 ? JSON.stringify(nw.headers) : '',
          quietHours: apiQuietToLocal(nw.quietHours),
          configured: nw.configured,
        },
        sms: {
          enabled: ns.enabled,
          provider: ns.provider,
          apiUrl: ns.apiUrl,
          apiKey: ns.apiKey === MASK ? MASK : ns.apiKey,
          accountSid: ns.accountSid,
          senderId: ns.senderId,
          toNumbers: ns.toNumbers.join(', '),
          minSeverity: ns.minSeverity || 'LOW',
          quietHours: apiQuietToLocal(ns.quietHours),
          configured: ns.configured,
        },
        siem: {
          enabled: nsi.enabled,
          urls: nsi.urls.join(', '),
          token: nsi.token === MASK ? MASK : nsi.token,
          format: nsi.format,
          minSeverity: nsi.minSeverity || 'LOW',
          quietHours: apiQuietToLocal(nsi.quietHours),
          configured: nsi.configured,
        },
      });
      setNotifToast({ ok: true, msg: 'Konfigurasi notifikasi berhasil disimpan' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan';
      setNotifToast({ ok: false, msg: message });
    } finally {
      setSavingNotif(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="p-6 text-slate-400">
        Akses ditolak — hanya ADMIN yang dapat mengubah pengaturan.
      </div>
    );
  }

  const inputCls =
    'w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 disabled:opacity-60';
  const labelCls = 'block text-xs font-medium text-slate-400 mb-1.5';

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Pengaturan</h1>
        <p className="text-slate-400 mt-1">Polling real-time dan kanal notifikasi alert.</p>
      </div>

      {/* ─── Polling interval ─────────────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 max-w-lg">
        <h2 className="text-lg font-semibold text-white mb-1">Pengaturan Polling Real</h2>
        <p className="text-xs text-slate-500 mb-6">
          Frekuensi pengambilan data perangkat real (ICMP + SNMP).
        </p>
        <div className="space-y-6">
          <div>
            <label className={labelCls}>Interval Polling</label>
            <select
              value={intervalMs}
              onChange={(e) => setIntervalMs(Number(e.target.value))}
              className={inputCls}
              disabled={savingPoll}
            >
              {POLL_INTERVAL_OPTIONS.map((opt) => (
                <option key={opt.valueMs} value={opt.valueMs}>
                  {opt.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-1">
              Perubahan berlaku otomatis, tanpa restart worker.
            </p>
          </div>

          <button
            onClick={savePolling}
            disabled={savingPoll}
            className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-medium rounded-xl transition-all"
          >
            {savingPoll ? 'Menyimpan...' : 'Simpan Pengaturan Polling'}
          </button>

          {pollToast && (
            <div
              className={`text-sm rounded-xl p-4 ${pollToast.ok ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border border-rose-500/30 text-rose-400'}`}
            >
              {pollToast.msg}
            </div>
          )}
        </div>
      </div>

      {/* ─── Notification channels ────────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 max-w-3xl">
        <h2 className="text-lg font-semibold text-white mb-1">Kanal Notifikasi Alert</h2>
        <p className="text-xs text-slate-500 mb-6">
          Fallback dari environment variable: TELEGRAM_*, SMTP_*, NOTIFY_WEBHOOK_URLS, SMS_*,
          SIEM_WEBHOOK_URLS / SIEM_WEBHOOK_TOKEN / SIEM_FORMAT. Bidang rahasia yang dikosongkan akan
          mempertahankan nilai lama.
        </p>

        <div className="space-y-8">
          {/* Telegram */}
          <Section
            title="Telegram"
            enabled={notif.telegram.enabled}
            onToggle={(v) => setNotif((p) => ({ ...p, telegram: { ...p.telegram, enabled: v } }))}
            action={
              <TestButton
                channel="telegram"
                configured={notif.telegram.configured}
                testing={testingChannel}
                onTest={(c) => void testChannel(c)}
              />
            }
          >
            <Field
              label="Bot Token"
              value={notif.telegram.botToken}
              placeholder={notif.telegram.configured ? MASK : '123456:ABC-DEF...'}
              onChange={(v) =>
                setNotif((p) => ({ ...p, telegram: { ...p.telegram, botToken: v } }))
              }
            />
            <Field
              label="Chat ID(s) — pisahkan dengan koma"
              value={notif.telegram.chatIds}
              onChange={(v) => setNotif((p) => ({ ...p, telegram: { ...p.telegram, chatIds: v } }))}
            />
            <SeveritySelect
              value={notif.telegram.minSeverity}
              onChange={(v) =>
                setNotif((p) => ({ ...p, telegram: { ...p.telegram, minSeverity: v } }))
              }
              disabled={!notif.telegram.enabled}
            />
            <QuietHoursInput
              value={notif.telegram.quietHours}
              onChange={(q) =>
                setNotif((p) => ({ ...p, telegram: { ...p.telegram, quietHours: q } }))
              }
              disabled={!notif.telegram.enabled}
            />
          </Section>

          {/* Email */}
          <Section
            title="Email (SMTP)"
            enabled={notif.email.enabled}
            onToggle={(v) => setNotif((p) => ({ ...p, email: { ...p.email, enabled: v } }))}
            action={
              <TestButton
                channel="email"
                configured={notif.email.configured}
                testing={testingChannel}
                onTest={(c) => void testChannel(c)}
              />
            }
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="SMTP Host"
                value={notif.email.host}
                onChange={(v) => setNotif((p) => ({ ...p, email: { ...p.email, host: v } }))}
              />
              <Field
                label="SMTP Port"
                type="number"
                value={String(notif.email.port)}
                onChange={(v) =>
                  setNotif((p) => ({ ...p, email: { ...p.email, port: Number(v) } }))
                }
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="Username"
                value={notif.email.username}
                onChange={(v) => setNotif((p) => ({ ...p, email: { ...p.email, username: v } }))}
              />
              <Field
                label="Password / App Password"
                type="password"
                value={notif.email.password}
                placeholder={notif.email.configured ? MASK : ''}
                onChange={(v) => setNotif((p) => ({ ...p, email: { ...p.email, password: v } }))}
              />
            </div>
            <Field
              label="Dari (From)"
              value={notif.email.from}
              placeholder="noreply@example.com"
              onChange={(v) => setNotif((p) => ({ ...p, email: { ...p.email, from: v } }))}
            />
            <div className="flex items-center gap-2 mt-1">
              <input
                id="smtp-secure"
                type="checkbox"
                checked={notif.email.secure}
                onChange={(e) =>
                  setNotif((p) => ({ ...p, email: { ...p.email, secure: e.target.checked } }))
                }
                className="w-4 h-4 accent-blue-600"
              />
              <label htmlFor="smtp-secure" className="text-sm text-slate-400">
                Gunakan TLS/SSL (port 465)
              </label>
            </div>
            <Field
              label="Penerima — pisahkan dengan koma"
              value={notif.email.recipients}
              onChange={(v) => setNotif((p) => ({ ...p, email: { ...p.email, recipients: v } }))}
            />
            <SeveritySelect
              value={notif.email.minSeverity}
              onChange={(v) => setNotif((p) => ({ ...p, email: { ...p.email, minSeverity: v } }))}
              disabled={!notif.email.enabled}
            />
            <QuietHoursInput
              value={notif.email.quietHours}
              onChange={(q) => setNotif((p) => ({ ...p, email: { ...p.email, quietHours: q } }))}
              disabled={!notif.email.enabled}
            />
          </Section>

          {/* Webhook */}
          <Section
            title="Webhook (Slack / Discord)"
            enabled={notif.webhook.enabled}
            onToggle={(v) => setNotif((p) => ({ ...p, webhook: { ...p.webhook, enabled: v } }))}
            action={
              <TestButton
                channel="webhook"
                configured={notif.webhook.configured}
                testing={testingChannel}
                onTest={(c) => void testChannel(c)}
              />
            }
          >
            <Field
              label="Webhook URL(s) — pisahkan dengan koma"
              value={notif.webhook.urls}
              onChange={(v) => setNotif((p) => ({ ...p, webhook: { ...p.webhook, urls: v } }))}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Format Payload
                </label>
                <select
                  value={notif.webhook.format}
                  onChange={(e) =>
                    setNotif((p) => ({
                      ...p,
                      webhook: {
                        ...p.webhook,
                        format: e.target.value as 'slack' | 'discord' | 'teams' | 'generic',
                      },
                    }))
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="slack">Slack (text)</option>
                  <option value="discord">Discord (content)</option>
                  <option value="teams">Teams MessageCard</option>
                  <option value="generic">Generic JSON (payload penuh)</option>
                </select>
              </div>
              <Field
                label="Signature Secret (signing HMAC-SHA256) — opsional"
                type="password"
                value={notif.webhook.signatureSecret}
                placeholder="Kosongkan bila tidak perlu"
                onChange={(v) =>
                  setNotif((p) => ({ ...p, webhook: { ...p.webhook, signatureSecret: v } }))
                }
              />
            </div>
            <Field
              label={'Headers tambahan (JSON, mis. {"Authorization":"Bearer ..."}) — opsional'}
              value={notif.webhook.headers}
              placeholder='{"Authorization":"Bearer xxx"}'
              onChange={(v) => setNotif((p) => ({ ...p, webhook: { ...p.webhook, headers: v } }))}
            />
            <SeveritySelect
              value={notif.webhook.minSeverity}
              onChange={(v) =>
                setNotif((p) => ({ ...p, webhook: { ...p.webhook, minSeverity: v } }))
              }
              disabled={!notif.webhook.enabled}
            />
            <QuietHoursInput
              value={notif.webhook.quietHours}
              onChange={(q) =>
                setNotif((p) => ({ ...p, webhook: { ...p.webhook, quietHours: q } }))
              }
              disabled={!notif.webhook.enabled}
            />
          </Section>

          {/* SMS */}
          <Section
            title="SMS Gateway"
            enabled={notif.sms.enabled}
            onToggle={(v) => setNotif((p) => ({ ...p, sms: { ...p.sms, enabled: v } }))}
            action={
              <TestButton
                channel="sms"
                configured={notif.sms.configured}
                testing={testingChannel}
                onTest={(c) => void testChannel(c)}
              />
            }
          >
            <div className="flex items-center gap-2 mb-3">
              <label className="text-sm text-slate-400 mr-2">Provider</label>
              <select
                value={notif.sms.provider}
                onChange={(e) =>
                  setNotif((p) => ({
                    ...p,
                    sms: { ...p.sms, provider: e.target.value as 'generic' | 'twilio' },
                  }))
                }
                className={`${inputCls} max-w-xs`}
              >
                <option value="generic">Generic HTTP</option>
                <option value="twilio">Twilio</option>
              </select>
            </div>
            <Field
              label={notif.sms.provider === 'twilio' ? 'API Base URL (opsional)' : 'API URL'}
              value={notif.sms.apiUrl}
              onChange={(v) => setNotif((p) => ({ ...p, sms: { ...p.sms, apiUrl: v } }))}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label={notif.sms.provider === 'twilio' ? 'Auth Token' : 'API Key'}
                type="password"
                value={notif.sms.apiKey}
                placeholder={notif.sms.configured ? MASK : ''}
                onChange={(v) => setNotif((p) => ({ ...p, sms: { ...p.sms, apiKey: v } }))}
              />
              {notif.sms.provider === 'twilio' && (
                <Field
                  label="Account SID"
                  value={notif.sms.accountSid}
                  onChange={(v) => setNotif((p) => ({ ...p, sms: { ...p.sms, accountSid: v } }))}
                />
              )}
            </div>
            <Field
              label="Sender ID / From Number"
              value={notif.sms.senderId}
              onChange={(v) => setNotif((p) => ({ ...p, sms: { ...p.sms, senderId: v } }))}
            />
            <Field
              label="Nomor Tujuan — pisahkan dengan koma"
              value={notif.sms.toNumbers}
              onChange={(v) => setNotif((p) => ({ ...p, sms: { ...p.sms, toNumbers: v } }))}
            />
            <SeveritySelect
              value={notif.sms.minSeverity}
              onChange={(v) => setNotif((p) => ({ ...p, sms: { ...p.sms, minSeverity: v } }))}
              disabled={!notif.sms.enabled}
            />
            <QuietHoursInput
              value={notif.sms.quietHours}
              onChange={(q) => setNotif((p) => ({ ...p, sms: { ...p.sms, quietHours: q } }))}
              disabled={!notif.sms.enabled}
            />
          </Section>

          {/* SIEM */}
          <Section
            title="SIEM (Splunk / ELK / Generic HTTP)"
            enabled={notif.siem.enabled}
            onToggle={(v) => setNotif((p) => ({ ...p, siem: { ...p.siem, enabled: v } }))}
            action={
              <TestButton
                channel="siem"
                configured={notif.siem.configured}
                testing={testingChannel}
                onTest={(c) => void testChannel(c)}
              />
            }
          >
            <p className="text-xs text-slate-500 -mt-1">
              Forward data monitoring (ICMP &amp; SNMP) ke SIEM. Perangkat dalam maintenance window
              otomatis dilewati.
            </p>
            <Field
              label="SIEM Webhook URL(s) — pisahkan dengan koma (Splunk HEC `/services/collector/event`, Elasticsearch, atau collector HTTP lain)"
              value={notif.siem.urls}
              placeholder="https://splunk.example.com:8088/services/collector/event, https://elk:9200/hk-nova/_doc"
              onChange={(v) => setNotif((p) => ({ ...p, siem: { ...p.siem, urls: v } }))}
            />
            <Field
              label="Token (HEC token / API key) — opsional"
              type="password"
              value={notif.siem.token}
              placeholder={notif.siem.configured ? MASK : 'Splunk HEC token atau Bearer token'}
              onChange={(v) => setNotif((p) => ({ ...p, siem: { ...p.siem, token: v } }))}
            />
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-400 mr-2">Format Payload</label>
              <select
                value={notif.siem.format}
                onChange={(e) =>
                  setNotif((p) => ({
                    ...p,
                    siem: { ...p.siem, format: e.target.value as 'generic' | 'splunk' },
                  }))
                }
                className={`${inputCls} max-w-xs`}
              >
                <option value="generic">Generic JSON (Elasticsearch/ELK, dsb.)</option>
                <option value="splunk">Splunk HTTP Event Collector</option>
              </select>
            </div>
            <SeveritySelect
              value={notif.siem.minSeverity}
              onChange={(v) => setNotif((p) => ({ ...p, siem: { ...p.siem, minSeverity: v } }))}
              disabled={!notif.siem.enabled}
            />
            <QuietHoursInput
              value={notif.siem.quietHours}
              onChange={(q) => setNotif((p) => ({ ...p, siem: { ...p.siem, quietHours: q } }))}
              disabled={!notif.siem.enabled}
            />
          </Section>
        </div>

        <button
          onClick={saveNotif}
          disabled={savingNotif}
          className="mt-8 w-full py-3.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-medium rounded-xl transition-all"
        >
          {savingNotif ? 'Menyimpan...' : 'Simpan Konfigurasi Notifikasi'}
        </button>

        {notifToast && (
          <div
            className={`mt-4 text-sm rounded-xl p-4 ${notifToast.ok ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border border-rose-500/30 text-rose-400'}`}
          >
            {notifToast.msg}
          </div>
        )}

        {testToast && (
          <div
            className={`mt-3 text-sm rounded-xl p-4 ${testToast.ok ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border border-rose-500/30 text-rose-400'}`}
          >
            {testToast.msg}
          </div>
        )}
      </div>

      {/* ─── Kebijakan Alert (SLA & Eskalasi) ─────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 max-w-3xl">
        <h2 className="text-lg font-semibold text-white mb-1">
          Kebijakan Alert (SLA &amp; Eskalasi)
        </h2>
        <p className="text-xs text-slate-500 mb-6">
          Target waktu penanganan dan tangga eskalasi otomatis untuk alert yang masih terbuka.
          Diterapkan oleh worker eskalasi (alert-escalator) yang berjalan tiap menit.
        </p>

        {policy ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field
                label="SLA Acknowledge (menit)"
                type="number"
                value={String(policy.ackSlaMinutes)}
                onChange={(v) =>
                  setPolicyForm((p) => (p ? { ...p, ackSlaMinutes: Number(v) || 0 } : p))
                }
              />
              <Field
                label="SLA Resolve / MTTR (menit)"
                type="number"
                value={String(policy.resolveSlaMinutes)}
                onChange={(v) =>
                  setPolicyForm((p) => (p ? { ...p, resolveSlaMinutes: Number(v) || 0 } : p))
                }
              />
              <Field
                label="Interval Reminder (menit)"
                type="number"
                value={String(policy.renotifyIntervalMinutes)}
                onChange={(v) =>
                  setPolicyForm((p) => (p ? { ...p, renotifyIntervalMinutes: Number(v) || 0 } : p))
                }
              />
            </div>

            <div className="flex flex-wrap items-end gap-3 border border-slate-800 rounded-xl p-3">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={policy.digestEnabled}
                  onChange={(e) =>
                    setPolicyForm((p) => (p ? { ...p, digestEnabled: e.target.checked } : p))
                  }
                  className="w-4 h-4 accent-blue-600"
                />
                Mode Digest (anti-spam)
              </label>
              <Field
                label="Window Digest (menit)"
                type="number"
                value={String(policy.digestWindowMinutes)}
                onChange={(v) =>
                  setPolicyForm((p) => (p ? { ...p, digestWindowMinutes: Number(v) || 0 } : p))
                }
              />
              <p className="w-full text-[11px] text-slate-500 -mt-1">
                Bila aktif, alert tidak langsung dikirim; dikumpulkan dan disampaikan ringkas tiap
                window oleh worker digest.
              </p>
            </div>

            <div>
              <p className="text-xs font-medium text-slate-400 mb-2">Tangga Eskalasi</p>
              {policy.stages.length === 0 && (
                <p className="text-xs text-slate-500">
                  Belum ada tahap eskalasi — alert hanya dikirim ulang via reminder.
                </p>
              )}
              {policy.stages.map((stage, idx) => (
                <div
                  key={idx}
                  className="flex flex-wrap items-end gap-3 border border-slate-800 rounded-xl p-3 mb-2"
                >
                  <Field
                    label="Setelah (menit)"
                    type="number"
                    value={String(stage.afterMinutes)}
                    onChange={(v) =>
                      setPolicyForm((p) =>
                        p
                          ? {
                              ...p,
                              stages: p.stages.map((s, i) =>
                                i === idx ? { ...s, afterMinutes: Number(v) || 0 } : s
                              ),
                            }
                          : p
                      )
                    }
                  />
                  <div className="flex-1 min-w-[140px]">
                    <label className="block text-xs font-medium text-slate-400 mb-1.5">
                      Naikkan ke Severity
                    </label>
                    <select
                      value={stage.severity}
                      onChange={(e) =>
                        setPolicyForm((p) =>
                          p
                            ? {
                                ...p,
                                stages: p.stages.map((s, i) =>
                                  i === idx ? { ...s, severity: e.target.value } : s
                                ),
                              }
                            : p
                        )
                      }
                      className={inputCls}
                    >
                      {SEVERITIES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    onClick={() =>
                      setPolicyForm((p) =>
                        p ? { ...p, stages: p.stages.filter((_, i) => i !== idx) } : p
                      )
                    }
                    className="px-3 py-3 text-xs bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg transition-colors"
                  >
                    Hapus
                  </button>
                </div>
              ))}
              <button
                onClick={() =>
                  setPolicyForm((p) =>
                    p
                      ? {
                          ...p,
                          stages: [
                            ...p.stages,
                            {
                              afterMinutes: p.stages.length
                                ? p.stages[p.stages.length - 1].afterMinutes + 60
                                : 60,
                              severity: 'CRITICAL',
                            },
                          ],
                        }
                      : p
                  )
                }
                className="px-4 py-2 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg transition-colors"
              >
                + Tambah Tahap
              </button>
            </div>

            <button
              onClick={savePolicy}
              disabled={savingPolicy}
              className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-medium rounded-xl transition-all"
            >
              {savingPolicy ? 'Menyimpan...' : 'Simpan Kebijakan Alert'}
            </button>

            {policyToast && (
              <div
                className={`text-sm rounded-xl p-4 ${policyToast.ok ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border border-rose-500/30 text-rose-400'}`}
              >
                {policyToast.msg}
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate-500">Memuat kebijakan…</p>
        )}
      </div>

      <div className="text-xs text-slate-500 max-w-lg">
        • Cooldown notifikasi disimpan di database dan bertahan meskipun worker di-restart.
        <br />
        • Alert DIDOWN/UP dan CPU/MEM dikirim ke semua kanal yang aktif.
        <br />• Nilai environment variable akan dipakai bila kolom konfigurasi dikosongkan.
      </div>
    </div>
  );
}

const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

function QuietHoursInput({
  value,
  onChange,
  disabled,
}: {
  value: QuietLocal;
  onChange: (q: QuietLocal) => void;
  disabled?: boolean;
}) {
  const set = (patch: Partial<QuietLocal>) => onChange({ ...value, ...patch });
  return (
    <div className="border border-slate-800/70 rounded-xl p-3 space-y-2">
      <label className="flex items-center gap-2 text-xs font-medium text-slate-400 cursor-pointer">
        <input
          type="checkbox"
          checked={value.enabled}
          disabled={disabled}
          onChange={(e) => set({ enabled: e.target.checked })}
          className="w-4 h-4 accent-blue-600"
        />
        Jadwal Senyap (Silent Hours)
      </label>
      <div
        className={`grid grid-cols-2 sm:grid-cols-4 gap-2 ${value.enabled ? '' : 'opacity-50 pointer-events-none'}`}
      >
        <input
          type="text"
          value={value.start}
          onChange={(e) => set({ start: e.target.value })}
          placeholder="22:00"
          title="Mulai (HH:MM)"
          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
        />
        <input
          type="text"
          value={value.end}
          onChange={(e) => set({ end: e.target.value })}
          placeholder="06:00"
          title="Selesai (HH:MM)"
          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
        />
        <input
          type="text"
          value={value.timezone}
          onChange={(e) => set({ timezone: e.target.value })}
          placeholder="Asia/Jakarta"
          title="Timezone (IANA)"
          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
        />
        <select
          value={value.bypass}
          onChange={(e) => set({ bypass: e.target.value })}
          title="Severity yang tetap terkirim"
          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
        >
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              Bypass ≥ {s}
            </option>
          ))}
        </select>
      </div>
      <p className="text-[11px] text-slate-500">
        Notifikasi channel diredam pada jendela quiet; severity &ge; bypass tetap terkirim.
      </p>
    </div>
  );
}

function SeveritySelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-2">
      <label className="text-xs font-medium text-slate-400">Minimal Severity</label>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500 disabled:opacity-60"
      >
        {SEVERITIES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <span className="text-[11px] text-slate-500 sm:col-span-2 -mt-1">
        Channel hanya menerima alert dengan severity sama atau lebih tinggi dari nilai ini.
      </span>
    </div>
  );
}

function TestButton({
  channel,
  configured,
  testing,
  onTest,
}: {
  channel: string;
  configured: boolean;
  testing: string | null;
  onTest: (channel: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onTest(channel)}
      disabled={testing !== null || !configured}
      className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
      title={configured ? 'Kirim notifikasi uji' : 'Konfigurasi belum lengkap'}
    >
      {testing === channel ? 'Menguji…' : 'Test Kirim'}
    </button>
  );
}

function Section({
  title,
  enabled,
  onToggle,
  children,
  action,
}: {
  title: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="border border-slate-800 rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
        <div className="flex items-center gap-3">
          {action}
          <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => onToggle(e.target.checked)}
              className="w-4 h-4 accent-blue-600"
            />
            Aktif
          </label>
        </div>
      </div>
      <div className={`space-y-3 ${enabled ? '' : 'opacity-50 pointer-events-none'}`}>
        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500"
      />
    </div>
  );
}
