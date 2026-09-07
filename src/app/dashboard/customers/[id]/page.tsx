"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";

interface Customer {
  id: string;
  username: string;
  fullName: string;
  phoneNumber: string | null;
  email: string | null;
  address: string | null;
  serviceType: string;
  ipAddress: string | null;
  macAddress: string | null;
  uploadSpeed: number;
  downloadSpeed: number;
  packageName: string;
  pppoeProfile: string | null;
  dhcpServer: string | null;
  status: "ACTIVE" | "SUSPENDED" | "TERMINATED" | "PENDING";
  isOnline: boolean;
  lastSeen: string | null;
  activationDate: string;
  expiryDate: string | null;
  billingCycle: string | null;
  monthlyFee: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  device: {
    id: string;
    name: string;
    ip: string;
    type: string;
  };
  provisioningLogs: Array<{
    id: string;
    action: string;
    success: boolean;
    errorMessage: string | null;
    executedAt: string;
    executedBy: string | null;
  }>;
  statusHistory: Array<{
    id: string;
    fromStatus: string;
    toStatus: string;
    reason: string | null;
    changedAt: string;
    changedBy: string | null;
  }>;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ACTIVE: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    SUSPENDED: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    TERMINATED: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    PENDING: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  };
  return (
    <span className={`inline-flex px-3 py-1 text-sm font-semibold rounded-full border ${map[status]}`}>
      {status}
    </span>
  );
}

export default function CustomerDetailPage() {
  const { isAdmin, isOperator } = useAuth();
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  const showToast = (ok: boolean, msg: string) => {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchCustomer = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/customers/${id}`);
      const data = await res.json();
      if (data.success) {
        setCustomer(data.data);
      } else {
        showToast(false, "Customer tidak ditemukan");
        setTimeout(() => router.push("/dashboard/customers"), 2000);
      }
    } catch (error) {
      showToast(false, "Error loading customer");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomer();
  }, [id]);

  const handleAction = async (action: "suspend" | "reactivate" | "terminate") => {
    setActionLoading(action);
    try {
      const res = await fetch(`/api/customers/${id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason || undefined }),
      });

      const data = await res.json();

      if (data.success) {
        showToast(true, `Customer berhasil di-${action}`);
        setShowConfirm(null);
        setReason("");
        fetchCustomer();
      } else {
        showToast(false, data.message || `Gagal ${action} customer`);
      }
    } catch (error) {
      showToast(false, `Error saat ${action} customer`);
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("id-ID", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const formatDateTime = (date: string) => {
    return new Date(date).toLocaleString("id-ID");
  };

  const formatSpeed = (kbps: number) => {
    if (kbps >= 1000) return `${(kbps / 1000).toFixed(0)} Mbps`;
    return `${kbps} Kbps`;
  };

  const formatCurrency = (amount: number | null) => {
    if (!amount) return "-";
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-200 p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <div className="text-slate-400">Loading customer...</div>
        </div>
      </div>
    );
  }

  if (!customer) return null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-6">
      {toast && (
        <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top">
          <div className={`px-4 py-3 rounded-lg shadow-lg border ${toast.ok ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400" : "bg-rose-500/10 border-rose-500/50 text-rose-400"}`}>
            {toast.msg}
          </div>
        </div>
      )}

      {/* Confirm Modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-bold text-white mb-4">
              Konfirmasi {showConfirm === "suspend" ? "Suspend" : showConfirm === "reactivate" ? "Reactivate" : "Terminate"}
            </h3>
            <p className="text-slate-400 mb-4">
              {showConfirm === "suspend" && "Customer akan di-suspend dan tidak bisa online."}
              {showConfirm === "reactivate" && "Customer akan diaktifkan kembali."}
              {showConfirm === "terminate" && "Customer akan dihapus dari MikroTik. Aksi ini tidak bisa dibatalkan!"}
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-300 mb-2">Alasan (opsional)</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Masukkan alasan..."
                rows={3}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setShowConfirm(null); setReason(""); }}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
              >
                Batal
              </button>
              <button
                onClick={() => handleAction(showConfirm as any)}
                disabled={actionLoading !== null}
                className={`flex-1 px-4 py-2 ${showConfirm === "terminate" ? "bg-rose-600 hover:bg-rose-700" : "bg-blue-600 hover:bg-blue-700"} disabled:opacity-50 text-white rounded-lg font-medium transition-colors`}
              >
                {actionLoading ? "Processing..." : "Konfirmasi"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        <Link href="/dashboard/customers" className="text-blue-400 hover:text-blue-300 text-sm font-medium mb-2 inline-block">
          ← Back to Customers
        </Link>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">{customer.fullName}</h1>
            <p className="text-slate-400 mt-1 font-mono">{customer.username}</p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={customer.status} />
            {customer.isOnline && (
              <span className="inline-flex items-center gap-2 px-3 py-1 text-sm font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                Online
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      {(isAdmin || isOperator) && (
        <div className="mb-6 flex gap-3">
          {customer.status === "ACTIVE" && (
            <button
              onClick={() => setShowConfirm("suspend")}
              disabled={actionLoading !== null}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
            >
              Suspend Customer
            </button>
          )}
          {customer.status === "SUSPENDED" && (
            <button
              onClick={() => setShowConfirm("reactivate")}
              disabled={actionLoading !== null}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
            >
              Reactivate Customer
            </button>
          )}
          {isAdmin && customer.status !== "TERMINATED" && (
            <button
              onClick={() => setShowConfirm("terminate")}
              disabled={actionLoading !== null}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-lg font-medium transition-colors"
            >
              Terminate Customer
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer Info Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
            <h2 className="text-lg font-bold text-white mb-4">Informasi Customer</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-slate-500 mb-1">Username</div>
                <div className="text-white font-mono">{customer.username}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Nama Lengkap</div>
                <div className="text-white">{customer.fullName}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Nomor HP</div>
                <div className="text-white">{customer.phoneNumber || "-"}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Email</div>
                <div className="text-white">{customer.email || "-"}</div>
              </div>
              <div className="col-span-2">
                <div className="text-xs text-slate-500 mb-1">Alamat</div>
                <div className="text-white">{customer.address || "-"}</div>
              </div>
            </div>
          </div>

          {/* Service Config Card */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
            <h2 className="text-lg font-bold text-white mb-4">Konfigurasi Service</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-slate-500 mb-1">Service Type</div>
                <div className="text-white font-semibold">{customer.serviceType}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Package</div>
                <div className="text-white">{customer.packageName}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Upload Speed</div>
                <div className="text-white">{formatSpeed(customer.uploadSpeed)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Download Speed</div>
                <div className="text-white">{formatSpeed(customer.downloadSpeed)}</div>
              </div>
              {customer.ipAddress && (
                <div>
                  <div className="text-xs text-slate-500 mb-1">IP Address</div>
                  <div className="text-white font-mono">{customer.ipAddress}</div>
                </div>
              )}
              {customer.macAddress && (
                <div>
                  <div className="text-xs text-slate-500 mb-1">MAC Address</div>
                  <div className="text-white font-mono">{customer.macAddress}</div>
                </div>
              )}
              {customer.pppoeProfile && (
                <div>
                  <div className="text-xs text-slate-500 mb-1">PPPoE Profile</div>
                  <div className="text-white">{customer.pppoeProfile}</div>
                </div>
              )}
              <div>
                <div className="text-xs text-slate-500 mb-1">Device</div>
                <div className="text-white">{customer.device.name}</div>
                <div className="text-xs text-slate-500 font-mono">{customer.device.ip}</div>
              </div>
            </div>
          </div>

          {/* Provisioning Logs */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
            <h2 className="text-lg font-bold text-white mb-4">Provisioning Logs</h2>
            {customer.provisioningLogs.length === 0 ? (
              <p className="text-slate-400 text-center py-4">Belum ada log</p>
            ) : (
              <div className="space-y-2">
                {customer.provisioningLogs.map((log) => (
                  <div key={log.id} className="bg-slate-800 border border-slate-700 rounded-lg p-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${log.success ? "bg-emerald-400" : "bg-rose-400"}`} />
                          <span className="text-white font-medium">{log.action}</span>
                          <span className="text-xs text-slate-500">{formatDateTime(log.executedAt)}</span>
                        </div>
                        {log.errorMessage && (
                          <div className="mt-1 text-xs text-rose-400">{log.errorMessage}</div>
                        )}
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded ${log.success ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"}`}>
                        {log.success ? "Success" : "Failed"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Status History */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
            <h2 className="text-lg font-bold text-white mb-4">Status History</h2>
            {customer.statusHistory.length === 0 ? (
              <p className="text-slate-400 text-center py-4">Belum ada history</p>
            ) : (
              <div className="space-y-2">
                {customer.statusHistory.map((history) => (
                  <div key={history.id} className="bg-slate-800 border border-slate-700 rounded-lg p-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-white">
                          <span className="text-slate-400">{history.fromStatus}</span>
                          {" → "}
                          <span className="font-medium">{history.toStatus}</span>
                        </div>
                        {history.reason && (
                          <div className="text-sm text-slate-400 mt-1">{history.reason}</div>
                        )}
                        <div className="text-xs text-slate-500 mt-1">{formatDateTime(history.changedAt)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Billing Info */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
            <h2 className="text-lg font-bold text-white mb-4">Billing</h2>
            <div className="space-y-3">
              <div>
                <div className="text-xs text-slate-500 mb-1">Biaya Bulanan</div>
                <div className="text-white font-bold text-xl">{formatCurrency(customer.monthlyFee)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Siklus Billing</div>
                <div className="text-white">{customer.billingCycle || "-"}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Tanggal Aktivasi</div>
                <div className="text-white">{formatDate(customer.activationDate)}</div>
              </div>
              {customer.expiryDate && (
                <div>
                  <div className="text-xs text-slate-500 mb-1">Tanggal Expire</div>
                  <div className="text-white">{formatDate(customer.expiryDate)}</div>
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          {customer.notes && (
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
              <h2 className="text-lg font-bold text-white mb-4">Catatan</h2>
              <p className="text-slate-300 text-sm whitespace-pre-wrap">{customer.notes}</p>
            </div>
          )}

          {/* Metadata */}
          <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
            <h2 className="text-lg font-bold text-white mb-4">Metadata</h2>
            <div className="space-y-3">
              <div>
                <div className="text-xs text-slate-500 mb-1">Dibuat</div>
                <div className="text-white text-sm">{formatDateTime(customer.createdAt)}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Terakhir Update</div>
                <div className="text-white text-sm">{formatDateTime(customer.updatedAt)}</div>
              </div>
              {customer.lastSeen && (
                <div>
                  <div className="text-xs text-slate-500 mb-1">Last Seen</div>
                  <div className="text-white text-sm">{formatDateTime(customer.lastSeen)}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
