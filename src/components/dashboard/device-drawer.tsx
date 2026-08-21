"use client";

import React, { useEffect, useState } from "react";
import { X, Activity, Cpu, HardDrive, ExternalLink, RefreshCw, AlertTriangle } from "lucide-react";
import Link from "next/link";
import Sparkline from "./sparkline";

interface DeviceDrawerProps {
  deviceId: string | null;
  onClose: () => void;
}

interface DeviceMetricsData {
  device: { id: string; name: string; ip: string; status: string };
  summary: {
    avgLatency: number | null;
    maxLatency: number | null;
    minLatency: number | null;
    avgPacketLoss: number | null;
  };
  data: Array<{
    timestamp: string;
    latency: number | null;
    packetLoss: number | null;
  }>;
}

interface SnmpMetricsData {
  summary: {
    avgCpuUtil: number | null;
    maxCpuUtil: number | null;
    avgMemUtil: number | null;
    maxMemUtil: number | null;
  };
  data: Array<{
    timestamp: string;
    cpuUtil: number | null;
    memUtil: number | null;
  }>;
}

export default function DeviceDrawer({ deviceId, onClose }: DeviceDrawerProps) {
  const [icmpData, setIcmpData] = useState<DeviceMetricsData | null>(null);
  const [snmpData, setSnmpData] = useState<SnmpMetricsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!deviceId) return;

    let isMounted = true;

    async function fetchDetails() {
      if (!isMounted) return;
      setLoading(true);
      setError(null);
      try {
        const [icmpRes, snmpRes] = await Promise.all([
          fetch(`/api/devices/${deviceId}/metrics?hours=24&limit=100`),
          fetch(`/api/devices/${deviceId}/snmp-metrics?hours=24&limit=100`),
        ]);

        if (!icmpRes.ok) throw new Error("Gagal mengambil data ICMP");

        const icmpJson = await icmpRes.json();
        const snmpJson = snmpRes.ok ? await snmpRes.json() : null;

        if (isMounted) {
          setIcmpData(icmpJson);
          setSnmpData(snmpJson);
        }
      } catch (err) {
        if (isMounted) setError(err instanceof Error ? err.message : "Terjadi kesalahan");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchDetails();

    return () => {
      isMounted = false;
    };
  }, [deviceId]);

  if (!deviceId) return null;

  const latencies = icmpData?.data.map((d) => d.latency ?? 0) ?? [];
  const cpuSeries = snmpData?.data.map((d) => d.cpuUtil ?? 0) ?? [];
  const memSeries = snmpData?.data.map((d) => d.memUtil ?? 0) ?? [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/70 backdrop-blur-sm transition-opacity">
      <div className="w-full max-w-lg bg-slate-900 border-l border-slate-800 h-full flex flex-col shadow-2xl animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-white truncate">
              {icmpData?.device.name ?? "Memuat Detail Device..."}
            </h2>
            <p className="text-xs font-mono text-slate-400">
              {icmpData?.device.ip ?? deviceId}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center text-slate-500 gap-3">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
              <p className="text-xs">Mengambil statistik live device...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : (
            <>
              {/* Quick Status Pill */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
                <span className="text-xs text-slate-400 font-medium">Status Operasional</span>
                <span
                  className={`px-2.5 py-1 text-xs font-bold rounded-full ${
                    icmpData?.device.status === "UP"
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      : "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                  }`}
                >
                  {icmpData?.device.status ?? "UNKNOWN"}
                </span>
              </div>

              {/* ICMP Metrics Summary & Sparkline */}
              <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-blue-400" />
                    <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                      Latency (24 Jam)
                    </h3>
                  </div>
                  <span className="text-sm font-bold text-blue-400 font-mono">
                    {icmpData?.summary.avgLatency != null
                      ? `${icmpData.summary.avgLatency.toFixed(1)} ms`
                      : "—"}
                  </span>
                </div>
                <Sparkline data={latencies} color="#3b82f6" height={36} />
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-400 pt-1 border-t border-slate-800/60">
                  <div>Max: <span className="text-slate-200 font-mono">{icmpData?.summary.maxLatency?.toFixed(1) ?? "—"} ms</span></div>
                  <div>Min: <span className="text-slate-200 font-mono">{icmpData?.summary.minLatency?.toFixed(1) ?? "—"} ms</span></div>
                </div>
              </div>

              {/* SNMP CPU & Memory */}
              {snmpData ? (
                <div className="space-y-4">
                  <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Cpu className="w-4 h-4 text-cyan-400" />
                        <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                          CPU Utilization (24h)
                        </h3>
                      </div>
                      <span className="text-sm font-bold text-cyan-400 font-mono">
                        {snmpData.summary.avgCpuUtil != null
                          ? `${snmpData.summary.avgCpuUtil.toFixed(1)}%`
                          : "—"}
                      </span>
                    </div>
                    <Sparkline data={cpuSeries} color="#06b6d4" height={36} />
                  </div>

                  <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <HardDrive className="w-4 h-4 text-purple-400" />
                        <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                          Memory Utilization (24h)
                        </h3>
                      </div>
                      <span className="text-sm font-bold text-purple-400 font-mono">
                        {snmpData.summary.avgMemUtil != null
                          ? `${snmpData.summary.avgMemUtil.toFixed(1)}%`
                          : "—"}
                      </span>
                    </div>
                    <Sparkline data={memSeries} color="#a855f7" height={36} />
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-slate-800/30 border border-slate-800 text-center text-xs text-slate-500">
                  SNMP tidak terkonfigurasi atau data belum tersedia
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Navigation Action */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/80 flex items-center justify-between gap-3">
          <Link
            href={`/dashboard/monitoring?device=${deviceId}`}
            onClick={onClose}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition-colors"
          >
            <span>Lihat Full Telemetri ICMP</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
          <Link
            href={`/dashboard/snmp?device=${deviceId}`}
            onClick={onClose}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition-colors border border-slate-700"
          >
            <span>Grafik SNMP</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
