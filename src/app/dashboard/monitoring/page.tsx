'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
  ReferenceLine,
  ReferenceArea,
} from 'recharts';
import { useRealtimeMonitoring, SSEStatus } from '@/hooks/useSSE';
import { useBaseline } from '@/hooks/useBaseline';
import BaselineBadge from '@/components/dashboard/baseline-badge';

// ─── Types ────────────────────────────────────────────────────────────────────
interface DeviceRow {
  id: string;
  name: string;
  ip: string;
  type: string;
  location: string | null;
  status: 'UP' | 'DOWN' | 'UNKNOWN' | 'MAINTENANCE';
  latestLatency: number | null;
  latestPacketLoss: number | null;
  lastCheck: string | null;
  isDemo: boolean;
}

interface Summary {
  devices: { total: number; up: number; down: number; unknown: number };
  alerts: { active: number };
  avgLatencyMs: number | null;
}

interface MetricPoint {
  timestamp: string;
  latency: number | null;
  packetLoss: number | null;
}

interface Alert {
  id: string;
  type: string;
  severity: string;
  message: string;
  status: string;
  createdAt: string;
  device: { name: string; ip: string } | null;
}

interface MonitoringUpdate {
  devices: DeviceRow[];
  summary: Summary;
  alerts: Alert[];
  updatedAt: string;
}

const TIME_RANGES = [
  { label: '1h', hours: 1 },
  { label: '6h', hours: 6 },
  { label: '24h', hours: 24 },
  { label: '7d', hours: 168 },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function statusColor(status: string) {
  switch (status) {
    case 'UP': return { dot: '#22c55e', badge: 'bg-green-500/20 text-green-400 border border-green-500/30' };
    case 'DOWN': return { dot: '#ef4444', badge: 'bg-red-500/20 text-red-400 border border-red-500/30' };
    case 'MAINTENANCE': return { dot: '#f59e0b', badge: 'bg-amber-500/20 text-amber-400 border border-amber-500/30' };
    default: return { dot: '#94a3b8', badge: 'bg-slate-500/20 text-slate-400 border border-slate-600/30' };
  }
}

function severityBadge(severity: string) {
  switch (severity) {
    case 'CRITICAL': return 'bg-red-600/20 text-red-400';
    case 'HIGH': return 'bg-orange-500/20 text-orange-400';
    case 'MEDIUM': return 'bg-yellow-500/20 text-yellow-400';
    default: return 'bg-blue-500/20 text-blue-400';
  }
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent: string }) {
  return (
    <div className={`rounded-xl border p-5 flex flex-col gap-2 ${accent}`}>
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</p>
      <p className="text-3xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-slate-500">{sub}</p>}
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
export default function MonitoringPage() {
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [timeRange, setTimeRange] = useState(24);
  const [metrics, setMetrics] = useState<MetricPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [ackLoading, setAckLoading] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState('');

  // Baseline historis (24 jam) untuk metrik ICMP
  const { data: baselineLatency } = useBaseline(selectedDevice || null, 'latency', timeRange);
  const { data: baselineLoss } = useBaseline(selectedDevice || null, 'packetLoss', timeRange);

  const handleMonitoringUpdate = useCallback((data: unknown) => {
    const d = data as MonitoringUpdate;
    setDevices(d.devices);
    setSummary(d.summary);
    setAlerts(d.alerts);
    setLastRefresh(new Date().toLocaleTimeString('id-ID'));
    setLoading(false);
  }, []);

  const { status: sseStatus } = useRealtimeMonitoring(handleMonitoringUpdate, true);

  const fetchMetrics = useCallback(async () => {
    if (!selectedDevice) { setMetrics([]); return; }
    try {
      const res = await fetch(`/api/devices/${selectedDevice}/metrics?hours=${timeRange}&type=ICMP`);
      const json = await res.json() as { data: MetricPoint[] };
      setMetrics(json.data ?? []);
    } catch {
      setMetrics([]);
    }
  }, [selectedDevice, timeRange]);

  useEffect(() => { void fetchMetrics(); /* eslint-disable-line react-hooks/set-state-in-effect */ }, [fetchMetrics]);

  // Auto-select first device on initial load
  const initialSelectRef = useRef(true);
  useEffect(() => {
    if (initialSelectRef.current && devices.length > 0 && !selectedDevice) {
      initialSelectRef.current = false;
      setSelectedDevice(devices[0].id);
    }
  }, [devices, selectedDevice]);

  // ── Acknowledge alert ────────────────────────────────────────────────────────
  const acknowledge = async (alertId: string) => {
    setAckLoading(alertId);
    try {
      await fetch(`/api/alerts/${alertId}/acknowledge`, { method: 'POST' });
      // SSE will push updated alerts automatically
    } finally {
      setAckLoading(null);
    }
  };

  // ── Chart data ───────────────────────────────────────────────────────────────
  const chartData = metrics.map((m) => ({
    time: fmtTime(m.timestamp),
    latency: m.latency != null ? Number(m.latency.toFixed(2)) : null,
    packetLoss: m.packetLoss != null ? Number(m.packetLoss.toFixed(1)) : null,
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-slate-400">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span>Loading monitoring data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">📡 ICMP Monitoring</h2>
          <p className="text-sm text-slate-400 mt-0.5">Real-time network device reachability</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* SSE Connection status */}
          <ConnectionBadge status={sseStatus} />

          {/* Device selector */}
          <select
            id="device-select"
            value={selectedDevice}
            onChange={(e) => setSelectedDevice(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">— Select Device —</option>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>{d.name} ({d.ip})</option>
            ))}
          </select>
          {/* Time range */}
          <div className="flex bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
            {TIME_RANGES.map((r) => (
              <button
                key={r.hours}
                id={`time-range-${r.label}`}
                onClick={() => setTimeRange(r.hours)}
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  timeRange === r.hours ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          {/* Refresh */}
          <button
            id="btn-refresh"
            onClick={() => { void fetchMetrics(); }}
            className="bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-sm px-3 py-2 rounded-lg transition-colors"
          >
            ↻ Refresh
          </button>
        </div>
      </div>
      {lastRefresh && <p className="text-xs text-slate-600 -mt-4">Last updated: {lastRefresh}</p>}

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Devices"
          value={summary?.devices.total ?? 0}
          sub={`${summary?.devices.unknown ?? 0} unknown`}
          accent="bg-slate-900 border-slate-800"
        />
        <StatCard
          label="Devices UP"
          value={summary?.devices.up ?? 0}
          sub="Reachable"
          accent="bg-green-950/40 border-green-800/40"
        />
        <StatCard
          label="Devices DOWN"
          value={summary?.devices.down ?? 0}
          sub={`${summary?.alerts.active ?? 0} active alert${(summary?.alerts.active ?? 0) !== 1 ? 's' : ''}`}
          accent="bg-red-950/40 border-red-800/40"
        />
        <StatCard
          label="Avg Latency"
          value={summary?.avgLatencyMs != null ? `${summary.avgLatencyMs.toFixed(1)} ms` : '—'}
          sub="Latest ICMP poll"
          accent="bg-blue-950/40 border-blue-800/40"
        />
      </div>

      {/* ── Charts ── */}
      {selectedDevice && metrics.length > 0 ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* Latency Chart */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">📈 Latency (ms)</h3>
              {baselineLatency && (
                <div className="flex items-center gap-2">
                  <BaselineBadge level={baselineLatency.deviation.level} />
                  {!baselineLatency.insufficientData && (
                    <span className="text-[11px] text-slate-500">
                      Baseline: {baselineLatency.baseline.mean.toFixed(1)} ms ± {baselineLatency.baseline.stddev.toFixed(1)}
                    </span>
                  )}
                </div>
              )}
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="latencyGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
                  labelStyle={{ color: '#94a3b8' }}
                  itemStyle={{ color: '#60a5fa' }}
                  formatter={(v: unknown) =>
                    typeof v === 'number' ? [`${v.toFixed(2)} ms`, 'Latency'] : ['—', 'Latency']
                  }
                />
                {baselineLatency && !baselineLatency.insufficientData && (
                  <>
                    <ReferenceArea
                      y1={baselineLatency.baseline.mean - baselineLatency.baseline.stddev}
                      y2={baselineLatency.baseline.mean + baselineLatency.baseline.stddev}
                      fill="#3b82f6"
                      fillOpacity={0.08}
                    />
                    <ReferenceLine
                      y={baselineLatency.baseline.mean}
                      stroke="#818cf8"
                      strokeDasharray="6 4"
                      strokeWidth={1.5}
                      label={{ value: 'baseline', fill: '#818cf8', fontSize: 10, position: 'insideTopRight' }}
                    />
                  </>
                )}
                <Area type="monotone" dataKey="latency" stroke="#3b82f6" strokeWidth={2} fill="url(#latencyGrad)" dot={false} connectNulls={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Packet Loss Chart */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">📉 Packet Loss (%)</h3>
              {baselineLoss && (
                <div className="flex items-center gap-2">
                  <BaselineBadge level={baselineLoss.deviation.level} />
                  {!baselineLoss.insufficientData && (
                    <span className="text-[11px] text-slate-500">
                      Baseline: {baselineLoss.baseline.mean.toFixed(1)}% ± {baselineLoss.baseline.stddev.toFixed(1)}
                    </span>
                  )}
                </div>
              )}
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="lossGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
                  labelStyle={{ color: '#94a3b8' }}
                  itemStyle={{ color: '#f87171' }}
                  formatter={(v: unknown) =>
                    typeof v === 'number' ? [`${v.toFixed(1)}%`, 'Packet Loss'] : ['—', 'Packet Loss']
                  }
                />
                {baselineLoss && !baselineLoss.insufficientData && (
                  <>
                    <ReferenceArea
                      y1={baselineLoss.baseline.mean - baselineLoss.baseline.stddev}
                      y2={baselineLoss.baseline.mean + baselineLoss.baseline.stddev}
                      fill="#ef4444"
                      fillOpacity={0.08}
                    />
                    <ReferenceLine
                      y={baselineLoss.baseline.mean}
                      stroke="#f87171"
                      strokeDasharray="6 4"
                      strokeWidth={1.5}
                      label={{ value: 'baseline', fill: '#f87171', fontSize: 10, position: 'insideTopRight' }}
                    />
                  </>
                )}
                <Area type="monotone" dataKey="packetLoss" stroke="#ef4444" strokeWidth={2} fill="url(#lossGrad)" dot={false} connectNulls={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : selectedDevice ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-500">
          No metric data yet for this device in the selected time range.
        </div>
      ) : null}

      {/* ── Device Table ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">🖥️ Device Status</h3>
          <span className="text-xs text-slate-500">{devices.length} device{devices.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 uppercase tracking-wider border-b border-slate-800">
                <th className="text-left px-5 py-3">Device</th>
                <th className="text-left px-5 py-3">IP</th>
                <th className="text-left px-5 py-3">Status</th>
                <th className="text-right px-5 py-3">Latency</th>
                <th className="text-right px-5 py-3">Pkt Loss</th>
                <th className="text-left px-5 py-3">Last Check</th>
                <th className="text-left px-5 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {devices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-slate-500">
                    No devices found. Run <code className="text-blue-400">pnpm db:seed</code> to add demo devices.
                  </td>
                </tr>
              ) : (
                devices.map((device) => {
                  const sc = statusColor(device.status);
                  return (
                    <tr key={device.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-5 py-3">
                        <div className="font-medium text-white">{device.name}</div>
                        <div className="text-xs text-slate-500">{device.location ?? device.type}</div>
                      </td>
                      <td className="px-5 py-3 text-slate-300 font-mono text-xs">{device.ip}</td>
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: sc.dot }} />
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sc.badge}`}>
                            {device.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right">
                        {device.latestLatency != null
                          ? <span className="text-blue-400 font-mono">{device.latestLatency.toFixed(1)} ms</span>
                          : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {device.latestPacketLoss != null
                          ? <span className={`font-mono ${device.latestPacketLoss > 50 ? 'text-red-400' : device.latestPacketLoss > 0 ? 'text-amber-400' : 'text-green-400'}`}>
                              {device.latestPacketLoss.toFixed(0)}%
                            </span>
                          : <span className="text-slate-600">—</span>}
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500">
                        {device.lastCheck ? fmtDateTime(device.lastCheck) : '—'}
                      </td>
                      <td className="px-5 py-3">
                        <button
                          id={`btn-view-${device.id}`}
                          onClick={() => setSelectedDevice(device.id)}
                          className={`text-xs px-2 py-1 rounded transition-colors ${
                            selectedDevice === device.id
                              ? 'bg-blue-600 text-white'
                              : 'bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700'
                          }`}
                        >
                          {selectedDevice === device.id ? '● Viewing' : 'View'}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Active Alerts ── */}
      {alerts.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">🔔 Active Alerts</h3>
            <span className="text-xs bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-0.5 rounded-full">{alerts.length} active</span>
          </div>
          <div className="divide-y divide-slate-800/50">
            {alerts.map((alert) => (
              <div key={alert.id} className="px-5 py-4 flex items-start gap-4 hover:bg-slate-800/20">
                <div className={`text-xs px-2 py-1 rounded font-medium mt-0.5 ${severityBadge(alert.severity)}`}>
                  {alert.severity}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium">{alert.type.replace('_', ' ')}</p>
                  <p className="text-xs text-slate-400 mt-0.5 line-clamp-2">{alert.message}</p>
                  {alert.device && (
                    <p className="text-xs text-slate-600 mt-1">{alert.device.name} · {alert.device.ip}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs text-slate-500">{fmtDateTime(alert.createdAt)}</p>
                  <button
                    id={`btn-ack-${alert.id}`}
                    onClick={() => void acknowledge(alert.id)}
                    disabled={ackLoading === alert.id}
                    className="mt-2 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1 rounded transition-colors disabled:opacity-50"
                  >
                    {ackLoading === alert.id ? '...' : 'Acknowledge'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}