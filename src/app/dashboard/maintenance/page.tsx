"use client";

import { useState, useEffect, useCallback } from "react";
import { Wrench, Plus, Trash2, Power, ShieldAlert } from "lucide-react";

interface Device {
  id: string;
  name: string;
  ip: string;
}

interface MaintenanceWindow {
  id: string;
  name: string;
  deviceId?: string | null;
  device?: Device | null;
  startAt: string;
  endAt: string;
  reason?: string | null;
  isActive: boolean;
}

export default function MaintenancePage() {
  const [windows, setWindows] = useState<MaintenanceWindow[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);

  // Form State
  const [name, setName] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [resWin, resDev] = await Promise.all([
        fetch("/api/maintenance-windows"),
        fetch("/api/devices"),
      ]);

      const dataWin = await resWin.json();
      const dataDev = await resDev.json();

      if (dataWin.success) setWindows(dataWin.data);
      if (dataDev.success) setDevices(dataDev.data || dataDev.devices || []);
    } catch (err) {
      console.error("Gagal load data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const run = async () => { await fetchData(); };
    void run();
  }, [fetchData]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/maintenance-windows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          deviceId: deviceId || null,
          startAt,
          endAt,
          reason,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setFormOpen(false);
        setName("");
        setDeviceId("");
        setStartAt("");
        setEndAt("");
        setReason("");
        fetchData();
      } else {
        alert(data.error || "Gagal membuat maintenance window");
      }
    } catch {
      alert("Terjadi kesalahan sistem");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (id: string, currentStatus: boolean) => {
    try {
      const res = await fetch(`/api/maintenance-windows/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !currentStatus }),
      });
      if (res.ok) fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Apakah Anda yakin ingin menghapus Maintenance Window ini?")) return;
    try {
      const res = await fetch(`/api/maintenance-windows/${id}`, { method: "DELETE" });
      if (res.ok) fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const isWindowActive = (win: MaintenanceWindow) => {
    if (!win.isActive) return false;
    const now = new Date();
    return new Date(win.startAt) <= now && new Date(win.endAt) >= now;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Wrench className="w-6 h-6 text-amber-400" />
            Jendela Pemeliharaan (Maintenance Windows)
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Atur jadwal perawatan untuk menekan (suppress) alert otomatis pada perangkat.
          </p>
        </div>
        <button
          onClick={() => setFormOpen(true)}
          className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold px-4 py-2 rounded-lg text-sm transition-colors self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Tambah Jadwal
        </button>
      </div>

      {/* Modal Form */}
      {formOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 w-full max-w-lg shadow-2xl">
            <h2 className="text-lg font-bold text-white mb-4">Tambah Maintenance Window</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Nama Pemeliharaan</label>
                <input
                  type="text"
                  required
                  placeholder="misal: Maintenance Routine Router Core"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Target Perangkat (Opsional)</label>
                <select
                  value={deviceId}
                  onChange={(e) => setDeviceId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="">Semua Perangkat (Global)</option>
                  {devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.ip})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Mulai</label>
                  <input
                    type="datetime-local"
                    required
                    value={startAt}
                    onChange={(e) => setStartAt(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Selesai</label>
                  <input
                    type="datetime-local"
                    required
                    value={endAt}
                    onChange={(e) => setEndAt(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Alasan / Catatan</label>
                <textarea
                  rows={2}
                  placeholder="misal: Upgrade firmware / Penggantian FO"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setFormOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold px-4 py-2 rounded-lg text-sm disabled:opacity-50"
                >
                  {submitting ? "Saving..." : "Simpan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* List Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-950/50 text-slate-400 text-xs uppercase tracking-wider border-b border-slate-800">
            <tr>
              <th className="px-5 py-3.5 font-semibold">Nama / Status</th>
              <th className="px-5 py-3.5 font-semibold">Target Perangkat</th>
              <th className="px-5 py-3.5 font-semibold">Waktu Pemeliharaan</th>
              <th className="px-5 py-3.5 font-semibold">Alasan</th>
              <th className="px-5 py-3.5 font-semibold text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {loading ? (
              <tr>
                <td colSpan={5} className="text-center py-8 text-slate-500">
                  Memuat data...
                </td>
              </tr>
            ) : windows.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-8 text-slate-500">
                  Belum ada jadwal pemeliharaan.
                </td>
              </tr>
            ) : (
              windows.map((win) => {
                const activeNow = isWindowActive(win);
                return (
                  <tr key={win.id} className="hover:bg-slate-800/40 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2 font-medium text-white">
                        {win.name}
                        {activeNow ? (
                          <span className="inline-flex items-center gap-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs px-2 py-0.5 rounded-full">
                            <ShieldAlert className="w-3 h-3" />
                            Active Suppressing
                          </span>
                        ) : win.isActive ? (
                          <span className="inline-flex items-center gap-1 bg-slate-800 text-slate-400 text-xs px-2 py-0.5 rounded-full">
                            Scheduled
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-red-500/10 text-red-400 text-xs px-2 py-0.5 rounded-full">
                            Disabled
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      {win.device ? (
                        <div>
                          <p className="font-medium text-slate-200">{win.device.name}</p>
                          <p className="text-xs text-slate-500 font-mono">{win.device.ip}</p>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">Semua Perangkat (Global)</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-xs font-mono text-slate-300">
                      <div>{new Date(win.startAt).toLocaleString("id-ID")}</div>
                      <div className="text-slate-500">s/d</div>
                      <div>{new Date(win.endAt).toLocaleString("id-ID")}</div>
                    </td>
                    <td className="px-5 py-4 text-slate-400">{win.reason || "-"}</td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleToggle(win.id, win.isActive)}
                          title={win.isActive ? "Nonaktifkan" : "Aktifkan"}
                          className={`p-1.5 rounded-lg border transition-colors ${
                            win.isActive
                              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20"
                              : "bg-slate-800 text-slate-500 border-slate-700 hover:text-white"
                          }`}
                        >
                          <Power className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(win.id)}
                          className="p-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
