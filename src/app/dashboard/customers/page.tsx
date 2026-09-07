"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import Link from "next/link";

interface Customer {
  id: string;
  username: string;
  fullName: string;
  phoneNumber: string | null;
  email: string | null;
  serviceType: "PPPOE" | "DHCP" | "STATIC" | "HOTSPOT";
  packageName: string;
  uploadSpeed: number;
  downloadSpeed: number;
  status: "ACTIVE" | "SUSPENDED" | "TERMINATED" | "PENDING";
  isOnline: boolean;
  activationDate: string;
  monthlyFee: number | null;
  device: {
    id: string;
    name: string;
    ip: string;
  };
}

const SERVICE_TYPES = ["PPPOE", "DHCP", "STATIC", "HOTSPOT"];
const STATUSES = ["ACTIVE", "SUSPENDED", "TERMINATED", "PENDING"];

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; border: string }> = {
    ACTIVE:     { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20" },
    SUSPENDED:  { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20" },
    TERMINATED: { bg: "bg-rose-500/10", text: "text-rose-400", border: "border-rose-500/20" },
    PENDING:    { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/20" },
  };
  const s = map[status] ?? map.PENDING;
  return (
    <span className={`inline-flex items-center px-2.5 py-1 text-xs font-semibold rounded-full border ${s.bg} ${s.text} ${s.border}`}>
      {status}
    </span>
  );
}

function OnlineBadge({ isOnline }: { isOnline: boolean }) {
  return isOnline ? (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium text-emerald-400">
      <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
      Online
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium text-slate-500">
      <span className="w-2 h-2 bg-slate-600 rounded-full" />
      Offline
    </span>
  );
}

function ServiceBadge({ type }: { type: string }) {
  const colors: Record<string, string> = {
    PPPOE:   "bg-blue-500/10 text-blue-400 border-blue-500/20",
    DHCP:    "bg-purple-500/10 text-purple-400 border-purple-500/20",
    STATIC:  "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
    HOTSPOT: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  };
  return (
    <span className={`px-2 py-0.5 text-xs font-semibold rounded border ${colors[type] ?? colors.PPPOE}`}>
      {type}
    </span>
  );
}

export default function CustomersPage() {
  const { isAdmin, isOperator } = useAuth();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterServiceType, setFilterServiceType] = useState("");
  const [filterOnline, setFilterOnline] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [toast, setToast] = useState<{ ok: boolean; msg: string } | null>(null);

  const limit = 50;

  const showToast = (ok: boolean, msg: string) => {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        sortBy: "createdAt",
        sortOrder: "desc",
      });

      if (search) params.set("search", search);
      if (filterStatus) params.set("status", filterStatus);
      if (filterServiceType) params.set("serviceType", filterServiceType);
      if (filterOnline) params.set("isOnline", filterOnline);

      const res = await fetch(`/api/customers?${params}`);
      const data = await res.json();

      if (data.success) {
        setCustomers(data.data);
        setTotal(data.pagination.total);
      } else {
        showToast(false, data.message || "Failed to load customers");
      }
    } catch (error) {
      console.error("Error fetching customers:", error);
      showToast(false, "Error loading customers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [page, search, filterStatus, filterServiceType, filterOnline]);

  const totalPages = Math.ceil(total / limit);

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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-6">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top">
          <div className={`px-4 py-3 rounded-lg shadow-lg border ${toast.ok ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400" : "bg-rose-500/10 border-rose-500/50 text-rose-400"}`}>
            {toast.msg}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Customer Management</h1>
          <p className="text-slate-400 mt-1">Kelola customer PPPoE dan DHCP</p>
        </div>
        {(isAdmin || isOperator) && (
          <Link
            href="/dashboard/customers/create"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            + Tambah Customer
          </Link>
        )}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <div className="text-slate-400 text-sm">Total Customers</div>
          <div className="text-2xl font-bold text-white mt-1">{total}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <div className="text-slate-400 text-sm">Active</div>
          <div className="text-2xl font-bold text-emerald-400 mt-1">
            {customers.filter(c => c.status === "ACTIVE").length}
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <div className="text-slate-400 text-sm">Online</div>
          <div className="text-2xl font-bold text-blue-400 mt-1">
            {customers.filter(c => c.isOnline).length}
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
          <div className="text-slate-400 text-sm">Suspended</div>
          <div className="text-2xl font-bold text-amber-400 mt-1">
            {customers.filter(c => c.status === "SUSPENDED").length}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="md:col-span-2">
            <input
              type="text"
              placeholder="Cari username, nama, phone, email..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }}
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Semua Status</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={filterServiceType}
            onChange={(e) => { setFilterServiceType(e.target.value); setPage(1); }}
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Semua Service</option>
            {SERVICE_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={filterOnline}
            onChange={(e) => { setFilterOnline(e.target.value); setPage(1); }}
            className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Online/Offline</option>
            <option value="true">Online Saja</option>
            <option value="false">Offline Saja</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400">Loading customers...</div>
        ) : customers.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <p className="text-lg">Belum ada customer</p>
            <p className="text-sm mt-2">Klik "Tambah Customer" untuk membuat customer baru</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-800 border-b border-slate-700">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Username</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Customer</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Service</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Package</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Device</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase">Online</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-400 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {customers.map((customer) => (
                    <tr key={customer.id} className="hover:bg-slate-800/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-mono text-sm text-white">{customer.username}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-white font-medium">{customer.fullName}</div>
                        {customer.phoneNumber && (
                          <div className="text-xs text-slate-400">{customer.phoneNumber}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <ServiceBadge type={customer.serviceType} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-white">{customer.packageName}</div>
                        <div className="text-xs text-slate-400">
                          ↑{formatSpeed(customer.uploadSpeed)} / ↓{formatSpeed(customer.downloadSpeed)}
                        </div>
                        {customer.monthlyFee && (
                          <div className="text-xs text-slate-500 mt-0.5">{formatCurrency(customer.monthlyFee)}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm text-slate-300">{customer.device.name}</div>
                        <div className="text-xs text-slate-500 font-mono">{customer.device.ip}</div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={customer.status} />
                      </td>
                      <td className="px-4 py-3">
                        <OnlineBadge isOnline={customer.isOnline} />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/dashboard/customers/${customer.id}`}
                          className="text-blue-400 hover:text-blue-300 text-sm font-medium"
                        >
                          Detail →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="px-4 py-3 bg-slate-800 border-t border-slate-700 flex items-center justify-between">
                <div className="text-sm text-slate-400">
                  Showing {(page - 1) * limit + 1} - {Math.min(page * limit, total)} of {total}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm"
                  >
                    Previous
                  </button>
                  <div className="flex gap-1">
                    {[...Array(Math.min(5, totalPages))].map((_, i) => {
                      const pageNum = i + 1;
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setPage(pageNum)}
                          className={`px-3 py-1 rounded text-sm ${page === pageNum ? "bg-blue-600 text-white" : "bg-slate-700 hover:bg-slate-600"}`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
