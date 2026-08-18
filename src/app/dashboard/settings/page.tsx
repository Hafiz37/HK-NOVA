"use client";

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { POLL_INTERVAL_OPTIONS, intervalToLabel } from '@/lib/polling-config';

type Toast = { ok: boolean; msg: string } | null;

interface NotificationSettings {
  telegram: { enabled: boolean; botToken: string; chatIds: string; configured: boolean };
  email: {
    enabled: boolean;
    host: string;
    port: number;
    secure: boolean;
    username: string;
    password: string;
    from: string;
    recipients: string;
    configured: boolean;
  };
  webhook: { enabled: boolean; urls: string; configured: boolean };
  sms: {
    enabled: boolean;
    provider: 'generic' | 'twilio';
    apiUrl: string;
    apiKey: string;
    accountSid: string;
    senderId: string;
    toNumbers: string;
    configured: boolean;
  };
}

const MASK = '***MASKED***';

function EmptySettings(): NotificationSettings {
  return {
    telegram: { enabled: false, botToken: '', chatIds: '', configured: false },
    email: { enabled: false, host: '', port: 465, secure: true, username: '', password: '', from: '', recipients: '', configured: false },
    webhook: { enabled: false, urls: '', configured: false },
    sms: { enabled: false, provider: 'generic', apiUrl: '', apiKey: '', accountSid: '', senderId: '', toNumbers: '', configured: false },
  };
}

function toList(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
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
          setNotif({
            telegram: { enabled: t.enabled, botToken: t.botToken === MASK ? MASK : '', chatIds: t.chatIds.join(', '), configured: t.configured },
            email: {
              enabled: e.enabled,
              host: e.host,
              port: e.port,
              secure: e.secure,
              username: e.username,
              password: e.password === MASK ? MASK : '',
              from: e.from,
              recipients: e.recipients.join(', '),
              configured: e.configured,
            },
            webhook: { enabled: w.enabled, urls: w.urls.join(', '), configured: w.configured },
            sms: {
              enabled: s.enabled,
              provider: s.provider,
              apiUrl: s.apiUrl,
              apiKey: s.apiKey === MASK ? MASK : '',
              accountSid: s.accountSid,
              senderId: s.senderId,
              toNumbers: s.toNumbers.join(', '),
              configured: s.configured,
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
      setPollToast({ ok: true, msg: `Interval polling berhasil diubah menjadi ${intervalToLabel(intervalMs)}` });
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

      const payload = {
        telegram: {
          enabled: t.enabled,
          botToken: secretValue(t.configured, t.botToken),
          chatIds: toList(t.chatIds),
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
        },
        webhook: {
          enabled: w.enabled,
          urls: toList(w.urls),
        },
        sms: {
          enabled: s.enabled,
          provider: s.provider,
          apiUrl: s.apiUrl,
          apiKey: secretValue(s.configured, s.apiKey),
          accountSid: s.accountSid,
          senderId: s.senderId,
          toNumbers: toList(s.toNumbers),
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
      // Refresh local state with the returned (masked) values
      setNotif({
        telegram: { enabled: nt.enabled, botToken: nt.botToken === MASK ? MASK : nt.botToken, chatIds: nt.chatIds.join(', '), configured: nt.configured },
        email: {
          enabled: ne.enabled,
          host: ne.host,
          port: ne.port,
          secure: ne.secure,
          username: ne.username,
          password: ne.password === MASK ? MASK : ne.password,
          from: ne.from,
          recipients: ne.recipients.join(', '),
          configured: ne.configured,
        },
        webhook: { enabled: nw.enabled, urls: nw.urls.join(', '), configured: nw.configured },
        sms: {
          enabled: ns.enabled,
          provider: ns.provider,
          apiUrl: ns.apiUrl,
          apiKey: ns.apiKey === MASK ? MASK : ns.apiKey,
          accountSid: ns.accountSid,
          senderId: ns.senderId,
          toNumbers: ns.toNumbers.join(', '),
          configured: ns.configured,
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
    return <div className="p-6 text-slate-400">Akses ditolak — hanya ADMIN yang dapat mengubah pengaturan.</div>;
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
        <p className="text-xs text-slate-500 mb-6">Frekuensi pengambilan data perangkat real (ICMP + SNMP).</p>
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
            <p className="text-xs text-slate-500 mt-1">Perubahan berlaku otomatis, tanpa restart worker.</p>
          </div>

          <button
            onClick={savePolling}
            disabled={savingPoll}
            className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-medium rounded-xl transition-all"
          >
            {savingPoll ? 'Menyimpan...' : 'Simpan Pengaturan Polling'}
          </button>

          {pollToast && (
            <div className={`text-sm rounded-xl p-4 ${pollToast.ok ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border border-rose-500/30 text-rose-400'}`}>
              {pollToast.msg}
            </div>
          )}
        </div>
      </div>

      {/* ─── Notification channels ────────────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 max-w-3xl">
        <h2 className="text-lg font-semibold text-white mb-1">Kanal Notifikasi Alert</h2>
        <p className="text-xs text-slate-500 mb-6">
          Fallback dari environment variable: TELEGRAM_*, SMTP_*, NOTIFY_WEBHOOK_URLS, SMS_*. Bidang rahasia yang dikosongkan
          akan mempertahankan nilai lama.
        </p>

        <div className="space-y-8">
          {/* Telegram */}
          <Section title="Telegram" enabled={notif.telegram.enabled} onToggle={(v) => setNotif((p) => ({ ...p, telegram: { ...p.telegram, enabled: v } }))}>
            <Field label="Bot Token" value={notif.telegram.botToken} placeholder={notif.telegram.configured ? MASK : '123456:ABC-DEF...'} onChange={(v) => setNotif((p) => ({ ...p, telegram: { ...p.telegram, botToken: v } }))} />
            <Field label="Chat ID(s) — pisahkan dengan koma" value={notif.telegram.chatIds} onChange={(v) => setNotif((p) => ({ ...p, telegram: { ...p.telegram, chatIds: v } }))} />
          </Section>

          {/* Email */}
          <Section title="Email (SMTP)" enabled={notif.email.enabled} onToggle={(v) => setNotif((p) => ({ ...p, email: { ...p.email, enabled: v } }))}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="SMTP Host" value={notif.email.host} onChange={(v) => setNotif((p) => ({ ...p, email: { ...p.email, host: v } }))} />
              <Field label="SMTP Port" type="number" value={String(notif.email.port)} onChange={(v) => setNotif((p) => ({ ...p, email: { ...p.email, port: Number(v) } }))} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Username" value={notif.email.username} onChange={(v) => setNotif((p) => ({ ...p, email: { ...p.email, username: v } }))} />
              <Field label="Password / App Password" type="password" value={notif.email.password} placeholder={notif.email.configured ? MASK : ''} onChange={(v) => setNotif((p) => ({ ...p, email: { ...p.email, password: v } }))} />
            </div>
            <Field label="Dari (From)" value={notif.email.from} placeholder="noreply@example.com" onChange={(v) => setNotif((p) => ({ ...p, email: { ...p.email, from: v } }))} />
            <div className="flex items-center gap-2 mt-1">
              <input
                id="smtp-secure"
                type="checkbox"
                checked={notif.email.secure}
                onChange={(e) => setNotif((p) => ({ ...p, email: { ...p.email, secure: e.target.checked } }))}
                className="w-4 h-4 accent-blue-600"
              />
              <label htmlFor="smtp-secure" className="text-sm text-slate-400">Gunakan TLS/SSL (port 465)</label>
            </div>
            <Field label="Penerima — pisahkan dengan koma" value={notif.email.recipients} onChange={(v) => setNotif((p) => ({ ...p, email: { ...p.email, recipients: v } }))} />
          </Section>

          {/* Webhook */}
          <Section title="Webhook (Slack / Discord)" enabled={notif.webhook.enabled} onToggle={(v) => setNotif((p) => ({ ...p, webhook: { ...p.webhook, enabled: v } }))}>
            <Field label="Webhook URL(s) — pisahkan dengan koma" value={notif.webhook.urls} onChange={(v) => setNotif((p) => ({ ...p, webhook: { ...p.webhook, urls: v } }))} />
          </Section>

          {/* SMS */}
          <Section title="SMS Gateway" enabled={notif.sms.enabled} onToggle={(v) => setNotif((p) => ({ ...p, sms: { ...p.sms, enabled: v } }))}>
            <div className="flex items-center gap-2 mb-3">
              <label className="text-sm text-slate-400 mr-2">Provider</label>
              <select
                value={notif.sms.provider}
                onChange={(e) => setNotif((p) => ({ ...p, sms: { ...p.sms, provider: e.target.value as 'generic' | 'twilio' } }))}
                className={`${inputCls} max-w-xs`}
              >
                <option value="generic">Generic HTTP</option>
                <option value="twilio">Twilio</option>
              </select>
            </div>
            <Field label={notif.sms.provider === 'twilio' ? 'API Base URL (opsional)' : 'API URL'} value={notif.sms.apiUrl} onChange={(v) => setNotif((p) => ({ ...p, sms: { ...p.sms, apiUrl: v } }))} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label={notif.sms.provider === 'twilio' ? 'Auth Token' : 'API Key'} type="password" value={notif.sms.apiKey} placeholder={notif.sms.configured ? MASK : ''} onChange={(v) => setNotif((p) => ({ ...p, sms: { ...p.sms, apiKey: v } }))} />
              {notif.sms.provider === 'twilio' && (
                <Field label="Account SID" value={notif.sms.accountSid} onChange={(v) => setNotif((p) => ({ ...p, sms: { ...p.sms, accountSid: v } }))} />
              )}
            </div>
            <Field label="Sender ID / From Number" value={notif.sms.senderId} onChange={(v) => setNotif((p) => ({ ...p, sms: { ...p.sms, senderId: v } }))} />
            <Field label="Nomor Tujuan — pisahkan dengan koma" value={notif.sms.toNumbers} onChange={(v) => setNotif((p) => ({ ...p, sms: { ...p.sms, toNumbers: v } }))} />
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
          <div className={`mt-4 text-sm rounded-xl p-4 ${notifToast.ok ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border border-rose-500/30 text-rose-400'}`}>
            {notifToast.msg}
          </div>
        )}
      </div>

      <div className="text-xs text-slate-500 max-w-lg">
        • Cooldown notifikasi disimpan di database dan bertahan meskipun worker di-restart.<br />
        • Alert DIDOWN/UP dan CPU/MEM dikirim ke semua kanal yang aktif.<br />
        • Nilai environment variable akan dipakai bila kolom konfigurasi dikosongkan.
      </div>
    </div>
  );
}

function Section({
  title,
  enabled,
  onToggle,
  children,
}: {
  title: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-slate-800 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white">{title}</h3>
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
      <div className={`space-y-3 ${enabled ? '' : 'opacity-50 pointer-events-none'}`}>{children}</div>
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