"use client";

import { useEffect, useState, useCallback } from "react";
import { useRealtimeMonitoring } from "@/hooks/useSSE";

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

const SEV_STYLES: Record<string, { label: string; cls: string }> = {
  CRITICAL: { label: "🔴 CRITICAL", cls: "bg-rose-500/20 text-rose-400 border-rose-500/30" },
  HIGH:     { label: "🟠 HIGH",     cls: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  MEDIUM:   { label: "🟡 MEDIUM",   cls: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  LOW:      { label: "🟢 LOW",      cls: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
};

function SevBadge({ severity }: { severity: string }) {
  const s = SEV_STYLES[severity] ?? SEV_STYLES.LOW;
  return <span className={`px-2 py-0.5 text-xs font-bold rounded border ${s.cls}`}>{s.label}</span>;
}

export default function AnomaliesPage() {
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

  useRealtimeMonitoring(() => {
    // Optional: trigger refresh on realtime update
  }, true);

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

  useEffect(() => {
    const loadDevices = async () => {
      await fetchDevices();
    };
    void loadDevices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const loadAnomalies = async () => {
      await fetchAnomalies();
    };
    void loadAnomalies();
    const interval = setInterval(() => void loadAnomalies(), 30000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, limit, deviceFilter, severityFilter]);

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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">🔍 Anomalies</h1>
          <p className="text-sm text-slate-400 mt-1">
            ML-powered anomaly detection from historical metrics (Isolation Forest)
          </p>
        </div>
      </div>

      {toast && (
        <div
          className={`p-3 rounded border ${
            toast.ok
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
              : "bg-rose-500/10 border-rose-500/30 text-rose-400"
          }`}
        >
          {toast.msg}
          <button onClick={() => setToast(null)} className="ml-4 underline">
            Dismiss
          </button>
        </div>
      )}

      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Device</label>
            <select
              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm"
              value={deviceFilter}
              onChange={(e) => {
                setDeviceFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All Devices</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Severity</label>
            <select
              className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm"
              value={severityFilter}
              onChange={(e) => {
                setSeverityFilter(e.target.value);
                setPage(1);
              }}
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
              onClick={() => {
                setDeviceFilter("");
                setSeverityFilter("");
                setPage(1);
              }}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm"
            >
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      <div className="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/50 border-b border-slate-700">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">Timestamp</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">Device</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">Metric</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">Score</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">Severity</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {anomalies.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    No anomalies detected. System learning in progress...
                  </td>
                </tr>
              ) : (
                anomalies.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-700/30">
                    <td className="px-4 py-3 text-slate-300">
                      {new Date(a.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-200">{a.device?.name || "N/A"}</div>
                      <div className="text-xs text-slate-400">{a.device?.ip || ""}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-slate-700 text-slate-300 rounded text-xs font-mono">
                        {a.metricType}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-300">{a.anomalyScore.toFixed(3)}</td>
                    <td className="px-4 py-3">
                      <SevBadge severity={a.severity} />
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleDelete(a.id)}
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
            <div className="text-xs text-slate-400">
              Page {page} of {totalPages} ({total} total)
            </div>
            <div className="flex gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1 bg-slate-700 rounded text-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <button
                disabled={page === totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1 bg-slate-700 rounded text-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-2">ℹ️ About Anomaly Detection</h3>
        <p className="text-xs text-slate-400 leading-relaxed">
          This system uses <strong>Isolation Forest</strong>, an unsupervised ML algorithm, to detect anomalies in device metrics.
          The model trains on the last <strong>7 days</strong> of historical data and assigns an anomaly score (0-1) to new metrics.
          Scores above 0.7 trigger HIGH alerts, and above 0.85 trigger CRITICAL alerts with notifications.
        </p>
      </div>
    </div>
  );
}
