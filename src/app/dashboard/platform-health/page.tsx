"use client";

import { useEffect, useState } from "react";
import { Activity, Cpu, HardDrive, Server, RefreshCw, Database } from "lucide-react";

interface HealthData {
  status: string;
  timestamp: string;
  process: {
    uptimeSeconds: number;
    memory: {
      heapUsedMb: number;
      heapTotalMb: number;
      rssMb: number;
    };
  };
  system: {
    platform: string;
    arch: string;
    cpuCores: number;
    cpuModel: string;
    loadAvg: number[];
    memory: {
      totalMb: number;
      freeMb: number;
      usedPct: number;
    };
  };
  cache: {
    backend: string;
    connected: boolean;
    keys: number;
  };
  telemetry: {
    totalRequests: number;
    avgLatencyMs: number;
    p95LatencyMs: number;
    errorCount: number;
  };
}

export default function PlatformHealthPage() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchHealth = async () => {
    try {
      const res = await fetch("/api/platform/health");
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => { await fetchHealth(); })();
    const interval = setInterval(fetchHealth, 10_000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-slate-400">
          <RefreshCw className="w-5 h-5 animate-spin text-blue-500" />
          <span>Memuat Platform Health Metrics...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">🖥️ Platform Meta-Monitoring</h2>
          <p className="text-slate-400 text-sm mt-0.5">Real-time health, memory, CPU load, and Redis cache telemetry</p>
        </div>
        <button
          onClick={fetchHealth}
          className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold border border-slate-700 transition-colors flex items-center gap-2"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Grid Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Server Memory */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase text-slate-400">System RAM</span>
            <HardDrive className="w-4 h-4 text-purple-400" />
          </div>
          <p className="text-2xl font-bold text-white">{data?.system.memory.usedPct}%</p>
          <p className="text-xs text-slate-500 mt-1">
            Free: {((data?.system.memory.freeMb ?? 0) / 1024).toFixed(1)} GB / {((data?.system.memory.totalMb ?? 0) / 1024).toFixed(1)} GB
          </p>
        </div>

        {/* Node.js Heap */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase text-slate-400">Node Heap</span>
            <Cpu className="w-4 h-4 text-cyan-400" />
          </div>
          <p className="text-2xl font-bold text-white">{data?.process.memory.heapUsedMb} MB</p>
          <p className="text-xs text-slate-500 mt-1">
            RSS: {data?.process.memory.rssMb} MB · Total: {data?.process.memory.heapTotalMb} MB
          </p>
        </div>

        {/* Redis Cache */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase text-slate-400">Cache Layer</span>
            <Database className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-white uppercase">{data?.cache.backend}</p>
          <p className="text-xs text-slate-500 mt-1">
            Status: {data?.cache.connected ? "Connected" : "In-Memory Fallback"}
          </p>
        </div>

        {/* API Telemetry */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase text-slate-400">Avg API Latency</span>
            <Activity className="w-4 h-4 text-blue-400" />
          </div>
          <p className="text-2xl font-bold text-white">{data?.telemetry.avgLatencyMs} ms</p>
          <p className="text-xs text-slate-500 mt-1">
            P95: {data?.telemetry.p95LatencyMs} ms · Req: {data?.telemetry.totalRequests}
          </p>
        </div>
      </div>

      {/* System Details */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-4">
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
          <Server className="w-4 h-4 text-blue-400" />
          Host Environment Details
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono bg-slate-950/60 p-4 rounded-xl border border-slate-800/80">
          <div>
            <p className="text-slate-500">OS / Arch</p>
            <p className="text-slate-200 mt-0.5">{data?.system.platform} ({data?.system.arch})</p>
          </div>
          <div>
            <p className="text-slate-500">CPU Cores</p>
            <p className="text-slate-200 mt-0.5">{data?.system.cpuCores} cores · {data?.system.cpuModel}</p>
          </div>
          <div>
            <p className="text-slate-500">Process Uptime</p>
            <p className="text-slate-200 mt-0.5">{Math.floor((data?.process.uptimeSeconds ?? 0) / 3600)}h {Math.floor(((data?.process.uptimeSeconds ?? 0) % 3600) / 60)}m</p>
          </div>
        </div>
      </div>
    </div>
  );
}
