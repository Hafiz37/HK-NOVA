"use client";

import { useEffect, useState, useCallback } from "react";
import { ExportMenu } from "@/components/dashboard/export-menu";

interface BackupRecord {
  id: string;
  timestamp: string;
  configHash: string;
  changeDetected: boolean;
  status: string;
  errorMessage: string | null;
  device: { id: string; name: string; ip: string; type: string; vendor: string | null };
}

interface BackupDetail {
  id: string;
  timestamp: string;
  configHash: string;
  configContent: string;
  changeDetected: boolean;
  status: string;
  device: { id: string; name: string; ip: string; type: string; vendor: string | null };
}

interface DiffLine {
  kind: "same" | "add" | "del";
  text: string;
}

const STATUS_STYLE: Record<string, string> = {
  SUCCESS: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  FAILED: "bg-rose-500/10 text-rose-400 border-rose-500/20",
};

export default function BackupPage() {
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [devices, setDevices] = useState<{ id: string; name: string; ip: string }[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [page, setPage] = useState(1);
  const limit = 20;
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<{ backup: BackupDetail; diff: DiffLine[] | null } | null>(null);
  const [triggering, setTriggering] = useState(false);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  const showToast = (ok: boolean, msg: string) => {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 5000);
  };

  const fetchBackups = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: page.toString(), limit: limit.toString() });
      if (deviceId) params.set("deviceId", deviceId);
      const res = await fetch(`/api/backups?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setBackups(json.data ?? []);
        setTotal(json.pagination?.total ?? 0);
        setTotalPages(json.pagination?.totalPages ?? 0);
      }
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [page, limit, deviceId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchBackups();
  }, [fetchBackups]);

  useEffect(() => {
    let active = true;
    fetch("/api/devices")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (active && Array.isArray(json?.data)) {
          setDevices(json.data.map((d: { id: string; name: string; ip: string }) => ({ id: d.id, name: d.name, ip: d.ip })));
        }
      })
      .catch(() => { /* silent */ });
    return () => { active = false; };
  }, []);

  const openDetail = async (id: string) => {
    try {
      const res = await fetch(`/api/backups/${id}`);
      if (!res.ok) throw new Error("Gagal memuat detail");
      const json = await res.json();
      setDetail({ backup: json.data, diff: json.diff?.lines ?? null });
    } catch (err) {
      showToast(false, err instanceof Error ? err.message : "Gagal memuat detail");
    }
  };

  const triggerBackup = async () => {
    if (!deviceId) {
      showToast(false, "Pilih device terlebih dahulu");
      return;
    }
    setTriggering(true);
    try {
      const res = await fetch(`/api/devices/${deviceId}/backup`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Backup gagal");
      showToast(true, json.message ?? "Backup selesai");
      await fetchBackups();
    } catch (err) {
      showToast(false, err instanceof Error ? err.message : "Backup gagal");
    } finally {
      setTriggering(false);
    }
  };

  const buildExportUrl = (format: "csv" | "xlsx" | "pdf") => {
    const params = new URLSearchParams({ format });
    if (deviceId) params.set("deviceId", deviceId);
    return `/api/export/backups?${params.toString()}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">💾 Backup Konfigurasi</h2>
          <p className="text-slate-400 mt-1 text-sm">Snapshot konfigurasi perangkat (worker otomatis + on-demand)</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={deviceId}
            onChange={(e) => { setDeviceId(e.target.value); setPage(1); }}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 max-w-xs"
          >
            <option value="">Semua Device</option>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>{d.name} ({d.ip})</option>
            ))}
          </select>
          <button
            onClick={triggerBackup}
            disabled={triggering || !deviceId}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
          >
            {triggering ? "🔄 Menjalankan…" : "▶ Backup Sekarang"}
          </button>
          <ExportMenu buildUrl={buildExportUrl} />
        </div>
      </div>

      {toast && (
        <div className={`p-4 rounded-xl border text-sm ${toast.ok ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300" : "bg-rose-500/10 border-rose-500/20 text-rose-300"}`}>
          {toast.msg}
        </div>
      )}

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800/80 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-slate-800/50 animate-pulse rounded" />)}
          </div>
        ) : backups.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <p className="text-3xl mb-2">🗂️</p>
            <p>Tidak ada data backup</p>
            <p className="text-xs mt-1">Jalankan worker atau klik &quot;Backup Sekarang&quot; untuk perangkat dengan kredensial SSH.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-800/50 border-b border-slate-800 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Waktu</th>
                    <th className="px-4 py-3">Device</th>
                    <th className="px-4 py-3">IP</th>
                    <th className="px-4 py-3">Hash</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {backups.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 text-slate-300 whitespace-nowrap">{new Date(b.timestamp).toLocaleString("id-ID")}</td>
                      <td className="px-4 py-3 font-medium text-white">{b.device.name} <span className="text-xs text-slate-500">({b.device.type}{b.device.vendor ? ` · ${b.device.vendor}` : ""})</span></td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-400">{b.device.ip}</td>
                      <td className="px-4 py-3 font-mono text-[10px] text-slate-500">{b.configHash.slice(0, 12)}…</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 text-xs font-semibold rounded border ${STATUS_STYLE[b.status] ?? "bg-slate-800 text-slate-400 border-slate-700"}`}>
                          {b.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => void openDetail(b.id)} className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-blue-400 text-xs font-medium rounded-lg transition-colors">
                          lihat + diff
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="px-4 py-3 border-t border-slate-800 flex items-center justify-between">
                <p className="text-sm text-slate-400">Menampilkan {(page - 1) * limit + 1} - {Math.min(page * limit, total)} dari {total}</p>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 disabled:opacity-50 transition-colors">Sebelumnya</button>
                  <span className="text-sm text-slate-300">Halaman {page}/{totalPages}</span>
                  <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 disabled:opacity-50 transition-colors">Selanjutnya</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail modal */}
      {detail && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white">{detail.backup.device.name} — Snapshot</h3>
                <p className="text-xs text-slate-500">{new Date(detail.backup.timestamp).toLocaleString("id-ID")}</p>
              </div>
              <button onClick={() => setDetail(null)} className="text-slate-400 hover:text-white text-xl leading-none">✕</button>
            </div>
            <div className="flex-1 overflow-auto p-4 space-y-4">
              {detail.diff ? (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase mb-2">
                    Diff vs snapshot sebelumnya ({detail.diff.filter((l) => l.kind !== "same").length} perubahan)
                  </p>
                  <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-x-auto">
                    <pre className="text-[11px] leading-relaxed p-3">
                      {detail.diff.map((line, i) => (
                        <div key={i} className={
                          line.kind === "add" ? "bg-emerald-500/10 text-emerald-300" :
                          line.kind === "del" ? "bg-rose-500/10 text-rose-300" : "text-slate-500"
                        }>
                          {line.kind === "add" ? "+ " : line.kind === "del" ? "- " : "  "}{line.text}
                        </div>
                      ))}
                    </pre>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase mb-2">Konfigurasi (full)</p>
                  <pre className="text-[11px] text-slate-300 bg-slate-950 border border-slate-800 rounded-lg p-3 overflow-x-auto max-h-[50vh]">
                    {detail.backup.configContent}
                  </pre>
                </div>
              )}
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-800">
              <button onClick={() => setDetail(null)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-xl transition-colors">Tutup</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}