"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRealtimeMonitoring } from "@/hooks/useSSE";
import { useAnomalyStream, useAnomalyToasts } from "@/hooks/useAnomalyStream";
import { AnomalyToastContainer, AnomalyCounterBadge } from "@/components/dashboard/AnomalyToasts";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
} from "recharts";
import { format, startOfHour, subHours, parseISO } from "date-fns";
import { useRouter } from "next/navigation";

interface AnomalyItem {
  id: string;
  deviceId: string;
  device: {
    id: string;
    name: string;
    ip: string;
    type: string;
    location: string | null;
  } | null;
  metricType: string;
  anomalyScore: number;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  timestamp: string;
  autoResolved: boolean;
  resolvedAt: string | null;
  confidence?: number;
  explanation?: { summary: string; topContributors: Array<{ featureName: string; contribution: number; severity: string }>; recommendation: string };
}

interface AnomaliesResponse {
  data: AnomalyItem[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface DashboardStats {
  total24h: number;
  critical24h: number;
  high24h: number;
  topDevices: { deviceId: string; name: string; count: number }[];
  bySeverity: Record<string, number>;
  byType: Record<string, number>;
}

const SEV_STYLES: Record<string, { label: string; cls: string; color: string }> = {
  CRITICAL: { label: "🔴 CRITICAL", cls: "bg-rose-500/20 text-rose-400 border-rose-500/30", color: "#f43f5e" },
  HIGH:     { label: "🟠 HIGH",     cls: "bg-orange-500/20 text-orange-400 border-orange-500/30", color: "#fb923c" },
  MEDIUM:   { label: "🟡 MEDIUM",   cls: "bg-amber-500/20 text-amber-400 border-amber-500/30", color: "#fbbf24" },
  LOW:      { label: "🟢 LOW",      cls: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", color: "#34d399" },
};

const SEV_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

function SevBadge({ severity }: { severity: string }) {
  const s = SEV_STYLES[severity] ?? SEV_STYLES.LOW;
  return <span className={`px-2 py-0.5 text-xs font-bold rounded border ${s.cls}`}>{s.label}</span>;
}

function StatCard({ title, value, icon, trend, color }: { title: string; value: string | number; icon: string; trend?: string; color: string }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-400 font-medium">{title}</p>
          <p className="text-2xl font-bold text-slate-100 mt-1">{value}</p>
          {trend && <p className="text-xs text-emerald-400 mt-1">{trend}</p>}
        </div>
        <div className={`p-3 rounded-xl bg-${color}-500/20 text-${color}-400`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

// Chart Components
function AnomalyTimelineChart({ data }: { data: AnomalyItem[] }) {
  // Group by hour for last 24h
  const hours = Array.from({ length: 24 }, (_, i) => {
    const hour = startOfHour(subHours(new Date(), 23 - i));
    return format(hour, "yyyy-MM-dd HH:00");
  });

  const severityCounts: Record<string, Record<string, number>> = {};
  hours.forEach((h) => {
    severityCounts[h] = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  });

  data.forEach((a) => {
    const hourKey = format(startOfHour(parseISO(a.timestamp)), "yyyy-MM-dd HH:00");
    if (severityCounts[hourKey]) {
      severityCounts[hourKey][a.severity]++;
    }
  });

  const chartData = hours.map((h) => ({
    hour: format(parseISO(h), "HH:mm"),
    ...severityCounts[h],
  }));

  const COLORS = {
    CRITICAL: "#f43f5e",
    HIGH: "#fb923c",
    MEDIUM: "#fbbf24",
    LOW: "#34d399",
  };

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-3">Anomaly Timeline (24h)</h3>
      <div className="h-64">
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            {SEV_ORDER.map((sev) => (
              <linearGradient id={`color${sev}`} x1="0" y1="0" x2="0" y2="1" key={sev}>
                <stop offset="5%" stopColor={COLORS[sev as keyof typeof COLORS]} stopOpacity={0.3} />
                <stop offset="95%" stopColor={COLORS[sev as keyof typeof COLORS]} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
          <XAxis dataKey="hour" stroke="#64748b" fontSize={10} tickLine={false} axisLine={{ stroke: "#334155" }} />
          <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
            labelStyle={{ color: "#e2e8f0" }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(value: any) => (value ?? 0) as number}
          />
          <Legend />
          {SEV_ORDER.map((sev) => (
            <Area
              key={sev}
              type="monotone"
              dataKey={sev}
              stroke={COLORS[sev as keyof typeof COLORS]}
              fillOpacity={1}
              fill={`url(#color${sev})`}
              name={sev}
            />
          ))}
        </AreaChart>
      </div>
    </div>
  );
}

function SeverityPieChart({ data }: { data: AnomalyItem[] }) {
  const counts = useMemo(() => {
    const c: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    data.forEach((a) => c[a.severity]++);
    return c;
  }, [data]);

  const chartData = Object.entries(counts)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value }));

  const COLORS = { CRITICAL: "#f43f5e", HIGH: "#fb923c", MEDIUM: "#fbbf24", LOW: "#34d399" };

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-3">By Severity</h3>
      <div className="h-64 flex items-center justify-center">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={80}
            paddingAngle={2}
            dataKey="value"
            nameKey="name"
            label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
            labelLine={false}
          >
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[entry.name as keyof typeof COLORS]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(value: any) => (value ?? 0) as number}
          />
        </PieChart>
      </div>
    </div>
  );
}

function DeviceTypeBarChart({ data }: { data: AnomalyItem[] }) {
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    data.forEach((a) => {
      const type = a.device?.type || "UNKNOWN";
      c[type] = (c[type] || 0) + 1;
    });
    return c;
  }, [data]);

  const chartData = Object.entries(counts).map(([name, value]) => ({ name, value }));

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-3">By Device Type</h3>
      <div className="h-64">
        <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
          <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} axisLine={{ stroke: "#334155" }} />
          <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(value: any) => (value ?? 0) as number}
          />
          <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} />
        </BarChart>
      </div>
    </div>
  );
}

function HeatmapChart({ data }: { data: AnomalyItem[] }) {
  // Device x Hour heatmap
  const devices = useMemo(() => {
    const d: Record<string, { name: string; ip: string; hours: Record<number, number> }> = {};
    data.forEach((a) => {
      if (!a.device) return;
      if (!d[a.deviceId]) d[a.deviceId] = { name: a.device.name, ip: a.device.ip, hours: {} };
      const hour = parseISO(a.timestamp).getHours();
      d[a.deviceId].hours[hour] = (d[a.deviceId].hours[hour] || 0) + 1;
    });
    return Object.entries(d)
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => Object.values(b.hours).reduce((s, v) => s + v, 0) - Object.values(a.hours).reduce((s, v) => s + v, 0))
      .slice(0, 15);
  }, [data]);

  if (devices.length === 0) {
    return (
      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">Anomaly Heatmap (Device × Hour)</h3>
        <p className="text-slate-400 text-center py-8">No data available</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-3">Anomaly Heatmap (Top 15 Devices × Hour)</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono">
          <thead>
            <tr>
              <th className="px-2 py-1 text-slate-400">Device</th>
              {Array.from({ length: 24 }, (_, h) => (
                <th key={h} className="px-1 py-1 text-center text-slate-500">{h}:00</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {devices.map((d) => (
              <tr key={d.id} className="hover:bg-slate-700/30">
                <td className="px-2 py-1 text-slate-300 truncate max-w-[120px]">{d.name} <span className="text-slate-500">({d.ip})</span></td>
                {Array.from({ length: 24 }, (_, h) => {
                  const count = d.hours[h] || 0;
                  const intensity = Math.min(1, count / 5);
                  return (
                    <td key={h} className="px-1 py-1 text-center" style={{ backgroundColor: `rgba(244, 63, 94, ${intensity * 0.6})` }}>
                      {count > 0 ? count : "·"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AnomaliesPage() {
  const router = useRouter();
  const [anomalies, setAnomalies] = useState<AnomalyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deviceFilter, setDeviceFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [page, setPage] = useState(1);
  const [limit] = useState(50);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [devices, setDevices] = useState<{ id: string; name: string }[]>([]);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "charts">("table");

  const fetchAnomalies = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
      });
      if (deviceFilter) params.set("deviceId", deviceFilter);
      if (severityFilter) params.set("severity", severityFilter);

      const res = await fetch(`/api/anomalies?${params}`);
      if (res.ok) {
        const json: AnomaliesResponse = await res.json();
        setAnomalies(json.data ?? []);
        const pg = json.pagination;
        if (pg) {
          setTotal(pg.total);
          setTotalPages(pg.totalPages);
        }
      }
    } catch (err) {
      console.error("Failed to fetch anomalies:", err);
    } finally {
      setLoading(false);
    }
  }, [page, limit, deviceFilter, severityFilter]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/anomalies?limit=1000");
      if (res.ok) {
        const json: AnomaliesResponse = await res.json();
        const data = json.data ?? [];
        const now = Date.now();
        const dayAgo = now - 24 * 60 * 60 * 1000;
        const recent = data.filter((a) => new Date(a.timestamp).getTime() > dayAgo);

        const bySeverity: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
        const byType: Record<string, number> = {};
        const deviceCounts: Record<string, { name: string; count: number }> = {};

        recent.forEach((a) => {
          bySeverity[a.severity]++;
          const type = a.device?.type || "UNKNOWN";
          byType[type] = (byType[type] || 0) + 1;
          if (a.device) {
            deviceCounts[a.deviceId] = deviceCounts[a.deviceId] || { name: a.device.name, count: 0 };
            deviceCounts[a.deviceId].count++;
          }
        });

        const topDevices = Object.entries(deviceCounts)
          .map(([deviceId, v]) => ({ deviceId, ...v }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 5);

        setStats({
          total24h: recent.length,
          critical24h: bySeverity.CRITICAL,
          high24h: bySeverity.HIGH,
          topDevices,
          bySeverity,
          byType,
        });
      }
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    }
  }, []);

  const fetchDevices = useCallback(async () => {
    try {
      const res = await fetch("/api/devices");
      if (res.ok) {
        const data = await res.json();
        setDevices(data.data ?? []);
      }
    } catch {
      // Silent fail
    }
  }, []);

  // Real-time anomaly streaming
  const { toasts, unreadCount, handleNewAnomalies, markRead, dismiss } = useAnomalyToasts();
  useAnomalyStream({
    onNewAnomalies: handleNewAnomalies,
    enabled: true,
    filterSeverity: ["HIGH", "CRITICAL"],
  });

  useRealtimeMonitoring(() => {
    void fetchAnomalies();
    void fetchStats();
  }, true);

  useEffect(() => {
    void fetchDevices();
  }, [fetchDevices]);

  useEffect(() => {
    void fetchAnomalies();
    void fetchStats();
    const interval = setInterval(() => { void fetchAnomalies(); void fetchStats(); }, 30000);
    return () => clearInterval(interval);
  }, [page, limit, deviceFilter, severityFilter, fetchAnomalies, fetchStats]);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this anomaly record?")) return;
    try {
      const res = await fetch(`/api/anomalies?id=${id}`, { method: "DELETE" });
      if (res.ok) {
        setToast({ ok: true, msg: "Anomaly deleted" });
        void fetchAnomalies();
      } else {
        const data = await res.json().catch(() => null);
        setToast({ ok: false, msg: data?.error || "Failed to delete" });
      }
    } catch {
      setToast({ ok: false, msg: "Network error" });
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">🔍 Anomalies</h1>
        <p className="text-slate-400">Loading...</p>
      </div>
    );
  }

  const criticalCount = anomalies.filter((a) => a.severity === "CRITICAL").length;
  const highCount = anomalies.filter((a) => a.severity === "HIGH").length;

  return (
    <div className="p-6 space-y-6">
      {/* Header & Stats */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">🔍 Anomalies</h1>
            <p className="text-sm text-slate-400 mt-1">
              ML-powered anomaly detection with Ensemble (Isolation Forest + LOF + Statistical + DBSCAN)
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1 bg-slate-800/50 border border-slate-700 rounded-lg">
              <span className="text-xs text-slate-400">Live Alerts</span>
              <AnomalyCounterBadge count={unreadCount} />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setViewMode("table")}
                className={`px-3 py-1 rounded text-sm ${viewMode === "table" ? "bg-blue-500/20 text-blue-400" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}
              >
                Table
              </button>
              <button
                onClick={() => setViewMode("charts")}
                className={`px-3 py-1 rounded text-sm ${viewMode === "charts" ? "bg-blue-500/20 text-blue-400" : "bg-slate-700 text-slate-300 hover:bg-slate-600"}`}
              >
                Charts
              </button>
            </div>
          </div>
        </div>

        {/* Real-time Anomaly Toasts */}
        <AnomalyToastContainer
          toasts={toasts}
          onDismiss={dismiss}
          onClick={(anomaly) => router.push(`/dashboard/anomalies/${anomaly.id}`)}
        />

        {toast && (
          <div
            className={`p-3 rounded border mb-4 ${
              toast.ok
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                : "bg-rose-500/10 border-rose-500/30 text-rose-400"
            }`}
          >
            {toast.msg}
            <button onClick={() => setToast(null)} className="ml-4 underline">Dismiss</button>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard title="Total (24h)" value={stats?.total24h ?? anomalies.length} icon="📊" color="blue" />
          <StatCard title="Critical (24h)" value={stats?.critical24h ?? criticalCount} icon="🔴" color="rose" />
          <StatCard title="High (24h)" value={stats?.high24h ?? highCount} icon="🟠" color="orange" />
          <StatCard title="Devices Affected" value={stats?.topDevices.length ?? 0} icon="🖥️" color="purple" />
        </div>
      </div>

      {/* Filters */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Device</label>
            <select
              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm"
              value={deviceFilter}
              onChange={(e) => { setDeviceFilter(e.target.value); setPage(1); }}
            >
              <option value="">All Devices</option>
              {devices.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Severity</label>
            <select
              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm"
              value={severityFilter}
              onChange={(e) => { setSeverityFilter(e.target.value); setPage(1); }}
            >
              <option value="">All Severities</option>
              <option value="CRITICAL">CRITICAL</option>
              <option value="HIGH">HIGH</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="LOW">LOW</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => { setDeviceFilter(""); setSeverityFilter(""); setPage(1); }}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm"
            >
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {viewMode === "charts" ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <AnomalyTimelineChart data={anomalies} />
            <SeverityPieChart data={anomalies} />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <DeviceTypeBarChart data={anomalies} />
            <HeatmapChart data={anomalies} />
          </div>
        </div>
      ) : (
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-900/50 border-b border-slate-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">Timestamp</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">Device</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">Metric</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">Score</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">Confidence</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">Severity</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {anomalies.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                      No anomalies detected. System learning in progress...
                    </td>
                  </tr>
                ) : (
                  anomalies.map((a) => (
                    <tr key={a.id} className="hover:bg-slate-700/30 cursor-pointer" onClick={() => window.location.href = `/dashboard/anomalies/${a.id}`}>
                      <td className="px-4 py-3 text-slate-300">{new Date(a.timestamp).toLocaleString()}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-200">{a.device?.name || "N/A"}</div>
                        <div className="text-xs text-slate-400">{a.device?.ip || ""}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 bg-slate-700 text-slate-300 rounded text-xs font-mono">{a.metricType}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-300">{a.anomalyScore.toFixed(3)}</td>
                      <td className="px-4 py-3 font-mono text-slate-300">{(a.confidence ?? 0).toFixed(0)}%</td>
                      <td className="px-4 py-3"><SevBadge severity={a.severity} /></td>
                      <td className="px-4 py-3">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(a.id); }}
                          className="text-xs text-rose-400 hover:text-rose-300 underline"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-slate-700 flex items-center justify-between">
              <div className="text-xs text-slate-400">Page {page} of {totalPages} ({total} total)</div>
              <div className="flex gap-2">
                <button disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="px-3 py-1 bg-slate-700 rounded text-xs disabled:opacity-50">Previous</button>
                <button disabled={page === totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="px-3 py-1 bg-slate-700 rounded text-xs disabled:opacity-50">Next</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-2">ℹ️ About Anomaly Detection</h3>
        <p className="text-xs text-slate-400 leading-relaxed">
          This system uses an <strong>Ensemble of 4 algorithms</strong>: Isolation Forest (35%), LOF (25%), Statistical Z-score/IQR/MAD (25%), DBSCAN (15%).
          Models train on <strong>7 days</strong> / <strong>33 features</strong> and assign anomaly score (0-1).
          Explainability shows top contributing features. Feedback loop enables continuous improvement.
        </p>
      </div>
    </div>
  );
}