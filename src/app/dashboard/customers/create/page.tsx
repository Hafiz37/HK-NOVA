"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";

interface Device {
  id: string;
  name: string;
  ip: string;
  type: string;
}

const SERVICE_TYPES = ["PPPOE", "DHCP", "STATIC"] as const;

export default function CreateCustomerPage() {
  const { isAdmin, isOperator } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState(1);
  const [devices, setDevices] = useState<Device[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<any>(null);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  const [form, setForm] = useState({
    username: "",
    fullName: "",
    phoneNumber: "",
    email: "",
    address: "",
    serviceType: "PPPOE" as typeof SERVICE_TYPES[number],
    ipAddress: "",
    macAddress: "",
    dhcpServer: "dhcp1",
    uploadSpeed: "10000",
    downloadSpeed: "10000",
    packageName: "Paket 10Mbps",
    pppoePassword: "",
    pppoeProfile: "default",
    deviceId: "",
    activationDate: new Date().toISOString().split('T')[0],
    expiryDate: "",
    billingCycle: "MONTHLY",
    monthlyFee: "150000",
    notes: "",
  });

  useEffect(() => {
    if (!isAdmin && !isOperator) {
      router.push("/dashboard");
      return;
    }
    fetchDevices();
  }, [isAdmin, isOperator]);

  const fetchDevices = async () => {
    try {
      const res = await fetch("/api/devices?limit=100");
      const data = await res.json();
      if (data.success) {
        setDevices(data.data);
        if (data.data.length > 0) {
          setForm(prev => ({ ...prev, deviceId: data.data[0].id }));
        }
      }
    } catch (error) {
      console.error("Error fetching devices:", error);
    }
  };

  const showToast = (ok: boolean, msg: string) => {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const handleDryRun = async () => {
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        uploadSpeed: parseInt(form.uploadSpeed),
        downloadSpeed: parseInt(form.downloadSpeed),
        monthlyFee: form.monthlyFee ? parseFloat(form.monthlyFee) : null,
        phoneNumber: form.phoneNumber || null,
        email: form.email || null,
        address: form.address || null,
        expiryDate: form.expiryDate || null,
        notes: form.notes || null,
        pppoePassword: form.serviceType === "PPPOE" ? form.pppoePassword : null,
        pppoeProfile: form.serviceType === "PPPOE" ? form.pppoeProfile : null,
        ipAddress: form.serviceType !== "PPPOE" ? form.ipAddress : null,
        macAddress: form.serviceType === "DHCP" ? form.macAddress : null,
        dhcpServer: form.serviceType === "DHCP" ? form.dhcpServer : null,
        dryRun: true,
      };

      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (data.success) {
        setDryRunResult(data);
        showToast(true, "Dry-run berhasil! Data valid dan siap dibuat.");
      } else {
        showToast(false, data.message || "Validasi gagal");
      }
    } catch (error) {
      showToast(false, "Error saat dry-run");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const payload = {
        ...form,
        uploadSpeed: parseInt(form.uploadSpeed),
        downloadSpeed: parseInt(form.downloadSpeed),
        monthlyFee: form.monthlyFee ? parseFloat(form.monthlyFee) : null,
        phoneNumber: form.phoneNumber || null,
        email: form.email || null,
        address: form.address || null,
        expiryDate: form.expiryDate || null,
        notes: form.notes || null,
        pppoePassword: form.serviceType === "PPPOE" ? form.pppoePassword : null,
        pppoeProfile: form.serviceType === "PPPOE" ? form.pppoeProfile : null,
        ipAddress: form.serviceType !== "PPPOE" ? form.ipAddress : null,
        macAddress: form.serviceType === "DHCP" ? form.macAddress : null,
        dhcpServer: form.serviceType === "DHCP" ? form.dhcpServer : null,
        dryRun: false,
      };

      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (data.success) {
        showToast(true, "Customer berhasil dibuat dan di-provision ke MikroTik!");
        setTimeout(() => router.push("/dashboard/customers"), 2000);
      } else {
        showToast(false, data.message || "Gagal membuat customer");
      }
    } catch (error) {
      showToast(false, "Error saat membuat customer");
    } finally {
      setSubmitting(false);
    }
  };

  const setField = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  const canProceed = () => {
    if (step === 1) {
      return form.username.length >= 3 && form.fullName.length >= 3;
    }
    if (step === 2) {
      if (form.serviceType === "PPPOE") {
        return form.pppoePassword.length >= 8;
      }
      if (form.serviceType === "DHCP") {
        return form.ipAddress && form.macAddress;
      }
      return true;
    }
    if (step === 3) {
      return form.uploadSpeed && form.downloadSpeed && form.packageName && form.deviceId;
    }
    return true;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-6">
      {toast && (
        <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top">
          <div className={`px-4 py-3 rounded-lg shadow-lg border ${toast.ok ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400" : "bg-rose-500/10 border-rose-500/50 text-rose-400"}`}>
            {toast.msg}
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white">Tambah Customer Baru</h1>
          <p className="text-slate-400 mt-1">Buat customer baru dan provision ke MikroTik</p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-between mb-8">
          {[
            { num: 1, title: "Info Customer" },
            { num: 2, title: "Service Config" },
            { num: 3, title: "Package & Device" },
            { num: 4, title: "Review & Submit" },
          ].map((s, i) => (
            <div key={s.num} className="flex items-center flex-1">
              <div className={`flex items-center gap-3 ${i < 3 ? "flex-1" : ""}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${step >= s.num ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-500"}`}>
                  {s.num}
                </div>
                <div className={`text-sm font-medium ${step >= s.num ? "text-white" : "text-slate-500"}`}>
                  {s.title}
                </div>
              </div>
              {i < 3 && <div className={`h-0.5 flex-1 mx-2 ${step > s.num ? "bg-blue-600" : "bg-slate-800"}`} />}
            </div>
          ))}
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
          {/* Step 1: Basic Info */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-white mb-4">Informasi Customer</h2>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Username *</label>
                <input
                  type="text"
                  value={form.username}
                  onChange={setField("username")}
                  placeholder="customer001"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-slate-500 mt-1">3-32 karakter, alphanumeric, underscore, dash</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Nama Lengkap *</label>
                <input
                  type="text"
                  value={form.fullName}
                  onChange={setField("fullName")}
                  placeholder="John Doe"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Nomor HP</label>
                  <input
                    type="text"
                    value={form.phoneNumber}
                    onChange={setField("phoneNumber")}
                    placeholder="08123456789"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={setField("email")}
                    placeholder="john@example.com"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Alamat</label>
                <textarea
                  value={form.address}
                  onChange={setField("address")}
                  placeholder="Jl. Contoh No. 123"
                  rows={3}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          {/* Step 2: Service Config */}
          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-white mb-4">Konfigurasi Service</h2>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Service Type *</label>
                <select
                  value={form.serviceType}
                  onChange={setField("serviceType")}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {SERVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {form.serviceType === "PPPOE" && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Password PPPoE *</label>
                    <input
                      type="text"
                      value={form.pppoePassword}
                      onChange={setField("pppoePassword")}
                      placeholder="SecurePass123!"
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <p className="text-xs text-slate-500 mt-1">Minimal 8 karakter</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">PPPoE Profile</label>
                    <input
                      type="text"
                      value={form.pppoeProfile}
                      onChange={setField("pppoeProfile")}
                      placeholder="default"
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </>
              )}

              {form.serviceType === "DHCP" && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">IP Address *</label>
                      <input
                        type="text"
                        value={form.ipAddress}
                        onChange={setField("ipAddress")}
                        placeholder="192.168.1.100"
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">MAC Address *</label>
                      <input
                        type="text"
                        value={form.macAddress}
                        onChange={setField("macAddress")}
                        placeholder="AA:BB:CC:DD:EE:FF"
                        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">DHCP Server</label>
                    <input
                      type="text"
                      value={form.dhcpServer}
                      onChange={setField("dhcpServer")}
                      placeholder="dhcp1"
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 3: Package & Device */}
          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-white mb-4">Package & Device</h2>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Upload Speed (Kbps) *</label>
                  <input
                    type="number"
                    value={form.uploadSpeed}
                    onChange={setField("uploadSpeed")}
                    placeholder="10000"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Download Speed (Kbps) *</label>
                  <input
                    type="number"
                    value={form.downloadSpeed}
                    onChange={setField("downloadSpeed")}
                    placeholder="10000"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Nama Package *</label>
                <input
                  type="text"
                  value={form.packageName}
                  onChange={setField("packageName")}
                  placeholder="Paket 10Mbps"
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">MikroTik Device *</label>
                <select
                  value={form.deviceId}
                  onChange={setField("deviceId")}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {devices.map(d => (
                    <option key={d.id} value={d.id}>{d.name} ({d.ip})</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Tanggal Aktivasi *</label>
                  <input
                    type="date"
                    value={form.activationDate}
                    onChange={setField("activationDate")}
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Biaya Bulanan (Rp)</label>
                  <input
                    type="number"
                    value={form.monthlyFee}
                    onChange={setField("monthlyFee")}
                    placeholder="150000"
                    className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Catatan</label>
                <textarea
                  value={form.notes}
                  onChange={setField("notes")}
                  placeholder="Catatan tambahan..."
                  rows={3}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          {/* Step 4: Review */}
          {step === 4 && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-white mb-4">Review & Submit</h2>

              <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-slate-500">Username</div>
                    <div className="text-white font-medium">{form.username}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Nama Lengkap</div>
                    <div className="text-white font-medium">{form.fullName}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Service Type</div>
                    <div className="text-white font-medium">{form.serviceType}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Package</div>
                    <div className="text-white font-medium">{form.packageName}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Bandwidth</div>
                    <div className="text-white font-medium">{parseInt(form.uploadSpeed)/1000} / {parseInt(form.downloadSpeed)/1000} Mbps</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Device</div>
                    <div className="text-white font-medium">{devices.find(d => d.id === form.deviceId)?.name}</div>
                  </div>
                </div>
              </div>

              {dryRunResult && (
                <div className="bg-emerald-500/10 border border-emerald-500/50 rounded-lg p-4">
                  <div className="text-emerald-400 font-medium mb-2">✓ Dry-run Berhasil</div>
                  <div className="text-sm text-slate-300">Data valid dan siap untuk di-provision ke MikroTik</div>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handleDryRun}
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
                >
                  {submitting ? "Testing..." : "Test (Dry-run)"}
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
                >
                  {submitting ? "Creating..." : "Buat Customer"}
                </button>
              </div>
            </div>
          )}

          {/* Navigation Buttons */}
          {step < 4 && (
            <div className="flex justify-between mt-6 pt-6 border-t border-slate-800">
              <button
                onClick={() => step > 1 && setStep(step - 1)}
                disabled={step === 1}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
              >
                ← Back
              </button>
              <button
                onClick={() => setStep(step + 1)}
                disabled={!canProceed()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors"
              >
                Next →
              </button>
            </div>
          )}

          {step === 4 && (
            <div className="mt-6 pt-6 border-t border-slate-800">
              <button
                onClick={() => setStep(3)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
              >
                ← Back
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
