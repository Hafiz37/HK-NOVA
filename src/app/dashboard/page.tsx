"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import TopListCard, { type TopItem } from "@/components/dashboard/top-list-card";
import DeviceDrawer from "@/components/dashboard/device-drawer";
import { Server, Bell, Zap, Activity, BarChart3, Database, Bot, RefreshCw, Settings, Users, FileText, Search, HardDrive, AlertTriangle, TrendingUp } from "lucide-react";

interface WorkerHealth {
  expectedCycles: number;
  actualCycles: number;
  missedCycles: number;
  avgCycleDurationMs: number | null;
  lastCycleDurationMs: number | null;
  lagSeconds: number | null;
  healthScore?: number;
  queueDepth?: number;
  queueBackend?: string;
}

interface WorkerStatus {
  id: string;
  name: string;
  type: string;
  status: "RUNNING" | "STOPPED";
  lastHeartbeat: string | null;
  detail: string;
  health: WorkerHealth | null;
}

interface SummaryData {
  totalDevices: number;
  upCount: number;
  downCount: number;
  unknownCount: number;
  activeAlerts: number;
  criticalAlerts: number;
  highAlerts: number;
  avgLatencyMs: number | null;
  lastUpdated: string;
}

interface TopData {
  topAlerts: TopItem[];
  topLatency: TopItem[];
  topCpu: TopItem[];
  topMem: TopItem[];
}

const WORKER_ICONS: Record<string, React.ReactNode> = {
  "icmp-worker": <Activity className="w-4 h-4" />,
  "snmp-worker": <BarChart3 className="w-4 h-4" />,
  "backup-worker": <Database className="w-4 h-4" />,
  "anomaly-detector": <Bot className="w-4 h-4" />,
};

export default function DashboardPage() {
  const { isAdmin } = useAuth();

  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [workers, setWorkers] = useState<WorkerStatus[]>([]);
  const [top, setTop] = useState<TopData | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [loadingWorkers, setLoadingWorkers] = useState(true);
  const [loadingTop, setLoadingTop] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  const fetchSummary = async () => {
    try {
      const res = await fetch("/api/monitoring/summary");
      if (!res.ok) return;
      const d = await res.json();
      setSummary({
        totalDevices: d.devices?.total ?? 0,
        upCount: d.devices?.up ?? 0,
        downCount: d.devices?.down ?? 0,
        unknownCount: d.devices?.unknown ?? 0,
        activeAlerts: d.alerts?.active ?? 0,
        criticalAlerts: d.alerts?.bySeverity?.CRITICAL ?? 0,
        highAlerts: d.alerts?.bySeverity?.HIGH ?? 0,
        avgLatencyMs: d.avgLatencyMs ?? null,
        lastUpdated: d.updatedAt ?? new Date().toISOString(),
      });
    } catch (err) {
      console.error("Failed to fetch summary:", err);
    } finally {
      setLoadingSummary(false);
    }
  };

  const fetchWorkers = async () => {
    try {
      const res = await fetch("/api/workers/status");
      if (!res.ok) return;
      const d = await res.json();
      setWorkers(d.workers ?? []);
    } catch (err) {
      console.error("Failed to fetch workers:", err);
    } finally {
      setLoadingWorkers(false);
    }
  };

  const fetchTop = async () => {
    try {
      const res = await fetch("/api/monitoring/top?n=5");
      if (!res.ok) return;
      const d = await res.json();
      setTop({
        topAlerts: d.topAlerts ?? [],
        topLatency: d.topLatency ?? [],
        topCpu: d.topCpu ?? [],
        topMem: d.topMem ?? [],
      });
    } catch (err) {
      console.error("Failed to fetch top-N:", err);
    } finally {
      setLoadingTop(false);
    }
  };

  const fetchAll = async () => {
    await Promise.all([fetchSummary(), fetchWorkers(), fetchTop()]);
    setLastRefresh(new Date());
  };

  useEffect(() => {
    const run = async () => { await fetchAll(); };
    void run();
    const interval = setInterval(() => { void run(); }, 10_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const upPct =
    summary && summary.totalDevices > 0
      ? Math.round((summary.upCount / summary.totalDevices) * 100)
      : 0;

  return (
    <>
      <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">
            Selamat Datang di HK-NOVA
          </h2>
          <p className="text-slate-400 mt-1 text-sm">
            Platform Network Operations Center &amp; Automated Device Monitoring
          </p>
        </div>
        {lastRefresh && (
          <p className="text-xs text-slate-500 shrink-0">
            Refresh:{" "}
            <span className="text-slate-400">
              {lastRefresh.toLocaleTimeString("id-ID")}
            </span>{" "}
            <span className="text-slate-600">(auto 10s)</span>
          </p>
        )}
      </div>

      {/* ── Stats Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Devices */}
        <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-6 shadow-sm hover:border-slate-700 transition-colors">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Total Devices
              </p>
              {loadingSummary ? (
                <div className="h-8 w-14 bg-slate-800 animate-pulse rounded mt-2" />
              ) : (
                <p className="text-3xl font-bold text-white mt-1">
                  {summary?.totalDevices ?? 0}
                </p>
              )}
            </div>
            <div className="w-11 h-11 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center justify-center shrink-0">
              <Server className="w-5 h-5 text-blue-400" />
            </div>
          </div>
          <div className="mt-4 space-y-1">
            {loadingSummary ? (
              <div className="h-3.5 w-28 bg-slate-800 animate-pulse rounded" />
            ) : (
              <>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-emerald-400 font-medium">
                    {summary?.upCount ?? 0} UP
                  </span>
                  <span className="text-slate-500">{upPct}%</span>
                </div>
                {/* progress bar */}
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all"
                    style={{ width: `${upPct}%` }}
                  />
                </div>
                <div className="flex gap-3 text-xs mt-1">
                  <span className="text-rose-400">
                    {summary?.downCount ?? 0} Down
                  </span>
                  <span className="text-slate-500">
                    {summary?.unknownCount ?? 0} Unknown
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Active Alerts */}
        <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-6 shadow-sm hover:border-slate-700 transition-colors">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Active Alerts
              </p>
              {loadingSummary ? (
                <div className="h-8 w-14 bg-slate-800 animate-pulse rounded mt-2" />
              ) : (
                <p
                  className={`text-3xl font-bold mt-1 ${
                    (summary?.activeAlerts ?? 0) > 0
                      ? "text-rose-400"
                      : "text-white"
                  }`}
                >
                  {summary?.activeAlerts ?? 0}
                </p>
              )}
            </div>
            <div className="w-11 h-11 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center justify-center shrink-0">
              <Bell className="w-5 h-5 text-rose-400" />
            </div>
          </div>
          <div className="mt-4 text-xs">
            {loadingSummary ? (
              <div className="h-3.5 w-32 bg-slate-800 animate-pulse rounded" />
            ) : (summary?.activeAlerts ?? 0) > 0 ? (
              <div className="space-y-0.5">
                {(summary?.criticalAlerts ?? 0) > 0 && (
                  <p className="text-rose-400 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                    {summary?.criticalAlerts} Critical
                  </p>
                )}
                {(summary?.highAlerts ?? 0) > 0 && (
                  <p className="text-orange-400 flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-orange-400"></span>
                    {summary?.highAlerts} High
                  </p>
                )}
                <Link
                  href="/dashboard/alerts"
                  className="text-blue-400 hover:text-blue-300 underline"
                >
                  Lihat semua →
                </Link>
              </div>
            ) : (
              <span className="text-emerald-400 font-medium">
                ✓ Semua sistem normal
              </span>
            )}
          </div>
        </div>

        {/* Avg Latency */}
        <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-6 shadow-sm hover:border-slate-700 transition-colors">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Avg Latency
              </p>
              {loadingSummary ? (
                <div className="h-8 w-20 bg-slate-800 animate-pulse rounded mt-2" />
              ) : (
                <p className="text-3xl font-bold text-white mt-1">
                  {summary?.avgLatencyMs != null
                    ? `${Math.round(summary.avgLatencyMs)}`
                    : "—"}
                  {summary?.avgLatencyMs != null && (
                    <span className="text-base font-normal text-slate-400 ml-1">
                      ms
                    </span>
                  )}
                </p>
              )}
            </div>
            <div className="w-11 h-11 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5 text-amber-400" />
            </div>
          </div>
          <div className="mt-4 text-xs text-slate-500">
            {loadingSummary ? (
              <div className="h-3.5 w-32 bg-slate-800 animate-pulse rounded" />
            ) : summary?.avgLatencyMs != null ? (
              <span
                className={
                  summary.avgLatencyMs < 50
                    ? "text-emerald-400"
                    : summary.avgLatencyMs < 150
                    ? "text-amber-400"
                    : "text-rose-400"
                }
              >
                {summary.avgLatencyMs < 50
                  ? "Excellent (< 50ms)"
                  : summary.avgLatencyMs < 150
                  ? "Good (< 150ms)"
                  : "Poor (≥ 150ms)"}
              </span>
            ) : (
              "Belum ada data ICMP"
            )}
          </div>
        </div>

        {/* ICMP Worker heartbeat */}
        <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-6 shadow-sm hover:border-slate-700 transition-colors">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                ICMP Worker
              </p>
              {loadingWorkers ? (
                <div className="h-8 w-20 bg-slate-800 animate-pulse rounded mt-2" />
              ) : (
                <p
                  className={`text-lg font-bold mt-2 ${
                    workers.find((w) => w.id === "icmp-worker")?.status ===
                    "RUNNING"
                      ? "text-emerald-400"
                      : "text-slate-400"
                  }`}
                >
                  {workers.find((w) => w.id === "icmp-worker")?.status ===
                  "RUNNING"
                    ? "● Running"
                    : "○ Stopped"}
                </p>
              )}
            </div>
            <div className="w-11 h-11 bg-purple-500/10 border border-purple-500/20 rounded-xl flex items-center justify-center shrink-0">
              <Activity className="w-5 h-5 text-purple-400" />
            </div>
          </div>
          <div className="mt-4 text-xs text-slate-500">
            {loadingWorkers ? (
              <div className="h-3.5 w-32 bg-slate-800 animate-pulse rounded" />
            ) : (() => {
              const w = workers.find((w) => w.id === "icmp-worker");
              return w?.lastHeartbeat ? (
                <span>
                  Heartbeat:{" "}
                  {new Date(w.lastHeartbeat).toLocaleTimeString("id-ID")}
                </span>
              ) : (
                <span>Jalankan: pnpm worker:icmp</span>
              );
            })()}
          </div>
        </div>
      </div>

      {/* ── Top-N Widgets ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Top-N (5 besar)
          </h3>
          <span className="text-[11px] text-slate-600">berdasarkan data terbaru</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TopListCard
            title="Alert Terbanyak"
            icon="🔔"
            accent="rose"
            items={top?.topAlerts ?? []}
            loading={loadingTop}
            formatValue={(v) => `${v} alert`}
            onSelectDevice={setSelectedDeviceId}
          />
          <TopListCard
            title="Latency Tertinggi"
            icon="⚡"
            accent="blue"
            unit="ms"
            items={top?.topLatency ?? []}
            loading={loadingTop}
            formatValue={(v) => `${Math.round(v)} ms`}
            onSelectDevice={setSelectedDeviceId}
          />
          <TopListCard
            title="CPU Utilization"
            icon="🧠"
            accent="orange"
            unit="%"
            items={top?.topCpu ?? []}
            loading={loadingTop}
            formatValue={(v) => `${v.toFixed(1)}%`}
            onSelectDevice={setSelectedDeviceId}
          />
          <TopListCard
            title="Memory Utilization"
            icon="💾"
            accent="cyan"
            unit="%"
            items={top?.topMem ?? []}
            loading={loadingTop}
            formatValue={(v) => `${v.toFixed(1)}%`}
            onSelectDevice={setSelectedDeviceId}
          />
        </div>
      </div>

      {/* ── Quick Actions ── */}
      <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-6">
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
          <Zap className="w-4 h-4" />
          Quick Actions
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Link
            href="/dashboard/devices"
            className="flex items-center gap-3 p-4 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 hover:border-blue-500/30 rounded-xl transition-all group"
          >
            <span className="p-2 bg-blue-500/10 rounded-lg group-hover:scale-110 transition-transform">
              <Server className="w-5 h-5 text-blue-400" />
            </span>
            <div>
              <p className="text-sm font-semibold text-white group-hover:text-blue-400 transition-colors">
                Kelola Device
              </p>
              <p className="text-xs text-slate-400">
                Tambah / Edit / Hapus Perangkat
              </p>
            </div>
          </Link>

          <Link
            href="/dashboard/monitoring"
            className="flex items-center gap-3 p-4 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 hover:border-emerald-500/30 rounded-xl transition-all group"
          >
            <span className="p-2 bg-emerald-500/10 rounded-lg group-hover:scale-110 transition-transform">
              <Activity className="w-5 h-5 text-emerald-400" />
            </span>
            <div>
              <p className="text-sm font-semibold text-white group-hover:text-emerald-400 transition-colors">
                ICMP Monitoring
              </p>
              <p className="text-xs text-slate-400">Latency &amp; Packet Loss</p>
            </div>
          </Link>

          <Link
            href="/dashboard/snmp"
            className="flex items-center gap-3 p-4 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 hover:border-cyan-500/30 rounded-xl transition-all group"
          >
            <span className="text-xl p-2 bg-cyan-500/10 rounded-lg group-hover:scale-110 transition-transform">
              📊
            </span>
            <div>
              <p className="text-sm font-semibold text-white group-hover:text-cyan-400 transition-colors">
                SNMP Monitoring
              </p>
              <p className="text-xs text-slate-400">CPU · Memory · Interfaces</p>
            </div>
          </Link>

          <Link
            href="/dashboard/alerts"
            className="flex items-center gap-3 p-4 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 hover:border-rose-500/30 rounded-xl transition-all group"
          >
            <span className="text-xl p-2 bg-rose-500/10 rounded-lg group-hover:scale-110 transition-transform">
              🔔
            </span>
            <div>
              <p className="text-sm font-semibold text-white group-hover:text-rose-400 transition-colors">
                Pusat Alert
              </p>
              <p className="text-xs text-slate-400">
                Acknowledge & Resolve
              </p>
            </div>
          </Link>

          <Link
            href="/dashboard/anomalies"
            className="flex items-center gap-3 p-4 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 hover:border-amber-500/30 rounded-xl transition-all group"
          >
            <span className="text-xl p-2 bg-amber-500/10 rounded-lg group-hover:scale-110 transition-transform">
              🔍
            </span>
            <div>
              <p className="text-sm font-semibold text-white group-hover:text-amber-400 transition-colors">
                ML Anomalies
              </p>
              <p className="text-xs text-slate-400">
                Isolation Forest Detection
              </p>
            </div>
          </Link>

          <Link
            href="/dashboard/audit-logs"
            className="flex items-center gap-3 p-4 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 hover:border-purple-500/30 rounded-xl transition-all group"
          >
            <span className="text-xl p-2 bg-purple-500/10 rounded-lg group-hover:scale-110 transition-transform">
              📋
            </span>
            <div>
              <p className="text-sm font-semibold text-white group-hover:text-purple-400 transition-colors">
                Audit Logs
              </p>
              <p className="text-xs text-slate-400">Riwayat Aktivitas User</p>
            </div>
          </Link>

          {isAdmin && (
            <Link
              href="/dashboard/users"
              className="flex items-center gap-3 p-4 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 hover:border-indigo-500/30 rounded-xl transition-all group"
            >
              <span className="text-xl p-2 bg-indigo-500/10 rounded-lg group-hover:scale-110 transition-transform">
                👤
              </span>
              <div>
                <p className="text-sm font-semibold text-white group-hover:text-indigo-400 transition-colors">
                  Kelola User
                </p>
                <p className="text-xs text-slate-400">Tambah & Kelola Operator</p>
              </div>
            </Link>
          )}

          {isAdmin && (
            <Link
              href="/dashboard/settings"
              className="flex items-center gap-3 p-4 bg-slate-800/60 hover:bg-slate-800 border border-slate-700/50 hover:border-amber-500/30 rounded-xl transition-all group"
            >
              <span className="text-xl p-2 bg-amber-500/10 rounded-lg group-hover:scale-110 transition-transform">
                ⚙️
              </span>
              <div>
                <p className="text-sm font-semibold text-white group-hover:text-amber-400 transition-colors">
                  Pengaturan Polling
                </p>
                <p className="text-xs text-slate-400">Atur interval data real</p>
              </div>
            </Link>
          )}
        </div>
      </div>

      {/* ── Worker Status Panel ── */}
      <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
            ⚙️ System Worker Status
          </h3>
          <button
            onClick={() => void fetchAll()}
            className="text-xs text-slate-500 hover:text-slate-300 flex items-center gap-1 transition-colors"
          >
            🔄 Refresh
          </button>
        </div>

        {loadingWorkers ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-14 bg-slate-800/50 animate-pulse rounded-xl"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {workers.map((worker) => {
              const isRunning = worker.status === "RUNNING";
              return (
                <div
                  key={worker.id}
                  className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${
                    isRunning
                      ? "bg-emerald-500/5 border-emerald-500/20 hover:border-emerald-500/40"
                      : "bg-slate-800/40 border-slate-800/60 hover:border-slate-700"
                  }`}
                >
                  {/* Indicator dot */}
                  <div className="relative shrink-0">
                    <div
                      className={`w-3 h-3 rounded-full ${
                        isRunning ? "bg-emerald-400" : "bg-slate-600"
                      }`}
                    />
                    {isRunning && (
                      <div className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-60" />
                    )}
                  </div>

                  {/* Icon + Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-base">
                        {WORKER_ICONS[worker.id] ?? "⚙️"}
                      </span>
                      <p className="text-sm font-medium text-slate-200 truncate">
                        {worker.name}
                      </p>
                    </div>
                    <p className="text-xs text-slate-500 truncate mt-0.5">
                      {worker.detail}
                    </p>
                    {worker.health && isRunning && (
                      <p className="text-[10px] text-slate-600 mt-1 flex flex-wrap gap-2 items-center">
                        <span
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium ${
                            (worker.health.healthScore ?? 0) >= 80
                              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                              : (worker.health.healthScore ?? 0) >= 50
                              ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                              : "bg-rose-500/15 text-rose-400 border-rose-500/30"
                          }`}
                        >
                          {worker.health.healthScore !== undefined
                            ? `Health: ${worker.health.healthScore}/100`
                            : `Health: —`}
                        </span>
                        {worker.health.missedCycles > 0 ? (
                          <span className="text-amber-400">
                            {worker.health.missedCycles} missed
                          </span>
                        ) : (
                          <span className="text-emerald-500/80">on schedule</span>
                        )}
                        {worker.health.lagSeconds != null && worker.health.lagSeconds > 0 && (
                          <span className="text-amber-400">· lag {worker.health.lagSeconds}s</span>
                        )}
                        {worker.health.avgCycleDurationMs != null && (
                          <span>· avg {(worker.health.avgCycleDurationMs / 1000).toFixed(1)}s</span>
                        )}
                        {worker.health.queueDepth != null && worker.health.queueDepth > 0 && (
                          <span className="text-blue-400">
                            queue: {worker.health.queueDepth}
                          </span>
                        )}
                        {worker.health.queueBackend && (
                          <span className="text-[9px] text-slate-500 px-1.5 py-0.5 bg-slate-800 rounded">
                            {worker.health.queueBackend}
                          </span>
                        )}
                      </p>
                    )}
                  </div>

                  {/* Badge + Timestamp */}
                  <div className="text-right shrink-0">
                    <span
                      className={`inline-block px-2.5 py-0.5 text-xs font-bold rounded-full border ${
                        isRunning
                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                          : "bg-slate-800 border-slate-700 text-slate-500"
                      }`}
                    >
                      {isRunning ? "RUNNING" : "STOPPED"}
                    </span>
                    {worker.lastHeartbeat && (
                      <p className="text-[10px] text-slate-600 mt-1">
                        {new Date(worker.lastHeartbeat).toLocaleTimeString(
                          "id-ID"
                        )}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <p className="text-xs text-slate-600 mt-4">
          Status worker diperiksa berdasarkan heartbeat data terbaru di database.
          Jalankan worker dengan{" "}
          <code className="text-slate-400 bg-slate-800 px-1 rounded">
            pnpm worker:icmp
          </code>{" "}
          atau{" "}
          <code className="text-slate-400 bg-slate-800 px-1 rounded">
            pnpm pm2:start
          </code>
          .
        </p>
      </div>
    </div>
      <DeviceDrawer deviceId={selectedDeviceId} onClose={() => setSelectedDeviceId(null)} />
    </>
  );
}
