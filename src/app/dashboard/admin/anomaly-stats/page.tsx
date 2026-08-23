"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";
import { format, parseISO } from "date-fns";

interface AdminStatsData {
  summary: {
    totalAnomalies: number;
    anomaliesBySeverity: Record<string, number>;
    anomaliesByType: Record<string, number>;
    topDevices: Array<{
      deviceId: string;
      name: string;
      ip: string;
      type: string;
      count: number;
    }>;
    falsePositiveRate: number;
    truePositiveRate: number;
  };
  models: {
    totalActive: number;
    byType: Record<string, number>;
    recent: Array<{
      id: string;
      deviceId: string;
      deviceType: string | null;
      version: number;
      trainedAt: string;
      trainingSize: number;
      performance: any;
      hyperParams: any;
    }>;
  };
  feedback: {
    total: number;
    byType: Record<string, number>;
  };
  correlations: {
    totalPatterns: number;
  };
  risk: {
    totalPredictions: number;
    byLevel: Record<string, number>;
  };
  timeSeries: {
    hourly: Array<{ hour: string; count: number }>;
  };
  workers: {
    anomalyDetector: string;
    advancedMlWorker: string;
  };
  period: { sinceHours: number; since: string };
}

const SEV_COLORS = {
  CRITICAL: "#f43f5e",
  HIGH: "#fb923c",
  MEDIUM: "#fbbf24",
  LOW: "#34d399",
};

const SEV_LABELS = {
  CRITICAL: "🔴 CRITICAL",
  HIGH: "🟠 HIGH",
  MEDIUM: "🟡 MEDIUM",
  LOW: "🟢 LOW",
};

function SevBadge({ severity, count }: { severity: string; count: number }) {
  return (
    <div className="flex items-center gap-2 p-2 bg-slate-800/50 rounded border border-slate-700">
      <span className="text-xs font-bold">{SEV_LABELS[severity as keyof typeof SEV_LABELS] || severity}</span>
      <span className="font-mono text-lg">{count}</span>
    </div>
  );
}

function StatCard({ title, value, subtitle, color }: { title: string; value: string | number; subtitle?: string; color: string }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
      <p className="text-xs text-slate-400 font-medium">{title}</p>
      <p className="text-2xl font-bold text-slate-100 mt-1">{value}</p>
      {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
      <div className={`w-2 h-2 rounded-full mt-2 bg-${color}-500`} />
    </div>
  );
}

export default function AnomalyAdminStatsPage() {
  const [data, setData] = useState<AdminStatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sinceHours, setSinceHours] = useState(24);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/anomaly-stats?sinceHours=${sinceHours}`);
        if (!res.ok) throw new Error("Failed to fetch");
        const json = await res.json();
        setData(json.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [sinceHours]);

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">📊 Anomaly Admin Stats</h1>
        <p className="text-slate-400">Loading...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">📊 Anomaly Admin Stats</h1>
        <p className="text-rose-400">{error || "No data"}</p>
      </div>
    );
  }

  const d = data;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">📊 Anomaly Admin Statistics</h1>
          <p className="text-sm text-slate-400 mt-1">
            Monitoring ML anomaly detection system health & performance
          </p>
        </div>
        <div className="flex items-center gap-4">
          <select
            value={sinceHours}
            onChange={(e) => setSinceHours(Number(e.target.value))}
            className="px-3 py-1 bg-slate-800 border border-slate-700 rounded text-sm"
          >
            <option value={1}>Last 1 Hour</option>
            <option value={6}>Last 6 Hours</option>
            <option value={24}>Last 24 Hours</option>
            <option value={168}>Last 7 Days</option>
          </select>
          <div className="flex items-center gap-4 text-sm">
            <span className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${d.workers.anomalyDetector === 'RUNNING' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              Anomaly Worker: {d.workers.anomalyDetector}
            </span>
            <span className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${d.workers.advancedMlWorker === 'RUNNING' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              Advanced ML: {d.workers.advancedMlWorker}
            </span>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard title="Total Anomalies" value={d.summary.totalAnomalies} color="blue" subtitle={`${d.period.sinceHours}h window`} />
        <StatCard title="False Positive Rate" value={`${d.summary.falsePositiveRate}%`} color="rose" subtitle={`${d.feedback.total} feedback`} />
        <StatCard title="True Positive Rate" value={`${d.summary.truePositiveRate}%`} color="emerald" />
        <StatCard title="Active Models" value={d.models.totalActive} color="purple" subtitle={Object.values(d.models.byType).join(', ')} />
        <StatCard title="Risk Predictions" value={d.risk.totalPredictions} color="orange" subtitle={Object.entries(d.risk.byLevel).map(([k,v])=>`${k}:${v}`).join(', ')} />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Anomaly Timeline */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3">Anomaly Timeline (Hourly)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={d.timeSeries.hourly} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                <XAxis dataKey="hour" stroke="#64748b" fontSize={10} tickLine={false} axisLine={{ stroke: "#334155" }} tickFormatter={(v) => format(parseISO(v), "MM/dd HH:mm")} />
                <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
<Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }} // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(v: any) => v ?? 0} />
                <Line type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Severity Distribution */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3">By Severity</h3>
          <div className="h-64 flex items-center justify-center">
            <PieChart>
              <Pie
                data={Object.entries(d.summary.anomaliesBySeverity).map(([name, value]) => ({ name, value })).filter(d => d.value > 0)}
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
                {Object.entries(d.summary.anomaliesBySeverity).map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={SEV_COLORS[entry[0] as keyof typeof SEV_COLORS] || "#6366f1"} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }} // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(v: any) => v ?? 0} />
            </PieChart>
          </div>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Metric Type Distribution */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3">By Metric Type</h3>
          <div className="h-64">
            <BarChart data={Object.entries(d.summary.anomaliesByType).map(([name, value]) => ({ name, value }))} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
              <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} axisLine={{ stroke: "#334155" }} />
              <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }} // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(v: any) => v ?? 0} />
              <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </div>
        </div>

        {/* Feedback Distribution */}
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3">Feedback Distribution</h3>
          <div className="h-64 flex items-center justify-center">
            <PieChart>
              <Pie
                data={Object.entries(d.feedback.byType).map(([name, value]) => ({ name, value })).filter(d => d.value > 0)}
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
                {Object.entries(d.feedback.byType).map((entry, index) => {
                  const colors: Record<string, string> = {
                    TRUE_POSITIVE: "#34d399",
                    FALSE_POSITIVE: "#f43f5e",
                    EXPECTED_BEHAVIOR: "#fb923c",
                    UNKNOWN: "#64748b",
                  };
                  return <Cell key={`cell-${index}`} fill={colors[entry[0]] || "#6366f1"} />;
                })}
              </Pie>
              <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }} // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(v: any) => v ?? 0} />
            </PieChart>
          </div>
        </div>
      </div>

      {/* Top Devices */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">Top Affected Devices</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-700">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400">Device</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400">IP</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400">Type</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400">Anomalies</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {d.summary.topDevices.map((dev, i) => (
                <tr key={i} className="hover:bg-slate-700/30">
                  <td className="px-3 py-2 text-slate-300 font-medium">{dev.name}</td>
                  <td className="px-3 py-2 text-slate-400 font-mono">{dev.ip}</td>
                  <td className="px-3 py-2 text-slate-400">{dev.type}</td>
                  <td className="px-3 py-2 font-mono text-slate-300">{dev.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Models Table */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">Active Models ({d.models.totalActive})</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-700">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400">Device ID</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400">Type</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400">Version</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400">Training Size</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400">Trained At</th>
                <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400">Performance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {d.models.recent.map((m, i) => (
                <tr key={i} className="hover:bg-slate-700/30">
                  <td className="px-3 py-2 text-slate-300 font-mono truncate max-w-[150px]">{m.deviceId}</td>
                  <td className="px-3 py-2 text-slate-400">{m.deviceType || 'N/A'}</td>
                  <td className="px-3 py-2 text-slate-300 font-mono">v{m.version}</td>
                  <td className="px-3 py-2 text-slate-300 font-mono">{m.trainingSize}</td>
                  <td className="px-3 py-2 text-slate-400">{format(new Date(m.trainedAt), "MM/dd HH:mm")}</td>
                  <td className="px-3 py-2 text-slate-400">
                    {m.performance ? (
                      <>
                        Acc: {(m.performance.accuracy * 100).toFixed(1)}% | 
                        F1: {(m.performance.f1 * 100).toFixed(1)}%
                      </>
                    ) : (
                      'N/A'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Summary Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-2">Anomalies by Severity</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(d.summary.anomaliesBySeverity).map(([sev, count]) => (
              <SevBadge key={sev} severity={sev} count={count} />
            ))}
          </div>
        </div>

        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-2">Feedback Summary</h3>
          <dl className="space-y-1 text-sm">
            {Object.entries(d.feedback.byType).map(([type, count]) => (
              <div key={type} className="flex justify-between">
                <dt className="text-slate-400">{type.replace('_', ' ')}</dt>
                <dd className="text-slate-200 font-mono">{count}</dd>
              </div>
            ))}
            <div className="border-t border-slate-700 pt-1 flex justify-between">
              <dt className="text-slate-400">Total</dt>
              <dd className="text-slate-200 font-mono">{d.feedback.total}</dd>
            </div>
          </dl>
        </div>

        <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-2">Correlation & Risk</h3>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-slate-400">Patterns Discovered</dt><dd className="text-slate-200 font-mono">{d.correlations.totalPatterns}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-400">Risk Predictions</dt><dd className="text-slate-200 font-mono">{d.risk.totalPredictions}</dd></div>
            {Object.entries(d.risk.byLevel).map(([level, count]) => (
              <div key={level} className="flex justify-between">
                <dt className="text-slate-400">{level}</dt>
                <dd className="text-slate-200 font-mono">{count}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}