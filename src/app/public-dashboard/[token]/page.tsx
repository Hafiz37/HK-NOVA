"use client";

import { useEffect, useState } from "react";
import { Shield, AlertTriangle } from "lucide-react";

interface SummaryData {
  devices: { total: number; up: number; down: number; unknown: number };
  alerts: { active: number };
  avgLatencyMs: number | null;
}

interface PublicDashboardContentProps {
  token: string;
}

function PublicDashboardContent({ token }: PublicDashboardContentProps) {
  const [valid, setValid] = useState<boolean | null>(null);
  const [summary, setSummary] = useState<SummaryData | null>(null);

  useEffect(() => {
    async function validateAndFetch() {
      try {
        const valRes = await fetch(`/api/dashboards/share?token=${token}`);
        if (!valRes.ok) {
          setValid(false);
          return;
        }
        setValid(true);

        const sumRes = await fetch("/api/monitoring/summary");
        if (sumRes.ok) {
          setSummary(await sumRes.json());
        }
      } catch {
        setValid(false);
      }
    }

    validateAndFetch();
  }, [token]);

  if (valid === null) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 font-mono text-xs">
        Memverifikasi Link Dashboard Public...
      </div>
    );
  }

  if (!valid) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-center p-6 space-y-3">
        <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h1 className="text-lg font-bold text-white">Akses Tidak Sah atau Expired</h1>
        <p className="text-xs text-slate-400 max-w-sm">
          Link public dashboard ini tidak valid atau sudah kadaluarsa. Minta admin untuk membuat link baru.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 space-y-6">
      {/* Readonly Banner */}
      <div className="bg-blue-950/40 border border-blue-800/40 p-4 rounded-xl flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="w-5 h-5 text-blue-400" />
          <div>
            <h1 className="text-sm font-bold text-white">HK-NOVA Public Read-Only NOC Dashboard</h1>
            <p className="text-xs text-slate-400">Mode Tampilan Tamu (Akses Terbatas & Terenkripsi)</p>
          </div>
        </div>
        <span className="px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold rounded-full flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Live Telemetry
        </span>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
          <p className="text-xs uppercase text-slate-400 font-semibold">Total Devices</p>
          <p className="text-3xl font-bold text-white mt-2">{summary?.devices.total ?? 0}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
          <p className="text-xs uppercase text-slate-400 font-semibold">Devices UP</p>
          <p className="text-3xl font-bold text-emerald-400 mt-2">{summary?.devices.up ?? 0}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
          <p className="text-xs uppercase text-slate-400 font-semibold">Devices DOWN</p>
          <p className="text-3xl font-bold text-rose-400 mt-2">{summary?.devices.down ?? 0}</p>
        </div>
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl">
          <p className="text-xs uppercase text-slate-400 font-semibold">Avg Latency</p>
          <p className="text-3xl font-bold text-blue-400 mt-2">
            {summary?.avgLatencyMs != null ? `${summary.avgLatencyMs.toFixed(1)} ms` : "—"}
          </p>
        </div>
      </div>
    </div>
  );
}

interface PublicDashboardPageProps {
  params: Promise<{ token: string }>;
}

export default async function PublicDashboardPage({ params }: PublicDashboardPageProps) {
  const resolvedParams = await params;
  return <PublicDashboardContent token={resolvedParams.token} />;
}