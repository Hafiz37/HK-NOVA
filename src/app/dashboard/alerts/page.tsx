"use client";

import { useEffect, useState, useCallback, useRef, Fragment } from "react";
import { useRealtimeMonitoring } from "@/hooks/useSSE";
import { ExportMenu } from "@/components/dashboard/export-menu";

interface AlertItem {
  id: string;
  type: string;
  message: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "ACTIVE" | "ACKNOWLEDGED" | "RESOLVED";
  createdAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  dedupKey?: string | null;
  correlationKey?: string | null;
  parentId?: string | null;
  childAlerts?: AlertItem[];
  device: {
    id: string; name: string; ip: string; type: string; location: string | null;
  } | null;
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

const SEV_STYLES: Record<string, { label: string; cls: string }> = {
  CRITICAL: { label: "🔴 CRITICAL", cls: "bg-rose-500/20 text-rose-400 border-rose-500/30" },
  HIGH:     { label: "🟠 HIGH",     cls: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  MEDIUM:   { label: "🟡 MEDIUM",   cls: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  LOW:      { label: "🟢 LOW",      cls: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
};

const STATUS_STYLES: Record<string, string> = {
  ACTIVE:       "bg-rose-500/10 text-rose-400 border-rose-500/20",
  ACKNOWLEDGED: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  RESOLVED:     "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
};

const TABS = [
  { key: "ACTIVE", label: "🔥 Active" },
  { key: "ACKNOWLEDGED", label: "👁️ Acknowledged" },
  { key: "RESOLVED", label: "✅ Resolved" },
  { key: "ALL", label: "📋 Semua" },
];

function SevBadge({ severity }: { severity: string }) {
  const s = SEV_STYLES[severity] ?? SEV_STYLES.LOW;
  return <span className={`px-2 py-0.5 text-xs font-bold rounded border ${s.cls}`}>{s.label}</span>;
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${STATUS_STYLES[status] ?? "bg-slate-800 text-slate-400 border-slate-700"}`}>
      {status}
    </span>
  );
}

export default function AlertsPage() {
  const [alerts, setAlerts]         = useState<AlertItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [tab, setTab]               = useState("ACTIVE");
  const [severity, setSeverity]     = useState("");
  const [search, setSearch]         = useState("");
  const [searchApplied, setSearchApplied] = useState("");
  const [page, setPage]             = useState(1);
  const [limit, setLimit]           = useState(20);
  const [total, setTotal]           = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [detail, setDetail]         = useState<AlertItem | null>(null);
  const [toast, setToast]           = useState<{ ok: boolean; msg: string } | null>(null);
  const [acting, setActing]         = useState<string | null>(null); // alertId being acted on

  const showToast = (ok: boolean, msg: string) => {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (tab !== "ALL") p.append("status", tab);
      if (severity) p.append("severity", severity);
      if (searchApplied) p.append("search", searchApplied);
      p.append("page", page.toString());
      p.append("limit", limit.toString());
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
    } catch { /* silent */ } finally { setLoading(false); }
  }, [tab, severity, searchApplied, page, limit]);

  useEffect(() => {
    const run = async () => { await fetchAlerts(); };
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
  const changeTab = (next: string) => { setTab(next); setPage(1); };
  const changeSeverity = (next: string) => { setSeverity(next); setPage(1); };
  const changeLimit = (next: number) => { setLimit(next); setPage(1); };

  const lastSseRefresh = useRef(0);
  useRealtimeMonitoring(() => {
    const now = Date.now();
    if (now - lastSseRefresh.current < 10_000) return;
    lastSseRefresh.current = now;
    void fetchAlerts();
  }, true);

  const doAction = async (id: string, action: "acknowledge" | "resolve") => {
    setActing(id);
    try {
      const res = await fetch(`/api/alerts/${id}/${action}`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Gagal");
      showToast(true, action === "acknowledge" ? "Alert di-acknowledge" : "Alert di-resolve");
      // close detail modal if open for this alert
      if (detail?.id === id) setDetail(null);
      await fetchAlerts();
    } catch (err) {
      showToast(false, err instanceof Error ? err.message : "Gagal");
    } finally { setActing(null); }
  };

  const buildExportUrl = (format: "csv" | "xlsx" | "pdf") => {
    const params = new URLSearchParams({ format });
    if (tab !== "ALL") params.set("status", tab);
    if (severity) params.set("severity", severity);
    if (searchApplied) params.set("search", searchApplied);
    return `/api/export/alerts?${params.toString()}`;
  };

  // counts per tab for badges (dari halaman saat ini)
  const counts = {
    ACTIVE: alerts.filter(a => a.status === "ACTIVE").length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Pusat Alert &amp; Notifikasi</h2>
          <p className="text-slate-400 text-sm mt-1">Daftar alert kejadian perangkat jaringan dan deteksi sistem</p>
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
          <button onClick={() => void fetchAlerts()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-xl border border-slate-700 transition-colors">
            🔄 Refresh
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`flex items-center justify-between p-4 rounded-xl border text-sm ${toast.ok ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300" : "bg-rose-500/10 border-rose-500/20 text-rose-300"}`}>
          <span>{toast.msg}</span>
          <button onClick={() => setToast(null)} className="ml-4 text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-800 gap-1 overflow-x-auto">
        {TABS.map(t => (
          <button key={t.key} onClick={() => changeTab(t.key)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 whitespace-nowrap transition-all flex items-center gap-1.5 ${
              tab === t.key
                ? "border-blue-500 text-blue-400"
                : "border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700"
            }`}>
            {t.label}
            {t.key === "ACTIVE" && counts.ACTIVE > 0 && (
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
          <input type="text" placeholder="Cari pesan, device, atau IP…"
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500" />
        </div>
        <select value={severity} onChange={e => changeSeverity(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-blue-500">
          <option value="">Semua Severity</option>
          <option value="CRITICAL">🔴 Critical</option>
          <option value="HIGH">🟠 High</option>
          <option value="MEDIUM">🟡 Medium</option>
          <option value="LOW">🟢 Low</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800/80 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950/60 border-b border-slate-800 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <tr>
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
                [1,2,3,4].map(i => (
                  <tr key={i} className="animate-pulse">
                    {[16,24,28,48,20,16,16].map((w,j) => (
                      <td key={j} className="px-5 py-4">
                        <div className={`h-4 w-${w} bg-slate-800 rounded ${j===6?"ml-auto":""}`} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : alerts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-14 text-center">
                    <div className="text-3xl mb-2">{tab === "ACTIVE" ? "🎉" : "📋"}</div>
                    <p className="font-medium text-slate-400">
                      {tab === "ACTIVE" ? "Tidak ada alert aktif" : "Tidak ada alert ditemukan"}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">Sesuaikan filter atau tab status.</p>
                  </td>
                </tr>
              ) : alerts.map(alert => (
                <Fragment key={alert.id}>
                <tr className="hover:bg-slate-800/40 transition-colors">
                  <td className="px-5 py-4"><SevBadge severity={alert.severity} /></td>
                  <td className="px-5 py-4 font-semibold text-slate-200 whitespace-nowrap">
                    <span className="inline-flex items-center gap-2">
                      {alert.type}
                      {(alert.childAlerts && alert.childAlerts.length > 0) && (
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
                    ) : <span className="text-slate-500 text-xs">System</span>}
                  </td>
                  <td className="px-5 py-4 text-slate-300 max-w-xs">
                    <p className="truncate" title={alert.message}>{alert.message}</p>
                  </td>
                  <td className="px-5 py-4 text-xs text-slate-400 whitespace-nowrap">
                    {new Date(alert.createdAt).toLocaleString("id-ID")}
                  </td>
                  <td className="px-5 py-4"><StatusBadge status={alert.status} /></td>
                  <td className="px-5 py-4 text-right">
                    <div className="inline-flex gap-1.5 flex-wrap justify-end">
                      <button onClick={() => setDetail(alert)}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-blue-400 text-xs font-medium rounded-lg transition-colors">
                        Detail
                      </button>
                      {alert.status === "ACTIVE" && (
                        <button onClick={() => void doAction(alert.id, "acknowledge")}
                          disabled={acting === alert.id}
                          className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 disabled:opacity-60 text-amber-400 border border-amber-500/30 text-xs font-medium rounded-lg transition-colors">
                          {acting === alert.id ? "…" : "Ack"}
                        </button>
                      )}
                      {alert.status !== "RESOLVED" && (
                        <button onClick={() => void doAction(alert.id, "resolve")}
                          disabled={acting === alert.id}
                          className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-60 text-emerald-400 border border-emerald-500/30 text-xs font-medium rounded-lg transition-colors">
                          {acting === alert.id ? "…" : "Resolve"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                {(alert.childAlerts ?? []).map(child => (
                  <tr key={child.id} className="bg-slate-950/40 hover:bg-slate-900/40 transition-colors">
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
                      ) : <span className="text-slate-500 text-xs">System</span>}
                    </td>
                    <td className="px-5 py-3 text-slate-400 max-w-xs">
                      <p className="truncate text-xs" title={child.message}>{child.message}</p>
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-500 whitespace-nowrap">
                      {new Date(child.createdAt).toLocaleString("id-ID")}
                    </td>
                    <td className="px-5 py-3"><StatusBadge status={child.status} /></td>
                    <td className="px-5 py-3" />
                  </tr>
                ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && alerts.length > 0 && (
          <div className="px-5 py-3 border-t border-slate-800 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-xs text-slate-500">
              Menampilkan {((page - 1) * limit) + 1} - {Math.min(page * limit, total)} dari {total} alert
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
                <span className="text-sm text-slate-300 px-2">Halaman {page} / {totalPages}</span>
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
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <SevBadge severity={detail.severity} />
                <h3 className="text-base font-bold text-white">{detail.type}</h3>
              </div>
              <button onClick={() => setDetail(null)} className="text-slate-400 hover:text-white text-xl leading-none">✕</button>
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
                    <p className="text-slate-300">{detail.device.location ?? "—"}</p>
                  </div>
                </div>
              )}

              {/* Timestamps */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs text-slate-400 pt-2 border-t border-slate-800">
                <div>
                  <p className="text-slate-500">Dibuat</p>
                  <p>{new Date(detail.createdAt).toLocaleString("id-ID")}</p>
                </div>
                {detail.acknowledgedAt && (
                  <div>
                    <p className="text-slate-500">Acknowledged</p>
                    <p>{new Date(detail.acknowledgedAt).toLocaleString("id-ID")}</p>
                  </div>
                )}
                {detail.resolvedAt && (
                  <div>
                    <p className="text-slate-500">Resolved</p>
                    <p>{new Date(detail.resolvedAt).toLocaleString("id-ID")}</p>
                  </div>
                )}
              </div>

              {/* Korelasi / Child alerts */}
              {detail.childAlerts && detail.childAlerts.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-indigo-400 uppercase mb-2">
                    ⛓ Terkait ({detail.childAlerts.length})
                  </p>
                  <div className="space-y-1.5">
                    {detail.childAlerts.map(child => (
                      <div key={child.id} className="flex items-start gap-2 bg-slate-950 p-3 rounded-lg border border-slate-800">
                        <SevBadge severity={child.severity} />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-200">{child.type}</p>
                          <p className="text-xs text-slate-400 leading-relaxed mt-0.5">{child.message}</p>
                          <p className="text-[10px] text-slate-600 mt-0.5">
                            {new Date(child.createdAt).toLocaleString("id-ID")} · {child.status}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-800">
              {detail.status === "ACTIVE" && (
                <button onClick={() => void doAction(detail.id, "acknowledge")}
                  disabled={acting === detail.id}
                  className="px-4 py-2 bg-amber-500/10 hover:bg-amber-500/20 disabled:opacity-60 text-amber-400 border border-amber-500/30 text-sm font-medium rounded-xl transition-colors">
                  {acting === detail.id ? "…" : "👁️ Acknowledge"}
                </button>
              )}
              {detail.status !== "RESOLVED" && (
                <button onClick={() => void doAction(detail.id, "resolve")}
                  disabled={acting === detail.id}
                  className="px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 disabled:opacity-60 text-emerald-400 border border-emerald-500/30 text-sm font-medium rounded-xl transition-colors">
                  {acting === detail.id ? "…" : "✅ Resolve"}
                </button>
              )}
              <button onClick={() => setDetail(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-xl transition-colors">
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
