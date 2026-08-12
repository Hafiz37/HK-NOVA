"use client";

import { useEffect, useState, useCallback } from "react";

interface Device {
  id: string;
  name: string;
  ip: string;
  type: string;
  vendor: string | null;
  model: string | null;
  location: string | null;
  status: "UP" | "DOWN" | "UNKNOWN" | "MAINTENANCE";
  description: string | null;
  latestLatency: number | null;
  latestPacketLoss: number | null;
  lastCheck: string | null;
  activeAlerts: Array<{ id: string; type: string; severity: string; message: string }>;
}

const DEVICE_TYPES = ["ROUTER", "SWITCH", "OLT", "ONT", "FIREWALL", "SERVER", "OTHER"];
const DEVICE_STATUSES = ["UP", "DOWN", "UNKNOWN", "MAINTENANCE"];

const EMPTY_FORM = {
  name: "", ip: "", type: "ROUTER", vendor: "", model: "",
  location: "", description: "", snmpCommunity: "public",
  sshPort: "22", sshUsername: "", sshPassword: "",
};

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { dot: string; text: string; ring: string }> = {
    UP:          { dot: "bg-emerald-400 animate-pulse", text: "text-emerald-400", ring: "border-emerald-500/20 bg-emerald-500/10" },
    DOWN:        { dot: "bg-rose-400 animate-pulse",    text: "text-rose-400",    ring: "border-rose-500/20 bg-rose-500/10" },
    MAINTENANCE: { dot: "bg-amber-400",                 text: "text-amber-400",   ring: "border-amber-500/20 bg-amber-500/10" },
    UNKNOWN:     { dot: "bg-slate-500",                 text: "text-slate-400",   ring: "border-slate-700 bg-slate-800" },
  };
  const s = map[status] ?? map.UNKNOWN;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full border ${s.ring} ${s.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {status}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    ROUTER:   "bg-blue-500/10 text-blue-400 border-blue-500/20",
    SWITCH:   "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    OLT:      "bg-purple-500/10 text-purple-400 border-purple-500/20",
    ONT:      "bg-violet-500/10 text-violet-400 border-violet-500/20",
    FIREWALL: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    SERVER:   "bg-teal-500/10 text-teal-400 border-teal-500/20",
    OTHER:    "bg-slate-800 text-slate-400 border-slate-700",
  };
  return (
    <span className={`px-2 py-0.5 text-xs font-semibold rounded border ${colors[type] ?? colors.OTHER}`}>
      {type}
    </span>
  );
}

export default function DevicesPage() {
  const [devices, setDevices]         = useState<Device[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState("");
  const [filterType, setFilterType]   = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [toast, setToast]             = useState<{ ok: boolean; msg: string } | null>(null);

  // Modal states
  const [isAddOpen, setIsAddOpen]         = useState(false);
  const [editDevice, setEditDevice]       = useState<Device | null>(null);
  const [deleteId, setDeleteId]           = useState<string | null>(null);
  const [viewDevice, setViewDevice]       = useState<Device | null>(null);
  const [submitting, setSubmitting]       = useState(false);
  const [testLoading, setTestLoading]     = useState<"icmp" | "snmp" | "ssh" | null>(null);
  const [testResult, setTestResult]       = useState<{ type: string; ok: boolean; message: string } | null>(null);

  const [form, setForm] = useState(EMPTY_FORM);
  const setField = (k: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  const showToast = (ok: boolean, msg: string) => {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (search)       p.append("search", search);
      if (filterType)   p.append("type", filterType);
      if (filterStatus) p.append("status", filterStatus);
      const res = await fetch(`/api/devices?${p}`);
      if (res.ok) setDevices((await res.json()).data ?? []);
    } catch { /* silent */ } finally { setLoading(false); }
  }, [search, filterType, filterStatus]);

  useEffect(() => {
    const t = setTimeout(() => void fetchDevices(), 300);
    return () => clearTimeout(t);
  }, [fetchDevices]);

  // ── Open modals ──────────────────────────────────────────────────────────────
  const openAdd = () => { setForm(EMPTY_FORM); setIsAddOpen(true); };
  const openEdit = (d: Device) => {
    setEditDevice(d);
    setForm({ name: d.name, ip: d.ip, type: d.type, vendor: d.vendor ?? "",
      model: d.model ?? "", location: d.location ?? "", description: d.description ?? "",
      snmpCommunity: "public", sshPort: "22", sshUsername: "", sshPassword: "" });
  };
  const closeAll = () => {
    setIsAddOpen(false);
    setEditDevice(null);
    setDeleteId(null);
    setViewDevice(null);
    setTestResult(null);
    setTestLoading(null);
  };

  const runConnectionTest = async (deviceId: string, type: "icmp" | "snmp" | "ssh") => {
    setTestLoading(type);
    setTestResult(null);
    try {
      const res = await fetch(`/api/devices/${deviceId}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Test gagal");
      setTestResult({
        type,
        ok: Boolean(json.data?.success),
        message: json.data?.message ?? "Selesai",
      });
    } catch (err) {
      setTestResult({
        type,
        ok: false,
        message: err instanceof Error ? err.message : "Test gagal",
      });
    } finally {
      setTestLoading(null);
    }
  };

  // ── Save (add / edit) ────────────────────────────────────────────────────────
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const isEdit = !!editDevice;
    const url    = isEdit ? `/api/devices/${editDevice!.id}` : "/api/devices";
    try {
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name, ip: form.ip, type: form.type,
          vendor: form.vendor || null, model: form.model || null,
          location: form.location || null, description: form.description || null,
          credentials: form.snmpCommunity ? {
            snmpCommunity: form.snmpCommunity,
            sshPort: Number(form.sshPort) || 22,
            sshUsername: form.sshUsername || null,
            sshPassword: form.sshPassword || null,
          } : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Gagal menyimpan device");
      showToast(true, isEdit ? "Device berhasil diperbarui!" : "Device berhasil ditambahkan!");
      closeAll();
      await fetchDevices();
    } catch (err) {
      showToast(false, err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally { setSubmitting(false); }
  };

  // ── Delete ───────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/devices/${deleteId}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Gagal menghapus device");
      showToast(true, "Device berhasil dihapus");
      closeAll();
      await fetchDevices();
    } catch (err) {
      showToast(false, err instanceof Error ? err.message : "Gagal menghapus device");
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Manajemen Device</h2>
          <p className="text-slate-400 text-sm mt-1">Kelola perangkat jaringan router, switch, OLT, dan firewall</p>
        </div>
        <button onClick={openAdd} className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm rounded-xl shadow-lg shadow-blue-500/20 transition-all active:scale-95">
          ➕ Tambah Device
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`flex items-center justify-between p-4 rounded-xl border text-sm ${toast.ok ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300" : "bg-rose-500/10 border-rose-500/20 text-rose-300"}`}>
          <span>{toast.msg}</span>
          <button onClick={() => setToast(null)} className="ml-4 text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-4 flex flex-col md:flex-row gap-3">
        <div className="flex-1 relative">
          <span className="absolute left-3 top-2.5 text-slate-500 text-sm">🔍</span>
          <input type="text" placeholder="Cari nama, IP, vendor, atau lokasi…"
            value={search} onChange={e => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500" />
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-blue-500">
          <option value="">Semua Tipe</option>
          {DEVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-blue-500">
          <option value="">Semua Status</option>
          {DEVICE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={() => void fetchDevices()} title="Refresh"
          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 text-sm transition-colors">
          🔄
        </button>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800/80 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-950/60 border-b border-slate-800 text-xs font-semibold uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-5 py-4">Perangkat</th>
                <th className="px-5 py-4">IP Address</th>
                <th className="px-5 py-4">Tipe</th>
                <th className="px-5 py-4">Status</th>
                <th className="px-5 py-4">Vendor / Model</th>
                <th className="px-5 py-4">Lokasi</th>
                <th className="px-5 py-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {loading ? (
                [1,2,3,4,5].map(i => (
                  <tr key={i} className="animate-pulse">
                    {[32,24,16,16,28,20,12].map((w,j) => (
                      <td key={j} className="px-5 py-4">
                        <div className={`h-4 w-${w} bg-slate-800 rounded ${j===6?"ml-auto":""}`} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : devices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-14 text-center">
                    <div className="text-3xl mb-2">📡</div>
                    <p className="font-medium text-slate-400">Tidak ada device ditemukan</p>
                    <p className="text-xs text-slate-500 mt-1">Sesuaikan filter atau tambahkan device baru.</p>
                  </td>
                </tr>
              ) : devices.map(d => (
                <tr key={d.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="px-5 py-4">
                    <p className="font-semibold text-white">{d.name}</p>
                    {d.latestLatency !== null && (
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        <span className="text-emerald-400 font-mono">{d.latestLatency}ms</span>
                        {" | "}
                        <span className="font-mono">{d.latestPacketLoss ?? 0}% loss</span>
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-4 font-mono text-slate-200">{d.ip}</td>
                  <td className="px-5 py-4"><TypeBadge type={d.type} /></td>
                  <td className="px-5 py-4"><StatusBadge status={d.status} /></td>
                  <td className="px-5 py-4 text-slate-400">
                    {d.vendor ?? "—"}{d.model ? ` (${d.model})` : ""}
                  </td>
                  <td className="px-5 py-4 text-slate-400">{d.location ?? "—"}</td>
                  <td className="px-5 py-4 text-right">
                    <div className="inline-flex gap-1.5">
                      <button onClick={() => { setTestResult(null); setViewDevice(d); }}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-colors">
                        Detail
                      </button>
                      <button onClick={() => openEdit(d)}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-blue-400 text-xs font-medium rounded-lg transition-colors">
                        Edit
                      </button>
                      <button onClick={() => setDeleteId(d.id)}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-rose-900/50 hover:text-rose-400 text-slate-400 text-xs font-medium rounded-lg transition-colors">
                        Hapus
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && devices.length > 0 && (
          <div className="px-5 py-3 border-t border-slate-800 text-xs text-slate-500">
            {devices.length} device{devices.length > 1 ? "s" : ""} ditampilkan
          </div>
        )}
      </div>

      {/* ── Add / Edit Modal ── */}
      {(isAddOpen || editDevice) && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl max-h-[90vh] overflow-y-auto">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <h3 className="text-lg font-bold text-white">
                {editDevice ? `Edit: ${editDevice.name}` : "Tambah Device Baru"}
              </h3>
              <button onClick={closeAll} className="text-slate-400 hover:text-white text-xl leading-none">✕</button>
            </div>

            <form onSubmit={handleSave} className="px-6 py-5 space-y-4">
              {/* Row 1 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-medium text-slate-400 mb-1">Nama Device *</label>
                  <input required placeholder="Core Router Jakarta"
                    value={form.name} onChange={setField("name")}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="block text-xs font-medium text-slate-400 mb-1">IP Address *</label>
                  <input required placeholder="192.168.1.1"
                    value={form.ip} onChange={setField("ip")}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500" />
                </div>
              </div>

              {/* Row 2 */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Tipe *</label>
                  <select value={form.type} onChange={setField("type")}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
                    {DEVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Vendor</label>
                  <input placeholder="Cisco / Mikrotik"
                    value={form.vendor} onChange={setField("vendor")}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Model</label>
                  <input placeholder="ASR1000"
                    value={form.model} onChange={setField("model")}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
                </div>
              </div>

              {/* Row 3 */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Lokasi</label>
                  <input placeholder="DC Jakarta"
                    value={form.location} onChange={setField("location")}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">SNMP Community</label>
                  <input placeholder="public"
                    value={form.snmpCommunity} onChange={setField("snmpCommunity")}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-blue-500" />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Deskripsi</label>
                <textarea rows={2} placeholder="Catatan opsional…"
                  value={form.description} onChange={setField("description")}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 resize-none" />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <button type="button" onClick={closeAll}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-xl transition-colors">
                  Batal
                </button>
                <button type="submit" disabled={submitting}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-sm font-medium rounded-xl shadow-lg shadow-blue-500/20 transition-all">
                  {submitting ? "Menyimpan…" : "Simpan Device"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Detail Modal ── */}
      {viewDevice && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <TypeBadge type={viewDevice.type} />
                <h3 className="text-base font-bold text-white">{viewDevice.name}</h3>
              </div>
              <button onClick={closeAll} className="text-slate-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="px-6 py-5 space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3 bg-slate-950/50 p-4 rounded-xl border border-slate-800/60">
                {[
                  ["IP Address", viewDevice.ip],
                  ["Status", null],
                  ["Vendor", viewDevice.vendor ?? "—"],
                  ["Model", viewDevice.model ?? "—"],
                  ["Lokasi", viewDevice.location ?? "—"],
                ].map(([label, val]) => (
                  <div key={String(label)}>
                    <p className="text-xs text-slate-500">{label}</p>
                    {label === "Status"
                      ? <StatusBadge status={viewDevice.status} />
                      : <p className={`font-medium text-white ${label === "IP Address" ? "font-mono" : ""}`}>{val}</p>}
                  </div>
                ))}
              </div>

              {viewDevice.latestLatency !== null && (
                <div className="flex gap-4 text-center bg-slate-950/50 p-3 rounded-xl border border-slate-800/60">
                  <div className="flex-1">
                    <p className="text-xs text-slate-500">Latency</p>
                    <p className="text-lg font-bold text-emerald-400 font-mono">{viewDevice.latestLatency}ms</p>
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-slate-500">Packet Loss</p>
                    <p className="text-lg font-bold text-white font-mono">{viewDevice.latestPacketLoss ?? 0}%</p>
                  </div>
                </div>
              )}

              {viewDevice.description && (
                <p className="text-xs text-slate-400 bg-slate-950 px-3 py-2 rounded-lg border border-slate-800">
                  {viewDevice.description}
                </p>
              )}

              {viewDevice.activeAlerts.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-rose-400 mb-1">⚠ Active Alerts ({viewDevice.activeAlerts.length})</p>
                  <div className="space-y-1">
                    {viewDevice.activeAlerts.map(a => (
                      <p key={a.id} className="text-xs text-slate-400 bg-rose-500/5 border border-rose-500/10 px-3 py-1.5 rounded-lg truncate">
                        [{a.severity}] {a.message}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 py-3 border-t border-slate-800 space-y-2">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Test Koneksi</p>
              <div className="flex flex-wrap gap-2">
                {(["icmp", "snmp", "ssh"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    disabled={testLoading === t}
                    onClick={() => void runConnectionTest(viewDevice.id, t)}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 disabled:opacity-50 uppercase"
                  >
                    {testLoading === t ? "…" : t}
                  </button>
                ))}
              </div>
              {testResult && (
                <p className={`text-xs rounded-lg px-3 py-2 border ${
                  testResult.ok
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"
                    : "bg-rose-500/10 border-rose-500/20 text-rose-300"
                }`}>
                  [{testResult.type.toUpperCase()}] {testResult.message}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-800">
              <button onClick={() => { setViewDevice(null); openEdit(viewDevice); }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-xl transition-colors">
                Edit Device
              </button>
              <button onClick={closeAll}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-xl transition-colors">
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ── */}
      {deleteId && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4">
            <div className="w-12 h-12 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-center justify-center text-2xl mx-auto">⚠️</div>
            <div className="text-center">
              <h3 className="text-base font-bold text-white">Konfirmasi Hapus Device</h3>
              <p className="text-sm text-slate-400 mt-1">
                Device akan di-nonaktifkan (soft delete). Data historis metric dan alert tetap tersimpan.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={closeAll}
                className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-xl transition-colors">
                Batal
              </button>
              <button onClick={() => void handleDelete()}
                className="flex-1 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-sm font-medium rounded-xl shadow-lg shadow-rose-500/20 transition-all">
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
