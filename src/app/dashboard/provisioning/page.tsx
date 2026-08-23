"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { ExportMenu } from "@/components/dashboard/export-menu";

interface TemplateMeta {
  name: string;
  actions: Array<{
    action: string;
    description: string;
    requiredFields: string[];
  }>;
}

interface LogRecord {
  id: string;
  action: string;
  status: "SUCCESS" | "FAILED" | "PENDING" | "DRY_RUN";
  ontSerial?: string | null;
  ponPort?: string | null;
  vlan?: number | null;
  command: string;
  response?: string | null;
  errorMessage?: string | null;
  executedAt: string;
  device: { name: string; ip: string; vendor: string | null };
  templateName?: string | null;
  executionMode?: "EXECUTE" | "DRY_RUN" | "SCHEDULED";
  executionTimeMs?: number | null;
  isRollback?: boolean;
  rollbackLogId?: string | null;
}

const ACTION_LABELS: Record<string, string> = {
  create_service: "🆕 Create Service",
  suspend_service: "⏸️ Suspend",
  reactivate_service: "▶️ Reactivate",
  terminate_service: "🗑️ Terminate",
  check_status: "🔎 Status Check",
};

const FIELD_LABELS: Record<string, string> = {
  ponPort: "PON Port (mis: 0/1)",
  ontSlot: "ONT Slot/Fen",
  ontSerial: "ONT Serial (SN)",
  vlan: "VLAN (1-4094)",
  serviceProfile: "Service Profile ID",
  lineProfile: "Line Profile ID",
  tcontProfile: "T-CONT Profile",
  ontType: "ONT Type",
  servicePort: "Service Port",
};

interface DevicesOption {
  id: string;
  name: string;
  ip: string;
  vendor: string | null;
  type: string;
}

export default function ProvisioningPage() {
  const [devices, setDevices] = useState<DevicesOption[]>([]);
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [deviceIds, setDeviceIds] = useState<string[]>([]);
  const [mode, setMode] = useState<'single' | 'multi'>('single');
  const [action, setAction] = useState("create_service");
  const [templateOverride, setTemplateOverride] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [dryRun, setDryRun] = useState(true);
  const [logs, setLogs] = useState<LogRecord[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; command?: string; response?: string | null; executionMode?: string; executionTimeMs?: number | null } | null>(null);
  const [loading, setLoading] = useState(true);

  const LOG_PAGE_SIZE = 15;

  const selectedDevice = devices.find((d) => d.id === deviceId)?.vendor ?? "";
  const activeTemplate =
    templates.find((t) => t.name === templateOverride) ??
    (selectedDevice.toLowerCase().includes("huawei")
      ? templates.find((t) => t.name === "huawei")
      : selectedDevice.toLowerCase().includes("zte")
        ? templates.find((t) => t.name === "zte")
        : templates.find((t) => t.name === "generic"));

  const activeAction = activeTemplate?.actions.find((a) => a.action === action);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch("/api/devices").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/provisioning/olt-templates").then((r) => (r.ok ? r.json() : null)),
    ]).then(([devJson, tplJson]) => {
      if (!active) return;
      if (Array.isArray(devJson?.data)) setDevices(devJson.data as DevicesOption[]);
      if (Array.isArray(tplJson?.data)) setTemplates(tplJson.data);
    }).catch(() => { /* silent */ }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: page.toString(), limit: LOG_PAGE_SIZE.toString() });
      if (deviceId) params.set("deviceId", deviceId);
      const res = await fetch(`/api/provisioning/logs?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setLogs(json.data ?? []);
        setTotalPages(json.pagination?.totalPages ?? 0);
      }
    } catch { /* silent */ }
  }, [page, deviceId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchLogs();
  }, [fetchLogs]);

  // SSE for real-time updates
  const eventSourceRef = useRef<EventSource | null>(null);
  
  useEffect(() => {
    if (!deviceId) return;
    
    const es = new EventSource(`/api/provisioning/events?type=all&deviceId=${deviceId}`);
    eventSourceRef.current = es;
    
    es.onmessage = (event) => {
      // Handle ping messages
    };
    
    es.addEventListener('provisioning_update', (event) => {
      try {
        const data = JSON.parse(event.data);
        setLogs((prev) => prev.map((log) => 
          log.id === data.logId 
            ? { ...log, status: data.status, executionMode: data.executionMode, executionTimeMs: data.executionTimeMs }
            : log
        ));
      } catch {}
    });
    
    es.addEventListener('batch_update', (event) => {
      // Could show batch progress toast or update a batch status panel
      console.log('Batch update:', JSON.parse(event.data));
    });
    
    es.addEventListener('scheduled_update', (event) => {
      console.log('Scheduled update:', JSON.parse(event.data));
    });
    
    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [deviceId]);

  const setField = (key: string, value: string) => setFields((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    if (!deviceId || !action) return;
    setRunning(true);
    setResult(null);
    try {
      const payload: Record<string, unknown> = { deviceId, action, ...fields, dryRun };
      if (templateOverride) payload.template = templateOverride;
      const res = await fetch("/api/provisioning/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult({ ok: false, message: json.error ?? "Provisioning gagal", command: json.data?.command, response: json.data?.response, executionMode: json.data?.executionMode, executionTimeMs: json.data?.executionTimeMs });
      } else {
        setResult({ ok: true, message: json.message ?? "Berhasil", command: json.data?.command, response: json.data?.response, executionMode: json.data?.executionMode, executionTimeMs: json.data?.executionTimeMs });
      }
      await fetchLogs();
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : "Terjadi kesalahan" });
    } finally {
      setRunning(false);
    }
  };

  const runMulti = async () => {
    if (deviceIds.length === 0 || !action) return;
    setRunning(true);
    setResult(null);
    try {
      const payload: Record<string, unknown> = { deviceIds, action, ...fields, dryRun };
      if (templateOverride) payload.template = templateOverride;
      const res = await fetch("/api/provisioning/multi-device", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult({ ok: false, message: json.error ?? "Multi-device provisioning gagal", command: undefined, response: JSON.stringify(json.data) });
      } else {
        setResult({ ok: true, message: json.message ?? "Berhasil", command: undefined, response: JSON.stringify(json.data) });
      }
      await fetchLogs();
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : "Terjadi kesalahan" });
    } finally {
      setRunning(false);
    }
  };

if (loading) {
    return <div className="p-6 text-slate-400">Memuat template & device…</div>;
  }

  const getStatusColor = (status: string, executionMode?: string) => {
    if (executionMode === "DRY_RUN" || status === "DRY_RUN") {
      return "bg-blue-500/10 text-blue-400 border-blue-500/30";
    }
    if (status === "SUCCESS") {
      return "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
    }
    if (status === "FAILED") {
      return "bg-rose-500/10 text-rose-400 border-rose-500/30";
    }
    return "bg-amber-500/10 text-amber-400 border-amber-500/30";
  };

  const getStatusLabel = (status: string, executionMode?: string) => {
    if (executionMode === "DRY_RUN" || status === "DRY_RUN") {
      return "🔍 DRY RUN";
    }
    return status;
  };

  const canRollback = (action: string) => {
    const rollbackMap: Record<string, string | null> = {
      create_service: 'terminate_service',
      suspend_service: 'reactivate_service',
      reactivate_service: 'suspend_service',
      terminate_service: null,
      check_status: null,
    };
    return rollbackMap[action] !== null;
  };

  const handleRollback = async (logId: string, dryRun: boolean) => {
    try {
      const res = await fetch(`/api/provisioning/logs/${logId}/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun, reason: dryRun ? 'Preview rollback' : 'Manual rollback via UI' }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(`Rollback gagal: ${json.error}`);
      } else {
        alert(json.message);
        await fetchLogs();
      }
    } catch (err) {
      alert(`Rollback error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">📡 Provisi OLT / ONT</h2>
          <p className="text-slate-400 mt-1 text-sm">Jalankan aktivasi / suspend / reactivate / terminasi pelanggan via template vendor</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: form */}
        <div className="bg-slate-900 border border-slate-800/80 rounded-2xl p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Mode Eksekusi</label>
            <select value={mode} onChange={(e) => { setMode(e.target.value as 'single' | 'multi'); setResult(null); }} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500">
              <option value="single">🖥️ Single Device</option>
              <option value="multi">🌐 Multi-Device (hingga 20 OLT)</option>
            </select>
          </div>

          {mode === 'single' ? (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Device OLT</label>
              <select value={deviceId} onChange={(e) => { setDeviceId(e.target.value); setResult(null); }} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500">
                <option value="">— Pilih Device —</option>
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>{d.name} ({d.ip}){d.vendor ? ` · ${d.vendor}` : ""}</option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Pilih Device OLT (Multiple)</label>
              <div className="max-h-48 overflow-y-auto bg-slate-950 border border-slate-800 rounded-xl p-3 space-y-2">
                {devices.map((d) => (
                  <label key={d.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={deviceIds.includes(d.id)}
                      onChange={(e) => setDeviceIds(e.target.checked ? [...deviceIds, d.id] : deviceIds.filter((id) => id !== d.id))}
                      className="w-4 h-4 text-blue-600 bg-slate-900 border-slate-700 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-slate-300">{d.name} ({d.ip}){d.vendor ? ` · ${d.vendor}` : ""}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-slate-500 mt-1">{deviceIds.length} device dipilih</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Aksi</label>
              <select value={action} onChange={(e) => { setAction(e.target.value); setResult(null); }} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500">
                {activeTemplate?.actions.map((a) => (
                  <option key={a.action} value={a.action}>{ACTION_LABELS[a.action] ?? a.action}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Template (opsional)</label>
              <select value={templateOverride} onChange={(e) => { setTemplateOverride(e.target.value); setResult(null); }} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500">
                <option value="">Otomatis (vendor)</option>
                {templates.map((t) => <option key={t.name} value={t.name}>{t.name.toUpperCase()}</option>)}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-slate-950 border border-slate-800 rounded-xl">
            <input
              type="checkbox"
              id="dryRun"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              className="w-4 h-4 text-blue-600 bg-slate-900 border-slate-700 rounded focus:ring-blue-500"
            />
            <label htmlFor="dryRun" className="text-sm text-slate-300 cursor-pointer">
              🔍 Dry-run mode (preview saja, tidak eksekusi ke device)
            </label>
          </div>

          {activeAction && (
            <div className="rounded-xl bg-slate-950 border border-slate-800 p-3 text-sm text-slate-400">{activeAction.description}</div>
          )}

          {activeAction?.requiredFields.length ? (
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-400 uppercase">Field wajib ({activeAction.requiredFields.length})</p>
              {activeAction.requiredFields.map((f) => (
                <div key={f}>
                  <label className="block text-xs font-medium text-slate-400 mb-1">{FIELD_LABELS[f] ?? f}</label>
                  <input
                    type={f === "vlan" ? "number" : "text"}
                    value={fields[f] ?? ""}
                    onChange={(e) => setField(f, e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">Tidak ada field tambahan untuk aksi ini.</p>
          )}

          <button onClick={() => void (mode === 'single' ? run() : runMulti())} disabled={running || (mode === 'single' ? !deviceId : deviceIds.length === 0) || !action} className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium rounded-xl transition-all">
            {running ? "⏳ Mengeksekusi…" : (dryRun ? "🔍 Preview (Dry-Run)" : mode === 'single' ? "▶️ Jalankan Provisioning" : "🌐 Jalankan Multi-Device")}
          </button>

          {result && (
            <div className={`rounded-xl border p-4 text-sm space-y-2 ${result.ok ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-rose-500/10 border-rose-500/30 text-rose-300"}`}>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold">{result.ok ? "✅ " : "❌ "}{result.message}</p>
                {result.executionMode && (
                  <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${result.executionMode === "DRY_RUN" ? "bg-blue-500/10 text-blue-400 border-blue-500/30" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"}`}>
                    {result.executionMode}
                  </span>
                )}
              </div>
              {result.executionTimeMs !== undefined && result.executionTimeMs !== null && (
                <p className="text-xs text-slate-400">⏱️ Waktu eksekusi: {result.executionTimeMs} ms</p>
              )}
              {result.command && (
                <pre className="text-[10px] bg-slate-950 p-2 rounded-lg overflow-x-auto text-slate-300">{result.command}</pre>
              )}
              {result.response && (
                <pre className="text-[10px] bg-slate-950 p-2 rounded-lg overflow-x-auto text-slate-300 max-h-48">{result.response}</pre>
              )}
            </div>
          )}
        </div>

        {/* Right: log history */}
        <div className="bg-slate-900 border border-slate-800/80 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-white">Riwayat Provisioning</h3>
            <ExportMenu buildUrl={(format) => { const p = new URLSearchParams({ format }); if (deviceId) p.set("deviceId", deviceId); return `/api/export/provisioning?${p.toString()}`; }} />
          </div>
          <div className="space-y-2 max-h-[60vh] overflow-auto">
            {logs.length === 0 ? (
              <p className="text-slate-500 text-sm">Belum ada log provisioning.</p>
            ) : logs.map((l) => (
              <div key={l.id} className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-white">{ACTION_LABELS[l.action] ?? l.action}</span>
                  <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${getStatusColor(l.status, l.executionMode)}`}>
                    {getStatusLabel(l.status, l.executionMode)}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">{l.device.name} ({l.device.ip}) · {new Date(l.executedAt).toLocaleString("id-ID")}</p>
                {(l.ontSerial || l.ponPort || l.vlan) && (
                  <p className="text-[11px] font-mono text-slate-400 mt-1">
                    {l.ontSerial ? `SN:${l.ontSerial}` : ""} {l.ponPort ? `PON:${l.ponPort}` : ""} {l.vlan ? `VLAN:${l.vlan}` : ""}
                  </p>
                )}
                {l.templateName && <p className="text-[11px] text-blue-400 mt-1">Template: {l.templateName.toUpperCase()}</p>}
                {l.executionMode && <p className="text-[11px] text-slate-400 mt-1">Mode: {l.executionMode}</p>}
                {l.executionTimeMs !== undefined && l.executionTimeMs !== null && (
                  <p className="text-[11px] text-slate-400 mt-1">⏱️ {l.executionTimeMs} ms</p>
                )}
                {l.errorMessage && <p className="text-[11px] text-rose-400 mt-1">{l.errorMessage}</p>}
                {canRollback(l.action) && !l.isRollback && (
                  <div className="flex gap-2 mt-2 pt-2 border-t border-slate-800">
                    <button
                      onClick={() => handleRollback(l.id, true)}
                      className="px-2 py-1 text-[10px] bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded hover:bg-blue-500/30 transition-colors"
                    >
                      🔍 Preview Rollback
                    </button>
                    <button
                      onClick={() => handleRollback(l.id, false)}
                      className="px-2 py-1 text-[10px] bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded hover:bg-amber-500/30 transition-colors"
                    >
                      ↩️ Execute Rollback
                    </button>
                  </div>
                )}
                {l.isRollback && (
                  <p className="text-[11px] text-blue-400 mt-1">↩️ Ini adalah rollback dari log lain</p>
                )}
                {l.rollbackLogId && (
                  <p className="text-[11px] text-blue-400 mt-1">↩️ Sudah di-rollback oleh log: {l.rollbackLogId.slice(0, 8)}...</p>
                )}
              </div>
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-2 mt-4">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 disabled:opacity-50 transition-colors">Sebelumnya</button>
              <span className="text-sm text-slate-300">Halaman {page}/{totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 disabled:opacity-50 transition-colors">Selanjutnya</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}