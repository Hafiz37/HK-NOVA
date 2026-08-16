"use client";

import { useEffect, useState, useMemo, useCallback } from "react";

interface AuditLogUser {
  id: string;
  username: string;
  fullName: string | null;
  role: string;
}

interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entityId: string | null;
  userId: string | null;
  user?: AuditLogUser | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

interface AuditLogResponse {
  data: AuditLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const ACTION_COLORS: Record<string, string> = {
  LOGIN: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  LOGOUT: "text-slate-400 bg-slate-500/10 border-slate-500/20",
  CREATE: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  UPDATE: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  DELETE: "text-rose-400 bg-rose-500/10 border-rose-500/20",
  ACKNOWLEDGE: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  RESOLVE: "text-green-400 bg-green-500/10 border-green-500/20",
};

const ACTION_ICONS: Record<string, string> = {
  LOGIN: "🔐",
  LOGOUT: "🚪",
  CREATE: "➕",
  UPDATE: "✏️",
  DELETE: "🗑️",
  ACKNOWLEDGE: "✅",
  RESOLVE: "✔️",
};

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [totalPages, setTotalPages] = useState(0);
  const [filters, setFilters] = useState({
    action: "",
    entity: "",
    userId: "",
    dateFrom: "",
    dateTo: "",
  });
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });
      if (filters.action) params.set("action", filters.action);
      if (filters.entity) params.set("entity", filters.entity);
      if (filters.userId) params.set("userId", filters.userId);
      if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
      if (filters.dateTo) params.set("dateTo", filters.dateTo);

      const res = await fetch(`/api/audit-logs?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const json: AuditLogResponse = await res.json();
      setLogs(json.data);
      setTotal(json.total);
      setTotalPages(json.totalPages);
    } catch (err) {
      console.error("Failed to fetch audit logs:", err);
    } finally {
      setLoading(false);
    }
  }, [page, limit, filters.action, filters.entity, filters.userId, filters.dateFrom, filters.dateTo]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLogs();
  }, [fetchLogs]);

  const uniqueActions = useMemo(() => [...new Set(logs.map((l) => l.action))], [logs]);
  const uniqueEntities = useMemo(() => [...new Set(logs.map((l) => l.entity))], [logs]);
  const uniqueUsers = useMemo(() => {
    const seen = new Set<string>();
    return logs
      .map((l) => l.user)
      .filter((u): u is AuditLogUser => Boolean(u) && !seen.has(u!.id) && !seen.add(u!.id));
  }, [logs]);

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const formatDetails = (details: Record<string, unknown> | null): string => {
    if (!details) return "—";
    return JSON.stringify(details, null, 2);
  };

  const getActionBadge = (action: string) => {
    const colorClass = ACTION_COLORS[action] || "text-slate-400 bg-slate-500/10 border-slate-500/20";
    const icon = ACTION_ICONS[action] || "⚙️";
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-medium rounded-full border ${colorClass}`}>
        {icon} {action}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Audit Logs</h2>
          <p className="text-slate-400 mt-1 text-sm">Riwayat aktivitas semua user di sistem</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={limit}
            onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          >
            <option value={10}>10 per halaman</option>
            <option value={20}>20 per halaman</option>
            <option value={50}>50 per halaman</option>
          </select>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Aksi</label>
            <select
              value={filters.action}
              onChange={(e) => handleFilterChange("action", e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            >
              <option value="">Semua Aksi</option>
              {uniqueActions.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Entitas</label>
            <select
              value={filters.entity}
              onChange={(e) => handleFilterChange("entity", e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            >
              <option value="">Semua Entitas</option>
              {uniqueEntities.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">User</label>
            <select
              value={filters.userId}
              onChange={(e) => handleFilterChange("userId", e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            >
              <option value="">Semua User</option>
              {uniqueUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName || u.username} ({u.username})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Dari Tanggal</label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => handleFilterChange("dateFrom", e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">Sampai Tanggal</label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => handleFilterChange("dateTo", e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {filters.action || filters.entity || filters.userId || filters.dateFrom || filters.dateTo ? (
          <button
            onClick={() => setFilters({ action: "", entity: "", userId: "", dateFrom: "", dateTo: "" })}
            className="text-xs text-slate-400 hover:text-slate-300 flex items-center gap-1 transition-colors"
          >
            🔄 Reset Filter
          </button>
        ) : null}
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800/80 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 bg-slate-800/50 animate-pulse rounded" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-slate-500">Tidak ada data audit log</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-800/50">
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Waktu</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">User</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Aksi</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Entitas</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Entity ID</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">IP Address</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-800/30 transition-colors cursor-pointer" onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}>
                      <td className="px-4 py-3 text-sm text-slate-300 whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString("id-ID", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300">
                        {log.user ? (
                          <div>
                            <div className="font-medium text-white">{log.user.fullName || log.user.username}</div>
                            <div className="text-xs text-slate-500 font-mono">@{log.user.username}</div>
                          </div>
                        ) : (
                          <span className="text-slate-500 font-mono text-xs">{log.userId ?? "—"}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">{getActionBadge(log.action)}</td>
                      <td className="px-4 py-3 text-sm text-slate-300 font-medium">{log.entity}</td>
                      <td className="px-4 py-3 text-sm text-slate-500 font-mono text-xs max-w-[150px] truncate">{log.entityId ?? "—"}</td>
                      <td className="px-4 py-3 text-sm text-slate-500 font-mono text-xs">{log.ipAddress ?? "—"}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={(e) => { e.stopPropagation(); setExpandedId(expandedId === log.id ? null : log.id); }}
                          className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                        >
                          {expandedId === log.id ? "▲" : "▼"} Detail
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Expanded Details Row */}
            {logs.map((log) =>
              expandedId === log.id ? (
                <tr key={`detail-${log.id}`} className="bg-slate-800/50">
                  <td colSpan={7} className="px-4 py-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
                        <p className="text-xs font-semibold text-slate-400 mb-1">Details (JSON)</p>
                        <pre className="text-[10px] text-slate-300 overflow-x-auto max-h-64">{formatDetails(log.details)}</pre>
                      </div>
                      <div className="space-y-2 text-xs">
                        {log.user && (
                          <>
                            <p><span className="text-slate-400">User: </span><span className="text-slate-300">{log.user.fullName || log.user.username}</span></p>
                            <p><span className="text-slate-400">Username: </span><span className="text-slate-300 font-mono">@{log.user.username}</span></p>
                            <p><span className="text-slate-400">Role: </span><span className="text-slate-300">{log.user.role}</span></p>
                          </>
                        )}
                        <p><span className="text-slate-400">Log ID: </span><span className="text-slate-300 font-mono">{log.id}</span></p>
                        <p><span className="text-slate-400">Created: </span><span className="text-slate-300">{new Date(log.createdAt).toISOString()}</span></p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : null
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-slate-800 flex items-center justify-between">
                <p className="text-sm text-slate-400">
                  Menampilkan {((page - 1) * limit) + 1} - {Math.min(page * limit, total)} dari {total}
                </p>
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
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}