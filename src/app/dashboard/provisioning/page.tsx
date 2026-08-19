"use client";

import { useEffect, useState, useCallback } from "react";
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
  status: "SUCCESS" | "FAILED" | "PENDING";
  ontSerial?: string | null;
  ponPort?: string | null;
  vlan?: number | null;
  command: string;
  response?: string | null;
  errorMessage?: string | null;
  executedAt: string;
  device: { name: string; ip: string; vendor: string | null };
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
  const [action, setAction] = useState("create_service");
  const [templateOverride, setTemplateOverride] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [logs, setLogs] = useState<LogRecord[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; command?: string; response?: string | null } | null>(null);
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

  const setField = (key: string, value: string) => setFields((prev) => ({ ...prev, [key]: value }));

  const run = async () => {
    if (!deviceId || !action) return;
    setRunning(true);
    setResult(null);
    try {
      const payload: Record<string, unknown> = { deviceId, action, ...fields };
      if (templateOverride) payload.template = templateOverride;
      const res = await fetch("/api/provisioning/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult({ ok: false, message: json.error ?? "Provisioning gagal", command: json.data?.command, response: json.data?.response });
      } else {
        setResult({ ok: true, message: json.message ?? "Berhasil", command: json.data?.command, response: json.data?.response });
      }
      await fetchLogs();
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : "Terjadi kesalahan" });
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-slate-400">Memuat template &amp; device…</div>;
  }

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
            <label className="block text-xs font-medium text-slate-400 mb-1.5">Device OLT</label>
            <select value={deviceId} onChange={(e) => { setDeviceId(e.target.value); setResult(null); }} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-blue-500">
              <option value="">— Pilih Device —</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>{d.name} ({d.ip}){d.vendor ? ` · ${d.vendor}` : ""}</option>
              ))}
            </select>
          </div>

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

          <button onClick={() => void run()} disabled={running || !deviceId} className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-medium rounded-xl transition-all">
            {running ? "⏳ Mengeksekusi…" : "▶️ Jalankan Provisioning"}
          </button>

          {result && (
            <div className={`rounded-xl border p-4 text-sm space-y-2 ${result.ok ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300" : "bg-rose-500/10 border-rose-500/30 text-rose-300"}`}>
              <p className="font-semibold">{result.ok ? "✅ " : "❌ "}{result.message}</p>
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
                  <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${l.status === "SUCCESS" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : l.status === "FAILED" ? "bg-rose-500/10 text-rose-400 border-rose-500/30" : "bg-amber-500/10 text-amber-400 border-amber-500/30"}`}>{l.status}</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">{l.device.name} ({l.device.ip}) · {new Date(l.executedAt).toLocaleString("id-ID")}</p>
                {(l.ontSerial || l.ponPort || l.vlan) && (
                  <p className="text-[11px] font-mono text-slate-400 mt-1">
                    {l.ontSerial ? `SN:${l.ontSerial}` : ""} {l.ponPort ? `PON:${l.ponPort}` : ""} {l.vlan ? `VLAN:${l.vlan}` : ""}
                  </p>
                )}
                {l.errorMessage && <p className="text-[11px] text-rose-400 mt-1">{l.errorMessage}</p>}
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