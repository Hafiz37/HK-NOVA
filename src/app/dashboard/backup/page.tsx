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
  isCompressed: boolean;
  isEncrypted: boolean;
  sizeBytes: number | null;
  compressedBytes: number | null;
  durationMs: number | null;
  sshConnectMs: number | null;
  deletedAt: string | null;
  isProtected: boolean;
  storageLocation: string;
  riskScore: number | null;
  changesSummary: { critical: number; high: number; medium: number; low: number; totalChanges: number } | null;
  device: { id: string; name: string; ip: string; type: string; vendor: string | null };
}

interface BackupDetail {
  id: string;
  timestamp: string;
  configHash: string;
  configContent: string;
  changeDetected: boolean;
  status: string;
  isCompressed: boolean;
  isEncrypted: boolean;
  sizeBytes: number | null;
  compressedBytes: number | null;
  durationMs: number | null;
  sshConnectMs: number | null;
  storageLocation: string;
  archivedAt: string | null;
  riskScore: number | null;
  changesSummary: { critical: number; high: number; medium: number; low: number; totalChanges: number; riskScore: number } | null;
  criticalChanges: { severity: string; section: string; preview: string; patterns: string[] }[] | null;
  device: { id: string; name: string; ip: string; type: string; vendor: string | null };
}

interface DiffLine {
  kind: "same" | "add" | "del";
  text: string;
}

interface BackupHealth {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  issues: string[];
  metrics: {
    deviceCoverage: number;
    successRate: number;
    avgDuration: number;
    storageEfficiency: number;
    criticalChangesRate: number;
  };
  recommendations: string[];
}

interface SearchResult {
  backupId: string;
  deviceId: string;
  deviceName: string;
  deviceIp: string;
  deviceType: string;
  vendor: string | null;
  timestamp: string;
  matches: { lineNumber: number; line: string; contextBefore: string[]; contextAfter: string[] }[];
  storageLocation: string;
}

interface SearchStats {
  totalBackupsSearched: number;
  totalMatches: number;
  devicesWithMatches: number;
  searchTimeMs: number;
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const STATUS_STYLE: Record<string, string> = {
  SUCCESS: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  FAILED: "bg-rose-500/10 text-rose-400 border-rose-500/20",
};

function getGradeColor(grade: string): string {
  switch (grade) {
    case 'A': return 'text-emerald-400';
    case 'B': return 'text-blue-400';
    case 'C': return 'text-amber-400';
    case 'D': return 'text-orange-400';
    case 'F': return 'text-rose-400';
    default: return 'text-slate-400';
  }
}

function getGradeBg(grade: string): string {
  switch (grade) {
    case 'A': return 'bg-emerald-500/10 border-emerald-500/20';
    case 'B': return 'bg-blue-500/10 border-blue-500/20';
    case 'C': return 'bg-amber-500/10 border-amber-500/20';
    case 'D': return 'bg-orange-500/10 border-orange-500/20';
    case 'F': return 'bg-rose-500/10 border-rose-500/20';
    default: return 'bg-slate-500/10 border-slate-500/20';
  }
}

function getSeverityBadge(severity: string): string {
  switch (severity) {
    case 'CRITICAL': return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
    case 'HIGH': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    case 'MEDIUM': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    case 'LOW': return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    default: return 'bg-slate-800 text-slate-400 border-slate-700';
  }
}

function getSeverityIcon(severity: string): string {
  switch (severity) {
    case 'CRITICAL': return '🔴';
    case 'HIGH': return '🟠';
    case 'MEDIUM': return '🔵';
    case 'LOW': return '⚪';
    default: return '⚪';
  }
}

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
  const [restoring, setRestoring] = useState<string | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);
  const [health, setHealth] = useState<BackupHealth | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchStats, setSearchStats] = useState<SearchStats | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [searchUseRegex, setSearchUseRegex] = useState(false);
  const [searchLatestOnly, setSearchLatestOnly] = useState(false);

  const showToast = (ok: boolean, msg: string) => {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 5000);
  };

  const fetchHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const res = await fetch(`/api/backups/health`);
      if (res.ok) {
        const json = await res.json();
        setHealth(json.data);
      }
    } catch { /* silent */ } finally {
      setHealthLoading(false);
    }
  }, []);

  const searchBackups = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearchLoading(true);
    try {
      const params = new URLSearchParams({ q: searchQuery });
      if (searchUseRegex) params.set('useRegex', 'true');
      if (searchLatestOnly) params.set('latestOnly', 'true');
      params.set('limit', '100');
      const res = await fetch(`/api/backups/search?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setSearchResults(json.data ?? []);
        setSearchStats(json.stats ?? null);
      }
    } catch { /* silent */ } finally {
      setSearchLoading(false);
    }
  }, [searchQuery, searchUseRegex, searchLatestOnly]);

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
    void fetchHealth();
  }, [fetchBackups, fetchHealth]);

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

  const restoreBackup = async (backupId: string, dryRun: boolean = false) => {
    if (!deviceId) {
      showToast(false, "Pilih device terlebih dahulu");
      return;
    }
    setRestoring(backupId);
    try {
      const res = await fetch(`/api/devices/${deviceId}/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backupId, dryRun }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Restore gagal");
      showToast(true, dryRun ? json.message ?? "Dry-run selesai" : json.message ?? "Restore selesai");
      if (!dryRun) await fetchBackups();
    } catch (err) {
      showToast(false, err instanceof Error ? err.message : "Restore gagal");
    } finally {
      setRestoring(null);
    }
  };

  const downloadReport = async (format: 'pdf' | 'xlsx') => {
    if (!deviceId) {
      showToast(false, "Pilih device terlebih dahulu untuk laporan per device, atau biarkan kosong untuk semua device");
    }
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30); // Last 30 days
    const endDate = new Date();
    
    setSearchLoading(true); // Reuse loading state
    try {
      const params = new URLSearchParams({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        format,
      });
      if (deviceId) params.set('deviceIds', deviceId);
      
      const res = await fetch(`/api/backups/report?${params.toString()}`);
      if (!res.ok) throw new Error('Gagal generate laporan');
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup-compliance-report-${startDate.toISOString().split('T')[0]}-to-${endDate.toISOString().split('T')[0]}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      showToast(true, `Laporan ${format.toUpperCase()} berhasil diunduh`);
    } catch (err) {
      showToast(false, err instanceof Error ? err.message : 'Gagal mengunduh laporan');
    } finally {
      setSearchLoading(false);
    }
  };

  const buildExportUrl = (format: "csv" | "xlsx" | "pdf") => {
    const params = new URLSearchParams({ format });
    if (deviceId) params.set("deviceId", deviceId);
    return `/api/export/backups?${params.toString()}`;
  };

  const getStorageBadge = (storageLocation: string, isProtected: boolean, deletedAt: string | null) => {
    if (deletedAt) {
      return <span className="px-2 py-0.5 text-xs font-semibold rounded border bg-slate-800/50 text-slate-400 border-slate-700">🗑️ Deleted</span>;
    }
    if (isProtected) {
      return <span className="px-2 py-0.5 text-xs font-semibold rounded border bg-amber-500/10 text-amber-400 border-amber-500/20">📌 Protected</span>;
    }
    if (storageLocation === 'filesystem') {
      return <span className="px-2 py-0.5 text-xs font-semibold rounded border bg-blue-500/10 text-blue-400 border-blue-500/20">📁 Archived</span>;
    }
    return <span className="px-2 py-0.5 text-xs font-semibold rounded border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">💾 Hot</span>;
  };

  const getEncryptionBadge = (isEncrypted: boolean, isCompressed: boolean) => {
    if (isEncrypted && isCompressed) {
      return <span className="px-2 py-0.5 text-xs font-semibold rounded border bg-emerald-500/10 text-emerald-400 border-emerald-500/20" title="Encrypted + Compressed">🔐🗜️</span>;
    }
    if (isEncrypted) {
      return <span className="px-2 py-0.5 text-xs font-semibold rounded border bg-blue-500/10 text-blue-400 border-blue-500/20" title="Encrypted">🔐</span>;
    }
    if (isCompressed) {
      return <span className="px-2 py-0.5 text-xs font-semibold rounded border bg-amber-500/10 text-amber-400 border-amber-500/20" title="Compressed">🗜️</span>;
    }
    return <span className="px-2 py-0.5 text-xs font-semibold rounded border bg-slate-800 text-slate-400 border-slate-700" title="Plain">📄</span>;
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

      {/* Search Panel */}
      <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-4">
        <div className="flex flex-col sm:flex-row gap-4 mb-4">
          <div className="flex-1 flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchBackups()}
              placeholder="Cari konfigurasi... (contoh: vlan 100, interface GigabitEthernet, snmp-server community)"
              className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={searchBackups}
              disabled={searchLoading || !searchQuery.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {searchLoading ? '🔍 Mencari...' : '🔍 Cari'}
            </button>
            <button
              onClick={() => { setSearchMode(!searchMode); setSearchQuery(''); setSearchResults([]); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${searchMode
                ? 'bg-slate-700 text-amber-400'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'}`}
            >
              {searchMode ? '✕ Tutup Pencarian' : '🔍 Pencarian Lanjutan'}
            </button>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={searchUseRegex}
                onChange={(e) => setSearchUseRegex(e.target.checked)}
                className="rounded border-slate-600 text-blue-600 focus:ring-blue-500"
              />
              Regex
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={searchLatestOnly}
                onChange={(e) => setSearchLatestOnly(e.target.checked)}
                className="rounded border-slate-600 text-blue-600 focus:ring-blue-500"
              />
              Hanya Backup Terbaru
            </label>
          </div>
        </div>

        {searchMode && searchResults.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">
                {searchStats?.totalMatches ?? 0} kecocokan di {searchStats?.devicesWithMatches ?? 0} device
                ({searchStats?.searchTimeMs ?? 0}ms)
              </span>
              <span className="text-xs text-slate-500">
                {searchLatestOnly ? 'Backup terbaru per device' : 'Semua backup'}
              </span>
            </div>
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-800/50 border-b border-slate-800 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-4 py-2">Device</th>
                    <th className="px-4 py-2">IP</th>
                    <th className="px-4 py-2">Waktu</th>
                    <th className="px-4 py-2">Kecocokan</th>
                    <th className="px-4 py-2">Storage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {searchResults.slice(0, 20).map((r) => (
                    <tr key={r.backupId} className="hover:bg-slate-800/30 transition-colors cursor-pointer" onClick={() => openDetail(r.backupId)}>
                      <td className="px-4 py-2 font-medium text-white">{r.deviceName}</td>
                      <td className="px-4 py-2 font-mono text-xs text-slate-400">{r.deviceIp}</td>
                      <td className="px-4 py-2 text-slate-300 whitespace-nowrap">{new Date(r.timestamp).toLocaleString("id-ID")}</td>
                      <td className="px-4 py-2">
                        <div className="max-h-32 overflow-y-auto text-[11px] font-mono">
                          {r.matches.slice(0, 5).map((m, i) => (
                            <div key={i} className="text-amber-300">
                              L{m.lineNumber}: {m.line.substring(0, 100)}
                            </div>
                          ))}
                          {r.matches.length > 5 && (
                            <div className="text-slate-500">... +{r.matches.length - 5} lebih</div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-center">
                        {r.storageLocation === 'filesystem' ? (
                          <span className="px-2 py-0.5 text-xs font-semibold rounded border bg-blue-500/10 text-blue-400 border-blue-500/20">📁 Archived</span>
                        ) : (
                          <span className="px-2 py-0.5 text-xs font-semibold rounded border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">💾 Hot</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Health Dashboard */}
      <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`px-4 py-3 rounded-xl border ${getGradeBg(health?.grade ?? 'F')}`}>
              <span className={`text-3xl font-bold ${getGradeColor(health?.grade ?? 'F')}`}>
                {health ? health.grade : '—'}
              </span>
              <span className="ml-2 text-sm text-slate-400">Backup Health</span>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold text-white">{health?.score ?? '—'}</p>
              <p className="text-xs text-slate-400">Score (0-100)</p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="flex items-center gap-4 text-sm text-slate-400">
              <span>📊 Coverage: {health?.metrics.deviceCoverage ?? '—'}%</span>
              <span>✅ Success: {health?.metrics.successRate ?? '—'}%</span>
              <span>⚡ Avg: {health?.metrics.avgDuration ? `${(health.metrics.avgDuration / 1000).toFixed(1)}s` : '—'}</span>
              <span>🗜️ Efficiency: {health?.metrics.storageEfficiency ?? '—'}%</span>
              <span>🔴 Critical: {health?.metrics.criticalChangesRate ?? '—'}%</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => downloadReport('pdf')}
                disabled={searchLoading}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
              >
                📄 PDF Report
              </button>
              <button
                onClick={() => downloadReport('xlsx')}
                disabled={searchLoading}
                className="px-3 py-1.5 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors"
              >
                📊 Excel Report
              </button>
            </div>
          </div>
        </div>
        {(health?.issues?.length ?? 0) > 0 && (
          <div className="mt-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg">
            <p className="text-xs font-semibold text-rose-400 mb-2">⚠️ Issues Detected:</p>
            <ul className="text-xs text-rose-300 space-y-1">
              {health?.issues.map((issue, i) => (
                <li key={i} className="flex items-center gap-2">• {issue}</li>
              ))}
            </ul>
          </div>
        )}
        {(health?.recommendations?.length ?? 0) > 0 && (
          <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
            <p className="text-xs font-semibold text-amber-400 mb-2">💡 Recommendations:</p>
            <ul className="text-xs text-amber-300 space-y-1">
              {health?.recommendations.map((rec, i) => (
                <li key={i} className="flex items-center gap-2">• {rec}</li>
              ))}
            </ul>
          </div>
        )}
        {healthLoading && (
          <div className="mt-4 text-center text-slate-500 text-sm">Loading health metrics...</div>
        )}
      </div>

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
                    <th className="px-4 py-3">Size</th>
                    <th className="px-4 py-3">Encryption</th>
                    <th className="px-4 py-3">Storage</th>
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
                      <td className="px-4 py-3 font-mono text-xs text-slate-400">
                        {formatBytes(b.sizeBytes)}
                        {b.compressedBytes && b.sizeBytes && ` → ${formatBytes(b.compressedBytes)} (${((1 - b.compressedBytes / b.sizeBytes) * 100).toFixed(0)}%)`}
                      </td>
                      <td className="px-4 py-3 text-center">{getEncryptionBadge(b.isEncrypted, b.isCompressed)}</td>
                      <td className="px-4 py-3 text-center">{getStorageBadge(b.storageLocation, b.isProtected, b.deletedAt)}</td>
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
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <p className="text-slate-500">Status Enkripsi</p>
                  <p className="font-medium">
                    {detail.backup.isEncrypted && detail.backup.isCompressed ? '🔐 Encrypted + 🗜️ Compressed' :
                     detail.backup.isEncrypted ? '🔐 Encrypted' :
                     detail.backup.isCompressed ? '🗜️ Compressed' : '📄 Plain'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Storage</p>
                  <p className="font-medium">
                    {detail.backup.storageLocation === 'filesystem' ? '📁 Archived (Filesystem)' : '💾 Hot (Database)'}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500">Ukuran Original</p>
                  <p className="font-medium">{formatBytes(detail.backup.sizeBytes)}</p>
                </div>
                <div>
                  <p className="text-slate-500">Ukuran Tersimpan</p>
                  <p className="font-medium">{formatBytes(detail.backup.compressedBytes)}</p>
                </div>
                <div>
                  <p className="text-slate-500">Durasi Backup</p>
                  <p className="font-medium">{detail.backup.durationMs ? `${detail.backup.durationMs}ms` : '-'}</p>
                </div>
                <div>
                  <p className="text-slate-500">SSH Connect</p>
                  <p className="font-medium">{detail.backup.sshConnectMs ? `${detail.backup.sshConnectMs}ms` : '-'}</p>
                </div>
                {detail.backup.archivedAt && (
                  <div className="col-span-2">
                    <p className="text-slate-500">Diarsipkan</p>
                    <p className="font-medium">{new Date(detail.backup.archivedAt).toLocaleString("id-ID")}</p>
                  </div>
                )}
              </div>
              <hr className="border-slate-800" />
              
              {/* Critical Changes Summary */}
              {(detail.backup.criticalChanges?.length ?? 0) > 0 && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg">
                  <p className="text-xs font-semibold text-rose-400 mb-2 flex items-center gap-2">
                    🔴 {(detail.backup.criticalChanges?.length ?? 0)} Perubahan Kritis/Tinggi Terdeteksi
                  </p>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {detail.backup.criticalChanges?.map((change, i) => (
                      <div key={i} className={`px-2 py-1 text-[10px] rounded ${getSeverityBadge(change.severity)}`}>
                        <span className="flex items-center gap-2">
                          <span>{getSeverityIcon(change.severity)}</span>
                          <span className="font-medium">{change.severity}</span>
                          <span className="text-slate-400">|</span>
                          <span>{change.section}</span>
                          <span className="text-slate-400">|</span>
                          <span>{change.preview}</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Risk Score */}
              {detail.backup.changesSummary && (
                <div className="grid grid-cols-5 gap-2 text-xs">
                  <div className="px-2 py-1 bg-rose-500/10 text-rose-400 rounded text-center">
                    <p className="font-bold">{detail.backup.changesSummary.critical}</p>
                    <p className="text-slate-400">Critical</p>
                  </div>
                  <div className="px-2 py-1 bg-amber-500/10 text-amber-400 rounded text-center">
                    <p className="font-bold">{detail.backup.changesSummary.high}</p>
                    <p className="text-slate-400">High</p>
                  </div>
                  <div className="px-2 py-1 bg-blue-500/10 text-blue-400 rounded text-center">
                    <p className="font-bold">{detail.backup.changesSummary.medium}</p>
                    <p className="text-slate-400">Medium</p>
                  </div>
                  <div className="px-2 py-1 bg-slate-500/10 text-slate-400 rounded text-center">
                    <p className="font-bold">{detail.backup.changesSummary.low}</p>
                    <p className="text-slate-400">Low</p>
                  </div>
                  <div className="px-2 py-1 bg-emerald-500/10 text-emerald-400 rounded text-center">
                    <p className="font-bold">{detail.backup.riskScore ?? 0}</p>
                    <p className="text-slate-400">Risk Score</p>
                  </div>
                </div>
              )}

              <hr className="border-slate-800" />
              
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
              <button
                onClick={() => restoreBackup(detail.backup.id, true)}
                disabled={restoring === detail.backup.id}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
              >
                {restoring === detail.backup.id ? "⏳ Dry-run…" : "🔍 Dry-run Restore"}
              </button>
              <button
                onClick={() => restoreBackup(detail.backup.id, false)}
                disabled={restoring === detail.backup.id}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors"
              >
                {restoring === detail.backup.id ? "⏳ Restoring…" : "🔄 Restore Config"}
              </button>
              <button onClick={() => setDetail(null)} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-xl transition-colors">Tutup</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}