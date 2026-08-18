"use client";

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { POLL_INTERVAL_OPTIONS, intervalToLabel } from '@/lib/polling-config';

export default function PollingSettingsPage() {
  const { isAdmin } = useAuth();
  const [intervalMs, setIntervalMs] = useState<number>(POLL_INTERVAL_OPTIONS[1].valueMs); // default 1 menit
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (!isAdmin) return;

    const fetchSettings = async () => {
      try {
        const res = await fetch('/api/settings/polling-interval');
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        setIntervalMs(data.data.intervalMs);
      } catch (err) {
        console.error(err);
      }
    };

    void fetchSettings();
  }, [isAdmin]);

  const save = async () => {
    if (!isAdmin) return;
    setSaving(true);
    setToast(null);

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

      setToast({ ok: true, msg: `Interval polling berhasil diubah menjadi ${intervalToLabel(intervalMs)}` });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan';
      setToast({ ok: false, msg: message });
    } finally {
      setSaving(false);
    }
  };

  if (!isAdmin) {
    return <div className="p-6 text-slate-400">Akses ditolak — hanya ADMIN yang boleh mengubah interval.</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Pengaturan Polling Real</h1>
        <p className="text-slate-400 mt-1">Frekuensi pengambilan data perangkat real (ICMP + SNMP).</p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 max-w-lg">
        <div className="space-y-6">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-2">Interval Polling</label>
            <select
              value={intervalMs}
              onChange={(e) => setIntervalMs(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500"
              disabled={saving}
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
            onClick={save}
            disabled={saving}
            className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-medium rounded-xl transition-all"
          >
            {saving ? 'Menyimpan...' : 'Simpan Pengaturan'}
          </button>

          {toast && (
            <div className={`text-sm rounded-xl p-4 ${toast.ok ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border border-rose-500/30 text-rose-400'}`}>
              {toast.msg}
            </div>
          )}
        </div>
      </div>

      <div className="text-xs text-slate-500 max-w-lg">
        • Interval berlaku untuk semua perangkat real.<br />
        • Demo generator tidak terpengaruh.<br />
        • Perubahan disimpan di database dan langsung diterapkan oleh worker.
      </div>
    </div>
  );
}