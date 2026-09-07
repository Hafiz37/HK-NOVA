"use client";

import { useEffect, useState } from "react";

interface DeviceMetric {
  deviceId: string;
  deviceName: string;
  deviceIp: string;
  deviceStatus: string;
  activeOps: number;
  queueLength: number;
  circuitOpen: boolean;
  circuitState: string;
  consecutiveFailures: number;
  opsLastHour: number;
  successRate: number;
}

interface MonitorStats {
  totalDevices: number;
  devicesWithOpenCircuit: number;
  totalActiveOps: number;
  totalQueuedOps: number;
  averageSuccessRate: number;
}

export function CustomerOperationsMonitor() {
  const [stats, setStats] = useState<MonitorStats | null>(null);
  const [devices, setDevices] = useState<DeviceMetric[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMetrics = async () => {
    try {
      const res = await fetch("/api/customers/operations-monitor");
      const data = await res.json();
      if (data.success) {
        setStats(data.data.stats);
        setDevices(data.data.devices);
      }
    } catch (error) {
      console.error("Error fetching operation metrics:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 10000); // Auto refresh every 10s
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
        <div className="text-slate-400 text-center py-4">Loading operation metrics...</div>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-white">Customer Operations Monitor</h2>
          <p className="text-xs text-slate-400 mt-0.5">Real-time MikroTik operation rate limits & safety status</p>
        </div>
        <button
          onClick={fetchMetrics}
          className="text-xs px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors"
        >
          🔄 Refresh
        </button>
      </div>

      {/* Stats Summary */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
            <div className="text-xs text-slate-400">Active Operations</div>
            <div className="text-xl font-bold text-blue-400 mt-1">{stats.totalActiveOps}</div>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
            <div className="text-xs text-slate-400">Queued Operations</div>
            <div className="text-xl font-bold text-purple-400 mt-1">{stats.totalQueuedOps}</div>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
            <div className="text-xs text-slate-400">Circuit Breakers Open</div>
            <div className={`text-xl font-bold mt-1 ${stats.devicesWithOpenCircuit > 0 ? "text-rose-400" : "text-emerald-400"}`}>
              {stats.devicesWithOpenCircuit}
            </div>
          </div>
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
            <div className="text-xs text-slate-400">Avg Success Rate (1h)</div>
            <div className={`text-xl font-bold mt-1 ${stats.averageSuccessRate >= 90 ? "text-emerald-400" : "text-amber-400"}`}>
              {stats.averageSuccessRate}%
            </div>
          </div>
        </div>
      )}

      {/* Device Status List */}
      <div className="space-y-3">
        {devices.length === 0 ? (
          <div className="text-slate-400 text-center py-4">Belum ada device terpantau</div>
        ) : (
          devices.map((device) => (
            <div key={device.deviceId} className="bg-slate-800 border border-slate-700 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-white flex items-center gap-2">
                    {device.deviceName}
                    <span className="text-xs font-mono text-slate-400">({device.deviceIp})</span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                    <span>Active: {device.activeOps}/2</span>
                    <span>Queued: {device.queueLength}</span>
                    <span>Failures: {device.consecutiveFailures}</span>
                    <span>Success Rate: {device.successRate}%</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${device.circuitOpen ? "bg-rose-500/10 text-rose-400 border-rose-500/20" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"}`}>
                    Circuit: {device.circuitState}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
