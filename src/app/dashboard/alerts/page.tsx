'use client';

import { useEffect, useState, useCallback, useRef, Fragment } from 'react';
import { useRealtimeMonitoring } from '@/hooks/useSSE';
import { ExportMenu } from '@/components/dashboard/export-menu';

interface AlertItem {
  id: string;
  type: string;
  message: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';
  createdAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  dedupKey?: string | null;
  correlationKey?: string | null;
  parentId?: string | null;
  childAlerts?: AlertItem[];
  firstTriggeredAt?: string | null;
  valueSnapshot?: Record<string, unknown> | null;
  note?: string | null;
  escalationLevel?: number | null;
  escalations?: { id: string; level: number; triggeredAt: string }[];
  assignee?: { id: string; username: string; fullName: string | null } | null;
  activities?: AlertActivityItem[];
  _count?: { deliveries?: number };
  device: {
    id: string;
    name: string;
    ip: string;
    type: string;
    location: string | null;
  } | null;
}

interface AlertActivityItem {
  id: string;
  action: string;
  actorName?: string | null;
  message?: string | null;
  createdAt: string;
}

interface UserOption {
  id: string;
  username: string;
  fullName: string | null;
}

interface AlertsListResponse {
  data: AlertItem[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

function formatAge(fromIso?: string | null): string {
  if (!fromIso) return '—';
  const from = new Date(fromIso).getTime();
  const diffMs = Math.max(0, Date.now() - from);
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return '< 1 menit';
  if (mins < 60) return `${mins} menit`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours} jam ${mins % 60} menit`;
  return `${Math.floor(hours / 24)} hari`;
}

function isOverdue(alert: AlertItem, slaMinutes?: number | null): boolean {
  if (!slaMinutes || alert.status === 'RESOLVED') return false;
  const onset = alert.firstTriggeredAt ?? alert.createdAt;
  if (!onset) return false;
  return (Date.now() - new Date(onset).getTime()) / 60000 > slaMinutes;
}

const ACTIVITY_LABELS: Record<string, { icon: string; cls: string }> = {
  CREATED: { icon: '🆕', cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  ACKNOWLEDGED: { icon: '👁️', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  RESOLVED: { icon: '✅', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  ASSIGNED: { icon: '👤', cls: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' },
  NOTE_ADDED: { icon: '📝', cls: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' },
  ESCALATED: { icon: '🚨', cls: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
  REOPENED: { icon: '🔁', cls: 'bg-violet-500/10 text-violet-400 border-violet-500/20' },
};

const SEV_STYLES: Record<string, { label: string; cls: string }> = {
  CRITICAL: { label: '🔴 CRITICAL', cls: 'bg-rose-500/20 text-rose-400 border-rose-500/30' },
  HIGH: { label: '🟠 HIGH', cls: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  MEDIUM: { label: '🟡 MEDIUM', cls: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  LOW: { label: '🟢 LOW', cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
};

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  ACKNOWLEDGED: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  RESOLVED: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
};

const TABS = [
  { key: 'ACTIVE', label: '🔥 Active' },
  { key: 'ACKNOWLEDGED', label: '👁️ Acknowledged' },
  { key: 'RESOLVED', label: '✅ Resolved' },
  { key: 'ALL', label: '📋 Semua' },
];

function SevBadge({ severity }: { severity: string }) {
  const s = SEV_STYLES[severity] ?? SEV_STYLES.LOW;
  return <span className={`px-2 py-0.5 text-xs font-bold rounded border ${s.cls}`}>{s.label}</span>;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${STATUS_STYLES[status] ?? 'bg-slate-800 text-slate-400 border-slate-700'}`}
    >
      {status}
    </span>
  );
}

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('ACTIVE');
  const [severity, setSeverity] = useState('');
  const [search, setSearch] = useState('');
  const [searchApplied, setSearchApplied] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [detail, setDetail] = useState<AlertItem | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const [acting, setActing] = useState<string | null>(null); // alertId being acted on
  const [users, setUsers] = useState<UserOption[]>([]);
  const [assigneeDraft, setAssigneeDraft] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [savingPatch, setSavingPatch] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkActing, setBulkActing] = useState(false);
  const [policy, setPolicy] = useState<{ ackSlaMinutes: number; resolveSlaMinutes: number } | null>(
    null
  );

  // Ambil daftar user untuk dropdown assignee (OPERATOR + ADMIN)
  useEffect(() => {
    fetch('/api/users')
      .then((r) =>
        r.ok
          ? r.json()
          : (() => {
              throw new Error('forbidden');
            })()
      )
      .then((json) => setUsers((json.data ?? []).map((u: UserOption) => u)))
      .catch(() => {
        /* VIEWER atau gagal — abaikan */
      });
  }, []);

  // Policy SLA untuk badge overdue (hanya admin tersedia; yang lain diabaikan)
  useEffect(() => {
    fetch('/api/settings/alert-policies')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.data) setPolicy(j.data);
      })
      .catch(() => {
        /* non-admin — abaikan */
      });
  }, []);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelected((prev) => {
      const ids = alerts.map((a) => a.id);
      const allSelected = ids.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  };

  const bulkAction = async (action: 'acknowledge' | 'resolve') => {
    if (selected.size === 0) return;
    setBulkActing(true);
    try {
      const res = await fetch('/api/alerts/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ids: [...selected] }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Gagal');
      showToast(true, json.message ?? 'Operasi bulk selesai');
      setSelected(new Set());
      setDetail(null);
      await fetchAlerts();
    } catch (err) {
      showToast(false, err instanceof Error ? err.message : 'Gagal');
    } finally {
      setBulkActing(false);
    }
  };

  const showToast = (ok: boolean, msg: string) => {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (tab !== 'ALL') p.append('status', tab);
      if (severity) p.append('severity', severity);
      if (searchApplied) p.append('search', searchApplied);
      p.append('page', page.toString());
      p.append('limit', limit.toString());
      const res = await fetch(`/api/alerts?${p}`);
      if (res.ok) {
        const json: AlertsListResponse = await res.json();
        setAlerts(json.data ?? []);
        const pg = json.pagination;
        if (pg) {
          setTotal(pg.total);
          setTotalPages(pg.totalPages);
        }
      }
    } catch {
      /* silent */
    } finally {
      setLoading(false);
    }
  }, [tab, severity, searchApplied, page, limit]);

  useEffect(() => {
    const run = async () => {
      await fetchAlerts();
    };
    void run();
  }, [fetchAlerts]);

  // Debounce pencarian server-side
  useEffect(() => {
    const handle = setTimeout(() => {
      setSearchApplied(search.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(handle);
  }, [search]);

  // Reset halaman saat tab/severity/limit diganti
  const changeTab = (next: string) => {
    setTab(next);
    setPage(1);
  };
  const changeSeverity = (next: string) => {
    setSeverity(next);
    setPage(1);
  };
  const changeLimit = (next: number) => {
    setLimit(next);
    setPage(1);
  };

  const lastSseRefresh = useRef(0);
  useRealtimeMonitoring(() => {
    const now = Date.now();
    if (now - lastSseRefresh.current < 10_000) return;
    lastSseRefresh.current = now;
    void fetchAlerts();
  }, true);

  const doAction = async (id: string, action: 'acknowledge' | 'resolve') => {
    setActing(id);
    try {
      const res = await fetch(`/api/alerts/${id}/${action}`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Gagal');
      showToast(true, action === 'acknowledge' ? 'Alert di-acknowledge' : 'Alert di-resolve');
      // close detail modal if open for this alert
      if (detail?.id === id) setDetail(null);
      await fetchAlerts();
    } catch (err) {
      showToast(false, err instanceof Error ? err.message : 'Gagal');
    } finally {
      setActing(null);
    }
  };

  const buildExportUrl = (format: 'csv' | 'xlsx' | 'pdf') => {
    const params = new URLSearchParams({ format });
    if (tab !== 'ALL') params.set('status', tab);
    if (severity) params.set('severity', severity);
    if (searchApplied) params.set('search', searchApplied);
    return `/api/export/alerts?${params.toString()}`;
  };

  const savePatch = async () => {
    if (!detail) return;
    setSavingPatch(true);
    try {
      const body: { assigneeId?: string | null; note?: string | null } = {};
      if (assigneeDraft !== (detail.assignee?.id ?? '')) body.assigneeId = assigneeDraft || null;
      if (noteDraft !== (detail.note ?? '')) body.note = noteDraft || null;
      if (Object.keys(body).length === 0) {
        showToast(true, 'Tidak ada perubahan');
        setSavingPatch(false);
        return;
      }
      const res = await fetch(`/api/alerts/${detail.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Gagal menyimpan');
      showToast(true, 'Alert diperbarui');
      setDetail(json.data);
      await fetchAlerts();
    } catch (err) {
      showToast(false, err instanceof Error ? err.message : 'Gagal menyimpan');
    } finally {
      setSavingPatch(false);
    }
  };

  const openDetail = (alert: AlertItem) => {
    setAssigneeDraft(alert.assignee?.id ?? '');
    setNoteDraft(alert.note ?? '');
    setDetail(alert);
  };

  // counts per tab for badges (server-side total saat tab ACTIVE)
  const counts = {
    ACTIVE: tab === 'ACTIVE' ? total : alerts.filter((a) => a.status === 'ACTIVE').length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">
            Pusat Alert &amp; Notifikasi
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            Daftar alert kejadian perangkat jaringan dan deteksi sistem
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <ExportMenu buildUrl={buildExportUrl} />
          <select
            value={limit}
            onChange={(e) => changeLimit(Number(e.target.value))}
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          >
            <option value={10}>10/halaman</option>
            <option value={20}>20/halaman</option>
            <option value={50}>50/halaman</option>
            <option value={100}>100/halaman</option>
          </select>
          <button
            onClick={() => void fetchAlerts()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-xl border border-slate-700 transition-colors"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`flex items-center justify-between p-4 rounded-xl border text-sm ${toast.ok ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' : 'bg-rose-500/10 border-rose-500/20 text-rose-300'}`}
        >
          <span>{toast.msg}</span>
          <button onClick={() => setToast(null)} className="ml-4 text-slate-400 hover:text-white">
            ✕
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-800 gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => changeTab(t.key)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 whitespace-nowrap transition-all flex items-center gap-1.5 ${
              tab === t.key
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
            }`}
          >
            {t.label}
            {t.key === 'ACTIVE' && counts.ACTIVE > 0 && (
              <span className="px-1.5 py-0.5 text-xs bg-rose-500 text-white rounded-full font-bold leading-none">
                {counts.ACTIVE}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search + Severity */}
      <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-4 flex flex-col md:flex-row gap-3">
        <div className="flex-1 relative">
          <span className="absolute left-3 top-2.5 text-slate-500 text-sm">🔍</span>
          <input
            type="text"
            placeholder="Cari pesan, device, atau IP…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
        <select
          value={severity}
          onChange={(e) => changeSeverity(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-blue-500"
        >
          <option value="">Semua Severity</option>
          <option value="CRITICAL">🔴 Critical</option>
          <option value="HIGH">🟠 High</option>
          <option value="MEDIUM">🟡 Medium</option>
          <option value="LOW">🟢 Low</option>
        </select>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 bg-indigo-500/10 border border-indigo-500/30 rounded-xl px-4 py-3">
          <span className="text-sm font-semibold text-indigo-300">
            {selected.size} alert dipilih
          </span>
          <button
            onClick={() => void bulkAction('acknowledge')}
            disabled={bulkActing}
            className="px-3 py-1.5 text-xs bg-amber-500/10 hover:bg-amber-500/20 disabled:opacity-60 text-amber-400 border border-amber-500/30 rounded-lg transition-colors"
          >
            {bulkActing ? '…' : '👁️ Bulk Ack'}
          </button>
          <button
            onClick={() => void bulkAction('resolve')}
            disabled={bulkActing}
            className="px-3 py-1.5 text-xs bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-60 text-emerald-400 border border-emerald-500/30 rounded-lg transition-colors"
          >
            {bulkActing ? '…' : '✅ Bulk Resolve'}
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
          >
            Batal
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800/80 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950/60 border-b border-slate-800 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-3 py-4 w-10">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-blue-600"
                    checked={alerts.length > 0 && alerts.every((a) => selected.has(a.id))}
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="px-5 py-4">Severity</th>
                <th className="px-5 py-4">Tipe</th>
                <th className="px-5 py-4">Device</th>
                <th className="px-5 py-4 max-w-xs">Pesan</th>
                <th className="px-5 py-4 whitespace-nowrap">Waktu</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                [1, 2, 3, 4].map((i) => (
                  <tr key={i} className="animate-pulse">
                    {[16, 24, 28, 48, 20, 16, 16].map((w, j) => (
                      <td key={j} className="px-5 py-4">
                        <div
                          className={`h-4 w-${w} bg-slate-800 rounded ${j === 6 ? 'ml-auto' : ''}`}
                        />
                      </td>
                    ))}
                  </tr>
                ))
              ) : alerts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-14 text-center">
                    <div className="text-3xl mb-2">{tab === 'ACTIVE' ? '🎉' : '📋'}</div>
                    <p className="font-medium text-slate-400">
                      {tab === 'ACTIVE' ? 'Tidak ada alert aktif' : 'Tidak ada alert ditemukan'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">Sesuaikan filter atau tab status.</p>
                  </td>
                </tr>
              ) : (
                alerts.map((alert) => (
                  <Fragment key={alert.id}>
                    <tr className="hover:bg-slate-800/40 transition-colors">
                      <td className="px-3 py-4">
                        <input
                          type="checkbox"
                          className="w-4 h-4 accent-blue-600"
                          checked={selected.has(alert.id)}
                          onChange={() => toggleSelect(alert.id)}
                        />
                      </td>
                      <td className="px-5 py-4">
                        <SevBadge severity={alert.severity} />
                      </td>
                      <td className="px-5 py-4 font-semibold text-slate-200 whitespace-nowrap">
                        <span className="inline-flex items-center gap-2">
                          {alert.type}
                          {(alert.escalationLevel ?? 0) > 0 && (
                            <span
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30"
                              title="Telah mengalami eskalasi"
                            >
                              🚨 L{alert.escalationLevel}
                            </span>
                          )}
                          {alert.childAlerts && alert.childAlerts.length > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                              ⊞ Induk · {alert.childAlerts.length}
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        {alert.device ? (
                          <div>
                            <p className="font-medium text-white">{alert.device.name}</p>
                            <p className="text-xs font-mono text-slate-400">{alert.device.ip}</p>
                          </div>
                        ) : (
                          <span className="text-slate-500 text-xs">System</span>
                        )}
                      </td>
                      <td className="px-5 py-4 text-slate-300 max-w-xs">
                        <p className="truncate" title={alert.message}>
                          {alert.message}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-400 whitespace-nowrap">
                        {new Date(alert.createdAt).toLocaleString('id-ID')}
                      </td>
                      <td className="px-5 py-4">
                        <StatusBadge status={alert.status} />
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="inline-flex gap-1.5 flex-wrap justify-end">
                          <button
                            onClick={() => openDetail(alert)}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-blue-400 text-xs font-medium rounded-lg transition-colors"
                          >
                            Detail
                          </button>
                          {alert.status === 'ACTIVE' && (
                            <button
                              onClick={() => void doAction(alert.id, 'acknowledge')}
                              disabled={acting === alert.id}
                              className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 disabled:opacity-60 text-amber-400 border border-amber-500/30 text-xs font-medium rounded-lg transition-colors"
                            >
                              {acting === alert.id ? '…' : 'Ack'}
                            </button>
                          )}
                          {alert.status !== 'RESOLVED' && (
                            <button
                              onClick={() => void doAction(alert.id, 'resolve')}
                              disabled={acting === alert.id}
                              className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-60 text-emerald-400 border border-emerald-500/30 text-xs font-medium rounded-lg transition-colors"
                            >
                              {acting === alert.id ? '…' : 'Resolve'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {(alert.childAlerts ?? []).map((child) => (
                      <tr
                        key={child.id}
                        className="bg-slate-950/40 hover:bg-slate-900/40 transition-colors"
                      >
                        <td className="px-3 py-3" />
                        <td className="px-5 py-3 pl-10">
                          <span className="text-slate-600 mr-2">└─</span>
                          <SevBadge severity={child.severity} />
                        </td>
                        <td className="px-5 py-3 text-xs text-slate-400 whitespace-nowrap">
                          <span className="inline-flex items-center gap-2">
                            {child.type}
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                              ⛓ Terkait
                            </span>
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          {child.device ? (
                            <div>
                              <p className="font-medium text-slate-300">{child.device.name}</p>
                              <p className="text-xs font-mono text-slate-500">{child.device.ip}</p>
                            </div>
                          ) : (
                            <span className="text-slate-500 text-xs">System</span>
                          )}
                        </td>
                        <td className="px-5 py-3 text-slate-400 max-w-xs">
                          <p className="truncate text-xs" title={child.message}>
                            {child.message}
                          </p>
                        </td>
                        <td className="px-5 py-3 text-xs text-slate-500 whitespace-nowrap">
                          {new Date(child.createdAt).toLocaleString('id-ID')}
                        </td>
                        <td className="px-5 py-3">
                          <StatusBadge status={child.status} />
                        </td>
                        <td className="px-5 py-3" />
                      </tr>
                    ))}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!loading && alerts.length > 0 && (
          <div className="px-5 py-3 border-t border-slate-800 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-slate-500">
              Menampilkan {(page - 1) * limit + 1} - {Math.min(page * limit, total)} dari {total}{' '}
              alert
            </p>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Sebelumnya
                </button>
                <span className="text-sm text-slate-300 px-2">
                  Halaman {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Selanjutnya
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Detail Modal ── */}
      {detail && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <SevBadge severity={detail.severity} />
                <h3 className="text-base font-bold text-white">{detail.type}</h3>
              </div>
              <button
                onClick={() => setDetail(null)}
                className="text-slate-400 hover:text-white text-xl leading-none"
              >
                ✕
              </button>
            </div>

            <div className="px-6 py-5 space-y-4 text-sm">
              {/* Message */}
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase mb-1">Pesan Alert</p>
                <p className="text-slate-200 bg-slate-950 p-3 rounded-lg border border-slate-800 leading-relaxed">
                  {detail.message}
                </p>
              </div>

              {/* Device info */}
              {detail.device && (
                <div className="grid grid-cols-2 gap-3 bg-slate-950/50 p-4 rounded-xl border border-slate-800/60">
                  <div>
                    <p className="text-xs text-slate-500">Nama Perangkat</p>
                    <p className="font-semibold text-white">{detail.device.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">IP Address</p>
                    <p className="font-mono text-blue-400">{detail.device.ip}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Tipe</p>
                    <p className="text-slate-300">{detail.device.type}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Lokasi</p>
                    <p className="text-slate-300">{detail.device.location ?? '—'}</p>
                  </div>
                </div>
              )}

              {/* Timestamps */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs text-slate-400 pt-2 border-t border-slate-800">
                <div>
                  <p className="text-slate-500">Dibuat</p>
                  <p>{new Date(detail.createdAt).toLocaleString('id-ID')}</p>
                </div>
                {detail.firstTriggeredAt && (
                  <div>
                    <p className="text-slate-500">Mulai (onset)</p>
                    <p>{new Date(detail.firstTriggeredAt).toLocaleString('id-ID')}</p>
                    <p className="text-[10px] text-blue-400 mt-0.5">
                      umur {formatAge(detail.firstTriggeredAt)}
                    </p>
                  </div>
                )}
                {detail.acknowledgedAt && (
                  <div>
                    <p className="text-slate-500">Acknowledged</p>
                    <p>{new Date(detail.acknowledgedAt).toLocaleString('id-ID')}</p>
                  </div>
                )}
                {detail.resolvedAt && (
                  <div>
                    <p className="text-slate-500">Resolved</p>
                    <p>{new Date(detail.resolvedAt).toLocaleString('id-ID')}</p>
                  </div>
                )}
              </div>

              {/* SLA */}
              {policy &&
                isOverdue(
                  detail,
                  detail.status === 'ACTIVE' ? policy.ackSlaMinutes : policy.resolveSlaMinutes
                ) && (
                  <div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2 text-xs text-rose-300">
                    ⏰ Melewati SLA — segera tindak lanjuti
                  </div>
                )}

              {/* Eskalasi */}
              {(detail.escalationLevel ?? 0) > 0 && (
                <div>
                  <p className="text-xs font-semibold text-rose-400 uppercase mb-2">
                    🚨 Eskalasi — Level {detail.escalationLevel}
                  </p>
                  <div className="space-y-1.5">
                    {(detail.escalations ?? []).map((esc) => (
                      <div
                        key={esc.id}
                        className="flex items-center gap-2 bg-rose-500/5 p-2.5 rounded-lg border border-rose-500/20 text-xs text-rose-300"
                      >
                        <span className="font-bold">{`L${esc.level}`}</span>
                        <span className="text-rose-400/80">
                          {new Date(esc.triggeredAt).toLocaleString('id-ID')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Nilai pemicu (valueSnapshot) */}
              {detail.valueSnapshot && Object.keys(detail.valueSnapshot).length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-1">
                    Nilai Pemicu
                  </p>
                  <pre className="text-xs text-slate-300 bg-slate-950 p-3 rounded-lg border border-slate-800 overflow-x-auto whitespace-pre-wrap break-words">
                    {JSON.stringify(detail.valueSnapshot, null, 2)}
                  </pre>
                </div>
              )}

              {/* Penanggung jawab & catatan */}
              <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800/60 space-y-3">
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Penanggung Jawab</label>
                  <select
                    value={assigneeDraft}
                    onChange={(e) => setAssigneeDraft(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="">— Tidak ada —</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName || u.username}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-slate-500 block mb-1">Catatan</label>
                  <textarea
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    rows={2}
                    placeholder="Tulis catatan penanganan…"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 resize-y"
                  />
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => {
                      setAssigneeDraft(detail.assignee?.id ?? '');
                      setNoteDraft(detail.note ?? '');
                    }}
                    className="px-3 py-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors"
                  >
                    Reset
                  </button>
                  <button
                    onClick={() => void savePatch()}
                    disabled={savingPatch}
                    className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white rounded-lg transition-colors"
                  >
                    {savingPatch ? 'Menyimpan…' : 'Simpan'}
                  </button>
                </div>
              </div>

              {/* Timeline aktivitas */}
              {detail.activities && detail.activities.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
                    ⏱ Timeline ({detail.activities.length})
                  </p>
                  <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                    {detail.activities.map((act) => {
                      const meta = ACTIVITY_LABELS[act.action] ?? {
                        icon: '🔹',
                        cls: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
                      };
                      return (
                        <div
                          key={act.id}
                          className="flex items-start gap-2 bg-slate-950 p-2.5 rounded-lg border border-slate-800/80"
                        >
                          <span
                            className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded border font-bold uppercase ${meta.cls}`}
                          >
                            {meta.icon} {act.action}
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap break-words">
                              {act.message ?? act.action}
                            </p>
                            <p className="text-[10px] text-slate-600 mt-0.5">
                              {new Date(act.createdAt).toLocaleString('id-ID')}
                              {act.actorName ? ` · ${act.actorName}` : ''}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Korelasi / Child alerts */}
              {detail.childAlerts && detail.childAlerts.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-indigo-400 uppercase mb-2">
                    ⛓ Terkait ({detail.childAlerts.length})
                  </p>
                  <div className="space-y-1.5">
                    {detail.childAlerts.map((child) => (
                      <div
                        key={child.id}
                        className="flex items-start gap-2 bg-slate-950 p-3 rounded-lg border border-slate-800"
                      >
                        <SevBadge severity={child.severity} />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-200">{child.type}</p>
                          <p className="text-xs text-slate-400 leading-relaxed mt-0.5">
                            {child.message}
                          </p>
                          <p className="text-[10px] text-slate-600 mt-0.5">
                            {new Date(child.createdAt).toLocaleString('id-ID')} · {child.status}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-800">
              {detail.status === 'ACTIVE' && (
                <button
                  onClick={() => void doAction(detail.id, 'acknowledge')}
                  disabled={acting === detail.id}
                  className="px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 disabled:opacity-60 text-amber-400 border border-amber-500/30 text-sm font-medium rounded-xl transition-colors"
                >
                  {acting === detail.id ? '…' : '👁️ Acknowledge'}
                </button>
              )}
              {detail.status !== 'RESOLVED' && (
                <button
                  onClick={() => void doAction(detail.id, 'resolve')}
                  disabled={acting === detail.id}
                  className="px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-60 text-emerald-400 border border-emerald-500/30 text-sm font-medium rounded-xl transition-colors"
                >
                  {acting === detail.id ? '…' : '✅ Resolve'}
                </button>
              )}
              <button
                onClick={() => setDetail(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-xl transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
