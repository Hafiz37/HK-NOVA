'use client';

import { useEffect, useState } from 'react';

interface Rule {
  id: string;
  name: string;
  metric: string;
  operator: string;
  threshold: number;
  severity: string;
  consecutiveSamples: number;
  deviceScope: string;
  deviceType?: string | null;
  deviceIds?: string[] | null;
  customOidId?: string | null;
  enabled: boolean;
  cooldownMs: number;
}

interface CustomOidOption {
  id: string;
  name: string;
  oid: string;
  unit: string | null;
  device: { id: string; name: string; ip: string } | null;
}

interface DeviceOption {
  id: string;
  name: string;
}

const METRICS = ['cpu', 'mem', 'latency', 'packetLoss', 'jitter', 'customOid'];
const OPERATORS = ['GT', 'GTE', 'LT', 'LTE'];
const SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const SCOPES = ['ALL', 'DEVICE_TYPE', 'DEVICES'];
const DEVICE_TYPES = ['ROUTER', 'SWITCH', 'OLT', 'ONT', 'FIREWALL', 'SERVER', 'OTHER'];

const inputCls =
  'w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500';
const labelCls = 'block text-xs font-medium text-slate-400 mb-1';

function emptyRule(): Partial<Rule> {
  return {
    name: '',
    metric: 'cpu',
    operator: 'GTE',
    threshold: 80,
    severity: 'HIGH',
    consecutiveSamples: 2,
    deviceScope: 'ALL',
    deviceType: null,
    deviceIds: [],
    customOidId: null,
    enabled: true,
    cooldownMs: 300000,
  };
}

export default function AlertRulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [customOids, setCustomOids] = useState<CustomOidOption[]>([]);
  const [devices, setDevices] = useState<DeviceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<{ editing: Rule | null; draft: Partial<Rule> } | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  const showToast = (ok: boolean, msg: string) => {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const load = async () => {
    try {
      const res = await fetch('/api/alert-rules');
      if (res.ok) setRules((await res.json()).data ?? []);
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const run = async () => {
      try {
        const [rulesRes, oidsRes, devRes] = await Promise.all([
          fetch('/api/alert-rules'),
          fetch('/api/custom-oids'),
          fetch('/api/devices'),
        ]);
        if (rulesRes.ok) setRules((await rulesRes.json()).data ?? []);
        if (oidsRes.ok) setCustomOids((await oidsRes.json()).data ?? []);
        if (devRes.ok) {
          const j = await devRes.json();
          setDevices((Array.isArray(j.data) ? j.data : []).map((d: { id: string; name: string }) => ({ id: d.id, name: d.name })));
        }
      } catch {
        /* silent */
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, []);

  const openCreate = () => setModal({ editing: null, draft: emptyRule() });
  const openEdit = (rule: Rule) =>
    setModal({ editing: rule, draft: { ...rule, deviceIds: rule.deviceIds ?? [] } });

  const setDraft = (patch: Partial<Rule>) =>
    setModal((m) => (m ? { ...m, draft: { ...m.draft, ...patch } } : m));

  const save = async () => {
    if (!modal) return;
    setSaving(true);
    try {
      const payload = {
        name: modal.draft.name,
        metric: modal.draft.metric,
        operator: modal.draft.operator,
        threshold: Number(modal.draft.threshold),
        severity: modal.draft.severity,
        consecutiveSamples: Number(modal.draft.consecutiveSamples) || 2,
        deviceScope: modal.draft.deviceScope,
        deviceType: modal.draft.deviceScope === 'DEVICE_TYPE' ? modal.draft.deviceType : null,
        deviceIds: modal.draft.deviceScope === 'DEVICES' ? modal.draft.deviceIds : null,
        customOidId: modal.draft.metric === 'customOid' ? modal.draft.customOidId : null,
        cooldownMs: Number(modal.draft.cooldownMs) || 300000,
        enabled: modal.draft.enabled,
      };
      const url = modal.editing ? `/api/alert-rules/${modal.editing.id}` : '/api/alert-rules';
      const method = modal.editing ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Gagal menyimpan rule');
      showToast(true, modal.editing ? 'Rule diperbarui' : 'Rule dibuat');
      setModal(null);
      await load();
    } catch (err) {
      showToast(false, err instanceof Error ? err.message : 'Gagal');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (rule: Rule) => {
    const res = await fetch(`/api/alert-rules/${rule.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !rule.enabled }),
    });
    if (res.ok) {
      showToast(true, `${rule.name} ${rule.enabled ? 'dinonaktifkan' : 'diaktifkan'}`);
      await load();
    }
  };

  const remove = async (rule: Rule) => {
    if (!window.confirm(`Hapus rule "${rule.name}"?`)) return;
    const res = await fetch(`/api/alert-rules/${rule.id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast(true, 'Rule dihapus');
      await load();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Rules Threshold</h2>
          <p className="text-slate-400 text-sm mt-1">
            Rule user-defined untuk alert otomatis (CPU, Memory, Latency, PacketLoss, Jitter, Custom
            OID). Dievaluasi poller terhadap nilai segar.
          </p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-xl transition-colors"
        >
          + Buat Rule
        </button>
      </div>

      {toast && (
        <div
          className={`flex items-center justify-between p-4 rounded-xl border text-sm ${toast.ok ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' : 'bg-rose-500/10 border-rose-500/20 text-rose-300'}`}
        >
          <span>{toast.msg}</span>
          <button onClick={() => setToast(null)} className="text-slate-400 hover:text-white">
            ✕
          </button>
        </div>
      )}

      <div className="bg-slate-900 border border-slate-800/80 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950/60 border-b border-slate-800 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-5 py-4">Rule</th>
                <th className="px-5 py-4">Kondisi</th>
                <th className="px-5 py-4">Severity</th>
                <th className="px-5 py-4">Sampel</th>
                <th className="px-5 py-4">Cakupan</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-14 text-center text-slate-500">
                    Memuat…
                  </td>
                </tr>
              ) : rules.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-14 text-center">
                    <p className="font-medium text-slate-400">Belum ada rule threshold</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Buat rule pertama untuk alert otomatis berbasis kondisi.
                    </p>
                  </td>
                </tr>
              ) : (
                rules.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-5 py-4 font-semibold text-white">{r.name}</td>
                    <td className="px-5 py-4 font-mono text-xs">
                      {r.metric} {r.operator} {r.threshold}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`px-2 py-0.5 text-xs font-bold rounded border ${
                          r.severity === 'CRITICAL'
                            ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                            : r.severity === 'HIGH'
                              ? 'bg-orange-500/20 text-orange-400 border-orange-500/30'
                              : r.severity === 'MEDIUM'
                                ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                                : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                        }`}
                      >
                        {r.severity}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-400">{r.consecutiveSamples}</td>
                    <td className="px-5 py-4 text-xs text-slate-400">
                      {r.deviceScope}
                      {r.deviceType ? ` · ${r.deviceType}` : ''}
                    </td>
                    <td className="px-5 py-4">
                      <button
                        onClick={() => void toggle(r)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-full border ${
                          r.enabled
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        {r.enabled ? 'AKTIF' : 'NONAKTIF'}
                      </button>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="inline-flex gap-1.5">
                        <button
                          onClick={() => openEdit(r)}
                          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-blue-400 text-xs font-medium rounded-lg transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => void remove(r)}
                          className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-medium rounded-lg transition-colors"
                        >
                          Hapus
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal buat/edit */}
      {modal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">
                {modal.editing ? 'Edit Rule' : 'Buat Rule'}
              </h3>
              <button
                onClick={() => setModal(null)}
                className="text-slate-400 hover:text-white text-xl leading-none"
              >
                ✕
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className={labelCls}>Nama Rule</label>
                <input
                  className={inputCls}
                  value={modal.draft.name ?? ''}
                  onChange={(e) => setDraft({ name: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Metrik</label>
                  <select
                    className={inputCls}
                    value={modal.draft.metric}
                    onChange={(e) => setDraft({ metric: e.target.value })}
                  >
                    {METRICS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Operator</label>
                  <select
                    className={inputCls}
                    value={modal.draft.operator}
                    onChange={(e) => setDraft({ operator: e.target.value })}
                  >
                    {OPERATORS.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Threshold</label>
                  <input
                    type="number"
                    className={inputCls}
                    value={String(modal.draft.threshold ?? '')}
                    onChange={(e) => setDraft({ threshold: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className={labelCls}>Severity</label>
                  <select
                    className={inputCls}
                    value={modal.draft.severity}
                    onChange={(e) => setDraft({ severity: e.target.value })}
                  >
                    {SEVERITIES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Sampel berturut</label>
                  <input
                    type="number"
                    className={inputCls}
                    value={String(modal.draft.consecutiveSamples ?? 2)}
                    onChange={(e) => setDraft({ consecutiveSamples: Number(e.target.value) })}
                  />
                </div>
              </div>

              {modal.draft.metric === 'customOid' && (
                <div>
                  <label className={labelCls}>Custom OID</label>
                  <select
                    className={inputCls}
                    value={modal.draft.customOidId ?? ''}
                    onChange={(e) => setDraft({ customOidId: e.target.value || null })}
                  >
                    <option value="">— Pilih OID —</option>
                    {customOids.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name} ({o.oid}) · {o.device?.name ?? '-'}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className={labelCls}>Cakupan Device</label>
                <select
                  className={inputCls}
                  value={modal.draft.deviceScope}
                  onChange={(e) => setDraft({ deviceScope: e.target.value })}
                >
                  {SCOPES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              {modal.draft.deviceScope === 'DEVICE_TYPE' && (
                <div>
                  <label className={labelCls}>Tipe Device</label>
                  <select
                    className={inputCls}
                    value={modal.draft.deviceType ?? ''}
                    onChange={(e) => setDraft({ deviceType: e.target.value })}
                  >
                    {DEVICE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {modal.draft.deviceScope === 'DEVICES' && (
                <div>
                  <label className={labelCls}>Device (multi-select via Ctrl)</label>
                  <select
                    multiple
                    size={5}
                    className={inputCls}
                    value={modal.draft.deviceIds ?? []}
                    onChange={(e) =>
                      setDraft({
                        deviceIds: Array.from(e.target.selectedOptions).map((o) => o.value),
                      })
                    }
                  >
                    {devices.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className={labelCls}>Cooldown Notifikasi (ms)</label>
                <input
                  type="number"
                  className={inputCls}
                  value={String(modal.draft.cooldownMs ?? 300000)}
                  onChange={(e) => setDraft({ cooldownMs: Number(e.target.value) })}
                />
              </div>

              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-blue-600"
                  checked={!!modal.draft.enabled}
                  onChange={(e) => setDraft({ enabled: e.target.checked })}
                />
                Aktif
              </label>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-800">
              <button
                onClick={() => setModal(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                onClick={() => void save()}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-sm font-medium rounded-xl transition-colors"
              >
                {saving ? 'Menyimpan…' : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
