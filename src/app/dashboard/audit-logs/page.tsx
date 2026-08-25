"use client";

import { useEffect, useState, useCallback } from "react";
import { ExportMenu } from "@/components/dashboard/export-menu";

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
  verified?: boolean;
  sequenceNumber?: string;
  dataClassification?: string;
}

interface AuditLogResponse {
  data: AuditLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  meta?: { actions: string[]; entities: string[] };
}

interface AuditAnalytics {
  totalLogs: number;
  byAction: Record<string, number>;
  byEntity: Record<string, number>;
  byUser: Array<{ userId: string; username: string; fullName: string | null; count: number }>;
  byHour: Array<{ hour: number; count: number }>;
  topIPs: Array<{ ip: string; country: string | null; count: number }>;
  failedAttempts: { count: number; topUsers: Array<{ userId: string; count: number }>; topIPs: Array<{ ip: string; count: number }> };
  suspiciousActivities: Array<{ type: string; count: number; severity: string }>;
}

const ACTION_COLORS: Record<string, string> = {
  LOGIN: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  LOGOUT: "text-slate-400 bg-slate-500/10 border-slate-500/20",
  CREATE: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  UPDATE: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  DELETE: "text-rose-400 bg-rose-500/10 border-rose-500/20",
  ACKNOWLEDGE: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20",
  RESOLVE: "text-green-400 bg-green-500/10 border-green-500/20",
  EXPORT: "text-purple-400 bg-purple-500/10 border-purple-500/20",
  VERIFY: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",
};

const ACTION_ICONS: Record<string, string> = {
  LOGIN: "🔐",
  LOGOUT: "🚪",
  CREATE: "➕",
  UPDATE: "✏️",
  DELETE: "🗑️",
  ACKNOWLEDGE: "✅",
  RESOLVE: "✔️",
  EXPORT: "📤",
  VERIFY: "🔍",
};

const SEVERITY_COLORS: Record<string, string> = {
  low: "text-green-400 bg-green-500/10",
  medium: "text-amber-400 bg-amber-500/10",
  high: "text-orange-400 bg-orange-500/10",
  critical: "text-red-400 bg-red-500/10",
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
    verified: "",
  });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [availableActions, setAvailableActions] = useState<string[]>([]);
  const [availableEntities, setAvailableEntities] = useState<string[]>([]);
  const [availableUsers, setAvailableUsers] = useState<AuditLogUser[]>([]);

  // Phase 3 features
  const [analytics, setAnalytics] = useState<AuditAnalytics | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [verificationResult, setVerificationResult] = useState<{ valid: boolean; errors: any[] } | null>(null);
  const [verifying, setVerifying] = useState(false);

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
      if (filters.verified) params.set("verified", filters.verified);

      const res = await fetch(`/api/audit-logs?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const json: AuditLogResponse = await res.json();
      setLogs(json.data);
      setTotal(json.total);
      setTotalPages(json.totalPages);
      if (json.meta?.actions) setAvailableActions(json.meta.actions);
      if (json.meta?.entities) setAvailableEntities(json.meta.entities);
    } catch (err) {
      console.error("Failed to fetch audit logs:", err);
    } finally {
      setLoading(false);
    }
  }, [page, limit, filters.action, filters.entity, filters.userId, filters.dateFrom, filters.dateTo, filters.verified]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    let active = true;
    fetch("/api/users")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (active && json?.data) setAvailableUsers(json.data as AuditLogUser[]);
      })
      .catch(() => { /* silent */ });
    return () => { active = false; };
  }, []);

  const uniqueActions = availableActions;
  const uniqueEntities = availableEntities;
  const uniqueUsers = availableUsers;

  const buildExportUrl = (format: "csv" | "xlsx" | "pdf") => {
    const params = new URLSearchParams({ format });
    if (filters.action) params.set("action", filters.action);
    if (filters.entity) params.set("entity", filters.entity);
    if (filters.userId) params.set("userId", filters.userId);
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
    return `/api/export/audit-logs?${params.toString()}`;
  };

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

  const handleVerify = async () => {
    if (!filters.dateFrom || !filters.dateTo) {
      alert("Please select date range for verification");
      return;
    }
    setVerifying(true);
    try {
      const res = await fetch("/api/audit-logs/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startDate: filters.dateFrom, endDate: filters.dateTo }),
      });
      const result = await res.json();
      setVerificationResult(result);
    } catch (err) {
      console.error("Verification failed:", err);
    } finally {
      setVerifying(false);
    }
  };

  const fetchAnalytics = async () => {
    if (!filters.dateFrom || !filters.dateTo) {
      alert("Please select date range for analytics");
      return;
    }
    setAnalyticsLoading(true);
    try {
      const res = await fetch(`/api/audit-logs/analytics?startDate=${filters.dateFrom}&endDate=${filters.dateTo}`);
      const json = await res.json();
      setAnalytics(json.analytics);
      setShowAnalytics(true);
    } catch (err) {
      console.error("Analytics failed:", err);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const handleComplianceExport = async (format: "csv" | "json") => {
    if (!filters.dateFrom || !filters.dateTo) {
      alert("Please select date range for compliance export");
      return;
    }
    try {
      const res = await fetch("/api/audit-logs/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, startDate: filters.dateFrom, endDate: filters.dateTo, entity: filters.entity, action: filters.action, userId: filters.userId }),
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.headers.get("Content-Disposition")?.split("filename=")[1]?.replace(/"/g, "") || `audit-export.${format}`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Compliance export failed:", err);
      alert("Export failed");
    }
  };

  const renderAnalytics = () => {
    if (!analytics) return null;
    return (
      <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-4 space-y-6" style={{ animation: "fadeIn 0.2s ease-out" }}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Audit Analytics</h3>
          <button onClick={() => setShowAnalytics(false)} className="text-slate-400 hover:text-slate-300">✕ Close</button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-800/50 rounded-lg p-4">
            <p className="text-xs text-slate-400">Total Logs</p>
            <p className="text-3xl font-bold text-white">{analytics.totalLogs.toLocaleString()}</p>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-4">
            <p className="text-xs text-slate-400">Failed Logins</p>
            <p className="text-3xl font-bold text-red-400">{analytics.failedAttempts.count}</p>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-4">
            <p className="text-xs text-slate-400">Data Exports</p>
            <p className="text-3xl font-bold text-purple-400">{analytics.byAction.EXPORT || 0}</p>
          </div>
          <div className="bg-slate-800/50 rounded-lg p-4">
            <p className="text-xs text-slate-400">Privileged Ops</p>
            <p className="text-3xl font-bold text-orange-400">
              {(analytics.byAction.CREATE || 0) + (analytics.byAction.UPDATE || 0) + (analytics.byAction.DELETE || 0)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-slate-800/50 rounded-lg p-4">
            <h4 className="text-sm font-medium text-slate-300 mb-3">By Action</h4>
            <div className="space-y-2">
              {Object.entries(analytics.byAction).map(([action, count]) => (
                <div key={action} className="flex items-center justify-between text-sm">
                  <span className="text-slate-300">{getActionBadge(action)}</span>
                  <span className="font-mono text-white">{count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-slate-800/50 rounded-lg p-4">
            <h4 className="text-sm font-medium text-slate-300 mb-3">By Entity</h4>
            <div className="space-y-2">
              {Object.entries(analytics.byEntity).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([entity, count]) => (
                <div key={entity} className="flex items-center justify-between text-sm">
                  <span className="text-slate-300">{entity}</span>
                  <span className="font-mono text-white">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="bg-slate-800/50 rounded-lg p-4">
            <h4 className="text-sm font-medium text-slate-300 mb-3">Top Users</h4>
            <div className="space-y-2">
              {analytics.byUser.slice(0, 10).map((user, i) => (
                <div key={user.userId} className="flex items-center justify-between text-sm">
                  <span className="text-slate-300">{i + 1}. {user.fullName || user.username}</span>
                  <span className="font-mono text-white">{user.count}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-slate-800/50 rounded-lg p-4">
            <h4 className="text-sm font-medium text-slate-300 mb-3">Activity by Hour</h4>
            <div className="h-32 flex items-end justify-around gap-1">
              {analytics.byHour.map((h) => (
                <div key={h.hour} className="flex-1 max-w-4" style={{ height: `${Math.max(4, (h.count / Math.max(...analytics.byHour.map(x => x.count))) * 100)}px` }}>
                  <div className="bg-blue-500/50 hover:bg-blue-500 rounded-t transition-colors w-full h-full" title={`${h.hour}:00 - ${h.count} events`} />
                </div>
              ))}
            </div>
            <div className="flex justify-around text-[10px] text-slate-500 mt-1">
              {analytics.byHour.filter((_, i) => i % 3 === 0).map((h) => <span key={h.hour}>{h.hour}:00</span>)}
            </div>
          </div>
        </div>

        {analytics.suspiciousActivities.length > 0 && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
            <h4 className="text-sm font-medium text-red-400 mb-3">⚠ Suspicious Activities Detected</h4>
            <div className="space-y-2">
              {analytics.suspiciousActivities.map((a, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-red-300">{a.type.replace(/_/g, ' ')}</span>
                  <span className={`px-2 py-0.5 text-xs rounded ${SEVERITY_COLORS[a.severity]}`}>{a.severity}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
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
        <div className="flex flex-wrap items-center gap-2">
          <ExportMenu buildUrl={buildExportUrl} />
          <select
            value={limit}
            onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
          >
            <option value={10}>10 per halaman</option>
            <option value={20}>20 per halaman</option>
            <option value={50}>50 per halaman</option>
          </select>
          {showAnalytics && (
            <button onClick={() => setShowAnalytics(false)} className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white hover:bg-slate-700">
              Hide Analytics
            </button>
          )}
          {!showAnalytics && filters.dateFrom && filters.dateTo && (
            <button onClick={fetchAnalytics} disabled={analyticsLoading} className="px-3 py-2 bg-blue-600 border border-blue-500 rounded-lg text-sm text-white hover:bg-blue-500 disabled:opacity-50">
              {analyticsLoading ? "Loading..." : "📊 Analytics"}
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
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
            <label className="block text-xs font-medium text-slate-400 mb-1">Verifikasi</label>
            <select
              value={filters.verified}
              onChange={(e) => handleFilterChange("verified", e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
            >
              <option value="">Semua</option>
              <option value="true">Terverifikasi</option>
              <option value="false">Belum Verifikasi</option>
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

        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-800">
          {filters.action || filters.entity || filters.userId || filters.verified || filters.dateFrom || filters.dateTo ? (
            <button
              onClick={() => setFilters({ action: "", entity: "", userId: "", verified: "", dateFrom: "", dateTo: "" })}
              className="text-xs text-slate-400 hover:text-slate-300 flex items-center gap-1 transition-colors"
            >
              🔄 Reset Filter
            </button>
          ) : null}

          {filters.dateFrom && filters.dateTo && (
            <>
              <button onClick={handleVerify} disabled={verifying} className="px-3 py-1.5 bg-indigo-600 border border-indigo-500 rounded-lg text-sm text-white hover:bg-indigo-500 disabled:opacity-50">
                {verifying ? "Verifying..." : "🔍 Verify Chain"}
              </button>
              <button onClick={() => handleComplianceExport("json")} className="px-3 py-1.5 bg-purple-600 border border-purple-500 rounded-lg text-sm text-white hover:bg-purple-500">
                📋 Compliance Export (JSON)
              </button>
              <button onClick={() => handleComplianceExport("csv")} className="px-3 py-1.5 bg-purple-600 border border-purple-500 rounded-lg text-sm text-white hover:bg-purple-500">
                📋 Compliance Export (CSV)
              </button>
            </>
          )}

          {verificationResult && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${verificationResult.valid ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
              <span className="text-sm">{verificationResult.valid ? "✅ Chain Valid" : `❌ Chain Invalid (${verificationResult.errors.length} errors)`}</span>
              {verificationResult.errors.length > 0 && (
                <button onClick={() => console.log(verificationResult.errors)} className="text-xs text-slate-400 hover:text-slate-300">View Errors</button>
              )}
            </div>
          )}
        </div>
      </div>

      {renderAnalytics()}

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
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Status</th>
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
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${log.verified ? 'text-green-400 bg-green-500/10 border-green-500/20' : 'text-amber-400 bg-amber-500/10 border-amber-500/20'}`}>
                          {log.verified ? "✅ Verified" : "⏳ Pending"}
                        </span>
                      </td>
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
                  <td colSpan={8} className="px-4 py-4">
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
                        <p><span className="text-slate-400">Sequence: </span><span className="text-slate-300 font-mono">{log.sequenceNumber}</span></p>
                        <p><span className="text-slate-400">Verified: </span><span className={log.verified ? "text-green-400" : "text-amber-400"}>{log.verified ? "Yes" : "No"}</span></p>
                        <p><span className="text-slate-400">Classification: </span><span className="text-slate-300">{log.dataClassification || "internal"}</span></p>
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