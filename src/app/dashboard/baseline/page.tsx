"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import BaselineBadge, { type DeviationLevel } from "@/components/dashboard/baseline-badge";

interface BaselineDevice {
  device: { id: string; name: string; ip: string; type: string; status: string };
  baseline: { mean: number; stddev: number; p95: number; count: number };
  current: number;
  deviation: { score: number | null; level: DeviationLevel };
}

interface OverviewResponse {
  field: string;
  n: number;
  summary: { devicesAnalyzed: number; warning: number; critical: number; normal: number };
  data: BaselineDevice[];
}

const FIELDS = [
  { key: "cpu", label: "CPU Utilization", unit: "%", href: "/dashboard/snmp" },
  { key: "mem", label: "Memory Utilization", unit: "%", href: "/dashboard/snmp" },
  { key: "latency", label: "Latency", unit: "ms", href: "/dashboard/monitoring" },
  { key: "packetLoss", label: "Packet Loss", unit: "%", href: "/dashboard/monitoring" },
] as const;

const FIELD_COLORS: Record<(typeof FIELDS)[number]["key"], string> = {
  cpu: "text-cyan-400",
  mem: "text-purple-400",
  latency: "text-blue-400",
  packetLoss: "text-rose-400",
};

export default function BaselineOverviewPage() {
  const [field, setField] = useState<(typeof FIELDS)[number]["key"]>("cpu");
  const [n, setN] = useState(10);
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/monitoring/baseline?field=${field}&n=${n}`);
      if (res.ok) setData((await res.json()) as OverviewResponse);
      else setData(null);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [field, n]);

  useEffect(() => {
    const run = async () => { await fetchOverview(); };
    void run();
  }, [fetchOverview]);

  const currentField = FIELDS.find((f) => f.key === field) ?? FIELDS[0];
  const accent = FIELD_COLORS[field];

  const zColor = (level: DeviationLevel) =>
    level === "CRITICAL" ? "text-rose-400" : level === "WARNING" ? "text-amber-400" : "text-emerald-400";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            📊 Baseline Historis
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Perbandingan nilai terkini terhadap rata-rata historis (window 24 jam) per perangkat.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={field}
            onChange={(e) => setField(e.target.value as (typeof FIELDS)[number]["key"])}
            className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {FIELDS.map((f) => (
              <option key={f.key} value={f.key}>{f.label}</option>
            ))}
          </select>
          <select
            value={n}
            onChange={(e) => setN(Number(e.target.value))}
            className="bg-slate-800 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none"
          >
            {[5, 10, 20, 50].map((v) => (
              <option key={v} value={v}>Top {v}</option>
            ))}
          </select>
          <button
            onClick={() => void fetchOverview()}
            className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-4 py-2 rounded-lg transition-colors"
          >
            ↻ Muat
          </button>
        </div>
      </div>

      {/* Summary chips */}
      {data && (
        <div className="flex flex-wrap gap-3 text-xs">
          <span className="px-3 py-1.5 rounded-lg bg-slate-800/70 border border-slate-700/60 text-slate-300">
            📡 {data.summary.devicesAnalyzed} perangkat dianalisis
          </span>
          <span className="px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            🟢 {data.summary.normal} Normal
          </span>
          <span className="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
            🟡 {data.summary.warning} Waspada
          </span>
          <span className="px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400">
            🔴 {data.summary.critical} Kritis
          </span>
        </div>
      )}

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-950/50 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-800">
            <tr>
              <th className="px-5 py-3.5 font-semibold">Peringkat</th>
              <th className="px-5 py-3.5 font-semibold">Perangkat</th>
              <th className="px-5 py-3.5 font-semibold">Status</th>
              <th className="px-5 py-3.5 font-semibold">Nilai Kini</th>
              <th className="px-5 py-3.5 font-semibold">Baseline (mean ± σ)</th>
              <th className="px-5 py-3.5 font-semibold">Z-score</th>
              <th className="px-5 py-3.5 font-semibold">Level</th>
              <th className="px-5 py-3.5 font-semibold text-right">Tindakan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {loading ? (
              <tr>
                <td colSpan={8} className="text-center py-10 text-slate-500">Memuat data…</td>
              </tr>
            ) : !data || data.data.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-10 text-slate-500">
                  Tidak ada perangkat dengan data yang cukup (min. 3 sampel) untuk {currentField.label}.
                </td>
              </tr>
            ) : (
              data.data.map((row, idx) => (
                <tr key={row.device.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="px-5 py-4">
                    <span className="w-7 h-7 inline-flex items-center justify-center rounded-md text-xs font-bold bg-slate-800 text-slate-300">
                      {idx + 1}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <p className="font-medium text-white">{row.device.name}</p>
                    <p className="text-xs font-mono text-slate-500">{row.device.ip}</p>
                  </td>
                  <td className="px-5 py-4 text-xs">{row.device.status}</td>
                  <td className={`px-5 py-4 font-semibold font-mono ${accent}`}>
                    {row.current.toFixed(1)} {currentField.unit}
                  </td>
                  <td className="px-5 py-4 text-slate-400 font-mono">
                    {row.baseline.mean.toFixed(1)} ± {row.baseline.stddev.toFixed(1)}
                    <span className="text-slate-600"> ({row.baseline.count} sampel)</span>
                  </td>
                  <td className={`px-5 py-4 font-mono font-semibold ${zColor(row.deviation.level)}`}>
                    {row.deviation.score != null ? row.deviation.score.toFixed(2) : "—"}
                  </td>
                  <td className="px-5 py-4"><BaselineBadge level={row.deviation.level} /></td>
                  <td className="px-5 py-4 text-right">
                    <Link
                      href={currentField.href}
                      className="inline-block px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-blue-400 text-xs font-medium rounded-lg transition-colors"
                    >
                      Lihat →
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-600">
        Level deviasi berbasis z-score: NORMAL &lt; 2σ · WASPADA 2–3σ · KRITIS &gt; 3σ terhadap baseline 24 jam terakhir.
      </p>
    </div>
  );
}