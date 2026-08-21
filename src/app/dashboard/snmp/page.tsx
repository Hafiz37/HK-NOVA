'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Area, AreaChart, BarChart, Bar, Legend, LineChart, Line,
  ReferenceLine, ReferenceArea,
} from 'recharts';
import { useRealtimeSnmp, SSEStatus } from '@/hooks/useSSE';
import { useBaseline } from '@/hooks/useBaseline';
import BaselineBadge from '@/components/dashboard/baseline-badge';

// ─── Types ────────────────────────────────────────────────────────────────────
interface DeviceSnmp {
  deviceId: string;
  name: string;
  ip: string;
  status: string;
  cpuUtil: number | null;
  memUtil: number | null;
  timestamp: string;
}

interface SnmpSummary {
  worker: { active: boolean; lastHeartbeat: string | null };
  aggregate: {
    avgCpuUtil: number | null;
    avgMemUtil: number | null;
    devicesPolled: number;
    devicesHighCpu: number;
    devicesHighMem: number;
    highUtilAlerts: number;
  };
  devices: DeviceSnmp[];
  alerts?: Alert[];
  updatedAt: string;
}

interface Alert {
  id: string;
  type: string;
  severity: string;
  message: string;
  status: string;
  createdAt: string;
  device: { id: string; name: string; ip: string } | null;
}

interface MetricPoint {
  timestamp: string;
  cpuUtil: number | null;
  memUtil: number | null;
  interfaceData: unknown;
}

interface IfEntry {
  index: number;
  name: string;
  operStatus: number;
  speed: number;
  inOctets: number;
  outOctets: number;
  inErrors: number;
  outErrors: number;
}

interface BandwidthTimeSeries {
  timestamp: string;
  interfaces: Array<{
    index: number;
    name: string;
    operStatus: number;
    speed: number;
    inBps: number;
    outBps: number;
    inErrors: number;
    outErrors: number;
  }>;
}

const TIME_RANGES = [
  { label: '1h',  hours: 1  },
  { label: '6h',  hours: 6  },
  { label: '24h', hours: 24 },
  { label: '7d',  hours: 168 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function utilColor(val: number | null, warn = 85, crit = 95): string {
  if (val === null) return 'text-slate-500';
  if (val >= crit)  return 'text-red-400';
  if (val >= warn)  return 'text-amber-400';
  return 'text-emerald-400';
}

function utilBar(val: number | null): string {
  if (val === null) return 'bg-slate-700';
  if (val >= 95)    return 'bg-red-500';
  if (val >= 85)    return 'bg-amber-500';
  return 'bg-emerald-500';
}

function fmtBytes(b: number): string {
  if (b >= 1e9) return (b / 1e9).toFixed(2) + ' GB';
  if (b >= 1e6) return (b / 1e6).toFixed(2) + ' MB';
  if (b >= 1e3) return (b / 1e3).toFixed(1) + ' KB';
  return b + ' B';
}

function fmtBps(bps: number): string {
  if (bps >= 1e9) return (bps / 1e9).toFixed(2) + ' Gbps';
  if (bps >= 1e6) return (bps / 1e6).toFixed(2) + ' Mbps';
  if (bps >= 1e3) return (bps / 1e3).toFixed(1) + ' Kbps';
  return bps + ' bps';
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({
  label, value, sub, accent, icon,
}: {
  label: string; value: string | number; sub?: string; accent: string; icon: string;
}) {
  return (
    <div className={`rounded-xl border p-5 flex flex-col gap-1 ${accent}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
        <span className="text-lg">{icon}</span>
      </div>
      <p className="text-3xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

// ─── Utilization Bar ──────────────────────────────────────────────────────────
function UtilBar({ label, value, warn = 85, crit = 95 }: {
  label: string; value: number | null; warn?: number; crit?: number;
}) {
  const pct = value ?? 0;
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-slate-400">{label}</span>
        <span className={utilColor(value, warn, crit)}>
          {value !== null ? `${value.toFixed(1)}%` : '—'}
        </span>
      </div>
      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${utilBar(value)}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}

// ─── Connection Status Badge ──────────────────────────────────────────────────
function ConnectionBadge({ status }: { status: SSEStatus }) {
  const config: Record<SSEStatus, { label: string; cls: string; dot: string }> = {
    connecting:   { label: 'Menghubungkan…', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/30', dot: 'bg-amber-400 animate-pulse' },
    connected:    { label: 'Terhubung',      cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30', dot: 'bg-emerald-400' },
    disconnected: { label: 'Terputus',       cls: 'bg-slate-500/10 text-slate-400 border-slate-500/30', dot: 'bg-slate-600' },
    error:        { label: 'Error',          cls: 'bg-rose-500/10 text-rose-400 border-rose-500/30', dot: 'bg-rose-400 animate-pulse' },
  };
  const c = config[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border ${c.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SnmpMonitoringPage() {
  const [summary, setSummary]             = useState<SnmpSummary | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [timeRange, setTimeRange]         = useState(24);
  const [metrics, setMetrics]             = useState<MetricPoint[]>([]);
  const [loading, setLoading]             = useState(true);
  const [lastRefresh, setLastRefresh]     = useState('');
  const [selectedInterface, setSelectedInterface] = useState<number | null>(null);
  const [bandwidthSeries, setBandwidthSeries] = useState<BandwidthTimeSeries[]>([]);
  const [alerts, setAlerts]               = useState<Alert[]>([]);

  // Baseline historis (24 jam) untuk metrik SNMP
  const { data: baselineCpu } = useBaseline(selectedDevice || null, 'cpu', timeRange);
  const { data: baselineMem } = useBaseline(selectedDevice || null, 'mem', timeRange);

  const handleSnmpUpdate = useCallback((data: unknown) => {
    const d = data as SnmpSummary;
    setSummary(d);
    if (d.alerts) setAlerts(d.alerts);
    setLastRefresh(new Date().toLocaleTimeString('id-ID'));
    setLoading(false);
  }, []);

  const { status: sseStatus } = useRealtimeSnmp(handleSnmpUpdate, true);

  const fetchMetrics = useCallback(async () => {
    if (!selectedDevice) { setMetrics([]); setBandwidthSeries([]); return; }
    try {
      const res  = await fetch(`/api/devices/${selectedDevice}/snmp-metrics?hours=${timeRange}&includeBandwidth=true`);
      const json = await res.json() as { data: MetricPoint[]; bandwidthTimeSeries?: BandwidthTimeSeries[] };
      setMetrics(json.data ?? []);
      setBandwidthSeries(json.bandwidthTimeSeries ?? []);
    } catch { setMetrics([]); setBandwidthSeries([]); }
  }, [selectedDevice, timeRange]);

  useEffect(() => { void fetchMetrics(); /* eslint-disable-line react-hooks/set-state-in-effect */ }, [fetchMetrics]);

  // Auto-select first device
  const didAutoSelect = useRef(false);
  useEffect(() => {
    if (!didAutoSelect.current && summary?.devices.length && !selectedDevice) {
      didAutoSelect.current = true;
      setSelectedDevice(summary.devices[0].deviceId);
    }
  }, [summary, selectedDevice]);

  // ── Chart data ────────────────────────────────────────────────────────────────
  const chartData = metrics.map((m) => ({
    time:    fmtTime(m.timestamp),
    timestamp: m.timestamp,
    cpu:     m.cpuUtil  !== null ? Number(m.cpuUtil.toFixed(1))  : null,
    memory:  m.memUtil  !== null ? Number(m.memUtil.toFixed(1))  : null,
  }));

  // ── Alert overlay for SNMP ─────────────────────────────────────────────────
  const alertOverlays = alerts
    .filter((a) => a.device?.id === selectedDevice && a.status === 'ACTIVE')
    .map((a) => ({
      time: fmtTime(a.createdAt),
      timestamp: a.createdAt,
      type: a.type,
      severity: a.severity,
      message: a.message,
      id: a.id,
    }));

  // Latest interface data for selected device
  const latestMetric = metrics[metrics.length - 1];
  const interfaces: IfEntry[] = Array.isArray(latestMetric?.interfaceData)
    ? (latestMetric.interfaceData as IfEntry[])
    : [];

  // Interface options for bandwidth chart selector
  const interfaceOptions = interfaces.filter(i => i.operStatus === 1).map(i => ({
    index: i.index,
    label: `${i.name} (${i.speed >= 1e9 ? `${i.speed / 1e9}G` : i.speed >= 1e6 ? `${i.speed / 1e6}M` : `${i.speed}`}bps)`,
  }));

  const activeInterface = selectedInterface ?? interfaceOptions[0]?.index ?? null;

  const bwChartData = bandwidthSeries.flatMap((point) => {
    const iface = point.interfaces.find((i) => i.index === activeInterface);
    if (!iface) return [];
    return [{ time: fmtTime(point.timestamp), in: iface.inBps, out: iface.outBps }];
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-slate-400">
          <div className="w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
          <span>Loading SNMP monitoring data...</span>
        </div>
      </div>
    );
  }

  const agg = summary?.aggregate;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">📊 SNMP Monitoring</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            CPU · Memory · Interface statistics via SNMP polling
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* SSE Connection status */}
          <ConnectionBadge status={sseStatus} />

          {/* Device selector */}
          <select
            id="snmp-device-select"
            value={selectedDevice}
            onChange={(e) => { setSelectedDevice(e.target.value); setSelectedInterface(null); }}
            className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            <option value="">— Select Device —</option>
            {(summary?.devices ?? []).map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.name} ({d.ip})
              </option>
            ))}
          </select>

          {/* Time range */}
          <div className="flex bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
            {TIME_RANGES.map((r) => (
              <button
                key={r.hours}
                id={`snmp-range-${r.label}`}
                onClick={() => { setTimeRange(r.hours); setSelectedInterface(null); }}
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  timeRange === r.hours
                    ? 'bg-cyan-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-700'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          <button
            id="snmp-refresh"
            onClick={() => { void fetchMetrics(); }}
            className="bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-sm px-3 py-2 rounded-lg transition-colors"
          >
            ↻ Refresh
          </button>
        </div>
      </div>
      {lastRefresh && (
        <p className="text-xs text-slate-600 -mt-4">Last updated: {lastRefresh}</p>
      )}

      {/* ── Worker status banner ── */}
      <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${
        summary?.worker.active
          ? 'bg-cyan-500/5 border-cyan-500/25'
          : 'bg-slate-800/40 border-slate-700/50'
      }`}>
        <div className="relative">
          <div className={`w-3 h-3 rounded-full ${summary?.worker.active ? 'bg-cyan-400' : 'bg-slate-600'}`} />
          {summary?.worker.active && (
            <div className="absolute inset-0 rounded-full bg-cyan-400 animate-ping opacity-60" />
          )}
        </div>
        <p className="text-sm text-slate-300">
          <span className={`font-semibold ${summary?.worker.active ? 'text-cyan-400' : 'text-slate-500'}`}>
            SNMP Worker {summary?.worker.active ? 'RUNNING' : 'STOPPED'}
          </span>
          {summary?.worker.active
            ? ` · Heartbeat: ${summary.worker.lastHeartbeat ? new Date(summary.worker.lastHeartbeat).toLocaleTimeString('id-ID') : '—'}`
            : ' · Jalankan: '
          }
          {!summary?.worker.active && (
            <code className="text-cyan-400 bg-slate-800 px-1.5 py-0.5 rounded text-xs ml-1">
              pnpm worker:snmp
            </code>
          )}
        </p>
      </div>

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Devices Polled"
          value={agg?.devicesPolled ?? 0}
          sub="with SNMP credentials"
          accent="bg-slate-900 border-slate-800"
          icon="📡"
        />
        <StatCard
          label="Avg CPU"
          value={agg?.avgCpuUtil != null ? `${agg.avgCpuUtil.toFixed(1)}%` : '—'}
          sub={`${agg?.devicesHighCpu ?? 0} device(s) > 85%`}
          accent="bg-cyan-950/30 border-cyan-800/30"
          icon="⚡"
        />
        <StatCard
          label="Avg Memory"
          value={agg?.avgMemUtil != null ? `${agg.avgMemUtil.toFixed(1)}%` : '—'}
          sub={`${agg?.devicesHighMem ?? 0} device(s) > 90%`}
          accent="bg-purple-950/30 border-purple-800/30"
          icon="🧠"
        />
        <StatCard
          label="Util Alerts"
          value={agg?.highUtilAlerts ?? 0}
          sub="HIGH_UTILIZATION active"
          accent={
            (agg?.highUtilAlerts ?? 0) > 0
              ? 'bg-rose-950/40 border-rose-800/40'
              : 'bg-slate-900 border-slate-800'
          }
          icon="🔔"
        />
      </div>

      {/* ── CPU + Memory Charts ── */}
      {selectedDevice && chartData.length > 0 ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* CPU Chart */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">⚡ CPU Utilization (%)</h3>
              {baselineCpu && (
                <div className="flex items-center gap-2">
                  <BaselineBadge level={baselineCpu.deviation.level} />
                  {!baselineCpu.insufficientData && (
                    <span className="text-[11px] text-slate-500">
                      Baseline: {baselineCpu.baseline.mean.toFixed(1)}% ± {baselineCpu.baseline.stddev.toFixed(1)}
                    </span>
                  )}
                </div>
              )}
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#06b6d4" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}   />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
                  labelStyle={{ color: '#94a3b8' }}
                  itemStyle={{ color: '#22d3ee' }}
                  formatter={(v: unknown) =>
                    typeof v === 'number' ? [`${v.toFixed(1)}%`, 'CPU'] : ['—', 'CPU']
                  }
                />
                {baselineCpu && !baselineCpu.insufficientData && (
                  <>
                    <ReferenceArea
                      y1={baselineCpu.baseline.mean - baselineCpu.baseline.stddev}
                      y2={baselineCpu.baseline.mean + baselineCpu.baseline.stddev}
                      fill="#06b6d4"
                      fillOpacity={0.08}
                    />
                    <ReferenceLine
                      y={baselineCpu.baseline.mean}
                      stroke="#67e8f9"
                      strokeDasharray="6 4"
                      strokeWidth={1.5}
                      label={{ value: 'baseline', fill: '#67e8f9', fontSize: 10, position: 'insideTopRight' }}
                    />
                  </>
                )}
                {/* Alert timeline overlays */}
                {alertOverlays.map((alert) => (
                  <ReferenceLine
                    key={alert.id + '-cpu'}
                    x={alert.timestamp}
                    stroke={alert.severity === 'CRITICAL' ? '#ef4444' : alert.severity === 'HIGH' ? '#f97316' : '#eab308'}
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    label={{
                      value: `⚠ ${alert.type}`,
                      fill: alert.severity === 'CRITICAL' ? '#ef4444' : alert.severity === 'HIGH' ? '#f97316' : '#eab308',
                      fontSize: 9,
                      position: 'insideTop',
                      offset: -5,
                    }}
                  />
                ))}
                <Area type="monotone" dataKey="cpu" stroke="#06b6d4" strokeWidth={2}
                  fill="url(#cpuGrad)" dot={false} connectNulls={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Memory Chart */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">🧠 Memory Utilization (%)</h3>
              {baselineMem && (
                <div className="flex items-center gap-2">
                  <BaselineBadge level={baselineMem.deviation.level} />
                  {!baselineMem.insufficientData && (
                    <span className="text-[11px] text-slate-500">
                      Baseline: {baselineMem.baseline.mean.toFixed(1)}% ± {baselineMem.baseline.stddev.toFixed(1)}
                    </span>
                  )}
                </div>
              )}
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#a855f7" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#a855f7" stopOpacity={0}   />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
                  labelStyle={{ color: '#94a3b8' }}
                  itemStyle={{ color: '#c084fc' }}
                  formatter={(v: unknown) =>
                    typeof v === 'number' ? [`${v.toFixed(1)}%`, 'Memory'] : ['—', 'Memory']
                  }
                />
                {baselineMem && !baselineMem.insufficientData && (
                  <>
                    <ReferenceArea
                      y1={baselineMem.baseline.mean - baselineMem.baseline.stddev}
                      y2={baselineMem.baseline.mean + baselineMem.baseline.stddev}
                      fill="#a855f7"
                      fillOpacity={0.08}
                    />
                    <ReferenceLine
                      y={baselineMem.baseline.mean}
                      stroke="#d8b4fe"
                      strokeDasharray="6 4"
                      strokeWidth={1.5}
                      label={{ value: 'baseline', fill: '#d8b4fe', fontSize: 10, position: 'insideTopRight' }}
                    />
                  </>
                )}
                {/* Alert timeline overlays */}
                {alertOverlays.map((alert) => (
                  <ReferenceLine
                    key={alert.id + '-mem'}
                    x={alert.timestamp}
                    stroke={alert.severity === 'CRITICAL' ? '#ef4444' : alert.severity === 'HIGH' ? '#f97316' : '#eab308'}
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                    label={{
                      value: `⚠ ${alert.type}`,
                      fill: alert.severity === 'CRITICAL' ? '#ef4444' : alert.severity === 'HIGH' ? '#f97316' : '#eab308',
                      fontSize: 9,
                      position: 'insideTop',
                      offset: -5,
                    }}
                  />
                ))}
                <Area type="monotone" dataKey="memory" stroke="#a855f7" strokeWidth={2}
                  fill="url(#memGrad)" dot={false} connectNulls={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Combined Bar Chart */}
          {chartData.length > 1 && (
            <div className="xl:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-white mb-4">📊 CPU vs Memory (latest 30 samples)</h3>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart
                  data={chartData.slice(-30)}
                  margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
                  barSize={6}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
                    labelStyle={{ color: '#94a3b8' }}
                    formatter={(v, name) =>
                      typeof v === 'number' ? [`${v.toFixed(1)}%`, name] : ['—', name]
                    }
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                  <Bar dataKey="cpu"    name="CPU %"    fill="#06b6d4" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="memory" name="Memory %" fill="#a855f7" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Bandwidth Chart */}
          {interfaceOptions.length > 0 && activeInterface !== null && bwChartData.length > 0 && (
            <div className="xl:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-white">📈 Interface Bandwidth (Real-time)</h3>
                <select
                  value={activeInterface}
                  onChange={(e) => setSelectedInterface(Number(e.target.value))}
                  className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                >
                  {interfaceOptions.map(opt => (
                    <option key={opt.index} value={opt.index}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={bwChartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="bwInGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#06b6d4" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}   />
                    </linearGradient>
                    <linearGradient id="bwOutGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}   />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
                    labelStyle={{ color: '#94a3b8' }}
                    formatter={(v, name) => {
                      const bps = typeof v === 'number' ? v : 0;
                      const label = name === 'in' ? 'In' : 'Out';
                      return [`${fmtBps(bps)}`, label];
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
                  {/* Alert timeline overlays */}
                  {alertOverlays.map((alert) => (
                    <ReferenceLine
                      key={alert.id + '-bw'}
                      x={alert.timestamp}
                      stroke={alert.severity === 'CRITICAL' ? '#ef4444' : alert.severity === 'HIGH' ? '#f97316' : '#eab308'}
                      strokeDasharray="4 4"
                      strokeWidth={1.5}
                      label={{
                        value: `⚠ ${alert.type}`,
                        fill: alert.severity === 'CRITICAL' ? '#ef4444' : alert.severity === 'HIGH' ? '#f97316' : '#eab308',
                        fontSize: 9,
                        position: 'insideTop',
                        offset: -5,
                      }}
                    />
                  ))}
                  <Line
                    type="monotone"
                    dataKey="in"
                    name="In"
                    stroke="#06b6d4"
                    strokeWidth={2}
                    fill="url(#bwInGrad)"
                    dot={false}
                    connectNulls={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="out"
                    name="Out"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    fill="url(#bwOutGrad)"
                    dot={false}
                    connectNulls={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      ) : selectedDevice ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-500">
          No SNMP metric data for this device in the selected time range.
          {!summary?.worker.active && (
            <p className="mt-2 text-xs">
              Start the SNMP worker:{' '}
              <code className="text-cyan-400 bg-slate-800 px-1.5 py-0.5 rounded">pnpm worker:snmp</code>
            </p>
          )}
        </div>
      ) : null}

      {/* ── Device Table ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">🖥️ Device SNMP Overview</h3>
          <span className="text-xs text-slate-500">
            {summary?.devices.length ?? 0} device{(summary?.devices.length ?? 0) !== 1 ? 's' : ''}
          </span>
        </div>

        {(summary?.devices.length ?? 0) === 0 ? (
          <div className="px-5 py-10 text-center text-slate-500 text-sm">
            <p>Tidak ada data SNMP. Pastikan device memiliki kredensial SNMP dan worker berjalan.</p>
            <code className="text-cyan-400 bg-slate-800 px-2 py-0.5 rounded text-xs mt-2 inline-block">
              pnpm worker:snmp
            </code>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/50">
            {(summary?.devices ?? []).map((d) => (
              <div
                key={d.deviceId}
                onClick={() => { setSelectedDevice(d.deviceId); setSelectedInterface(null); }}
                id={`snmp-device-${d.deviceId}`}
                className={`px-5 py-4 cursor-pointer transition-colors ${
                  selectedDevice === d.deviceId
                    ? 'bg-cyan-500/5 border-l-2 border-cyan-500'
                    : 'hover:bg-slate-800/30'
                }`}
              >
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  {/* Device info */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-white text-sm">{d.name}</p>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                        d.status === 'UP'
                          ? 'bg-green-500/20 text-green-400'
                          : d.status === 'DOWN'
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-slate-700 text-slate-400'
                      }`}>
                        {d.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-mono">{d.ip}</p>
                  </div>

                  {/* Utilization bars */}
                  <div className="flex-1 max-w-sm space-y-1.5">
                    <UtilBar label="CPU"    value={d.cpuUtil} />
                    <UtilBar label="Memory" value={d.memUtil} warn={90} crit={95} />
                  </div>

                  {/* View button */}
                  <button
                    id={`btn-snmp-view-${d.deviceId}`}
                    onClick={(e) => { e.stopPropagation(); setSelectedDevice(d.deviceId); setSelectedInterface(null); }}
                    className={`text-xs px-3 py-1.5 rounded-lg transition-colors shrink-0 ${
                      selectedDevice === d.deviceId
                        ? 'bg-cyan-600 text-white'
                        : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                    }`}
                  >
                    {selectedDevice === d.deviceId ? '● Viewing' : 'View Charts'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Interface Table ── */}
      {interfaces.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800">
            <h3 className="text-sm font-semibold text-white">🔌 Interface Data (Latest Poll)</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {(summary?.devices ?? []).find((d) => d.deviceId === selectedDevice)?.name ?? ''} —{' '}
              {interfaces.length} interface{interfaces.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 uppercase tracking-wider border-b border-slate-800">
                  <th className="text-left px-5 py-3">Interface</th>
                  <th className="text-left px-5 py-3">Status</th>
                  <th className="text-right px-5 py-3">Speed</th>
                  <th className="text-right px-5 py-3">In Octets</th>
                  <th className="text-right px-5 py-3">Out Octets</th>
                  <th className="text-right px-5 py-3">Errors In/Out</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {interfaces.map((iface) => (
                  <tr key={iface.index} className="hover:bg-slate-800/30">
                    <td className="px-5 py-3 font-medium text-slate-200">{iface.name}</td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-0.5 rounded-full font-medium ${
                        iface.operStatus === 1
                          ? 'bg-green-500/20 text-green-400'
                          : 'bg-red-500/20 text-red-400'
                      }`}>
                        {iface.operStatus === 1 ? 'Up' : 'Down'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right text-slate-300 font-mono">
                      {iface.speed >= 1e9
                        ? `${(iface.speed / 1e9).toFixed(0)} Gbps`
                        : iface.speed >= 1e6
                        ? `${(iface.speed / 1e6).toFixed(0)} Mbps`
                        : `${iface.speed} bps`}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-cyan-400">
                      {fmtBytes(iface.inOctets)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-purple-400">
                      {fmtBytes(iface.outOctets)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono">
                      <span className={iface.inErrors + iface.outErrors > 0 ? 'text-amber-400' : 'text-slate-500'}>
                        {iface.inErrors} / {iface.outErrors}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}