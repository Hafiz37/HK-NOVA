"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/lib/auth-context";

function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
  const [currentTime, setCurrentTime] = useState("");
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const updateTime = () => setCurrentTime(new Date().toLocaleString("id-ID"));
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span>Memuat sesi...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="flex">
        <aside className="w-64 bg-slate-900 border-r border-slate-800 min-h-screen">
          <div className="p-6">
            <h2 className="text-xl font-bold text-white">HK-NOVA</h2>
            <p className="text-xs text-slate-500">NOC Platform</p>
          </div>
          <nav className="px-3 space-y-1" aria-label="Main navigation">
            <Link
              href="/dashboard"
              className={`block px-3 py-2 text-sm rounded-md transition-colors ${
                pathname === "/dashboard"
                  ? "bg-slate-800 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              📊 Dashboard
            </Link>
            <Link
              href="/dashboard/monitoring"
              className={`block px-3 py-2 text-sm rounded-md transition-colors ${
                pathname === "/dashboard/monitoring"
                  ? "bg-slate-800 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              📡 ICMP Monitoring
            </Link>
            <Link
              href="/dashboard/snmp"
              className={`block px-3 py-2 text-sm rounded-md transition-colors ${
                pathname.startsWith("/dashboard/snmp")
                  ? "bg-slate-800 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              📊 SNMP Monitoring
            </Link>
            <Link
              href="/dashboard/devices"
              className={`block px-3 py-2 text-sm rounded-md transition-colors ${
                pathname.startsWith("/dashboard/devices")
                  ? "bg-slate-800 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              🖥️ Devices
            </Link>
            <Link
              href="/dashboard/baseline"
              className={`block px-3 py-2 text-sm rounded-md transition-colors ${
                pathname.startsWith("/dashboard/baseline")
                  ? "bg-slate-800 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              📊 Baseline
            </Link>
            <Link
              href="/dashboard/alerts"
              className={`block px-3 py-2 text-sm rounded-md transition-colors ${
                pathname.startsWith("/dashboard/alerts")
                  ? "bg-slate-800 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              🔔 Alerts
            </Link>
            <Link
              href="/dashboard/maintenance"
              className={`block px-3 py-2 text-sm rounded-md transition-colors ${
                pathname.startsWith("/dashboard/maintenance")
                  ? "bg-slate-800 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              🛠️ Maintenance
            </Link>
            <Link
              href="/dashboard/backup"
              className={`block px-3 py-2 text-sm rounded-md transition-colors ${
                pathname.startsWith("/dashboard/backup")
                  ? "bg-slate-800 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              💾 Backup
            </Link>
            <Link
              href="/dashboard/provisioning"
              className={`block px-3 py-2 text-sm rounded-md transition-colors ${
                pathname.startsWith("/dashboard/provisioning")
                  ? "bg-slate-800 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              📡 Provisi OLT
            </Link>
            {user?.role === "ADMIN" && (
              <Link
                href="/dashboard/users"
                className={`block px-3 py-2 text-sm rounded-md transition-colors ${
                  pathname.startsWith("/dashboard/users")
                    ? "bg-slate-800 text-white"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                👤 Users
              </Link>
            )}
            {user?.role === "ADMIN" && (
              <Link
                href="/dashboard/settings"
                className={`block px-3 py-2 text-sm rounded-md transition-colors ${
                  pathname.startsWith("/dashboard/settings")
                    ? "bg-slate-800 text-white"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                ⚙️ Pengaturan
              </Link>
            )}
            {user?.role === "ADMIN" && (
              <Link
                href="/dashboard/audit-logs"
                className={`block px-3 py-2 text-sm rounded-md transition-colors ${
                  pathname.startsWith("/dashboard/audit-logs")
                    ? "bg-slate-800 text-white"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                📋 Audit Logs
              </Link>
            )}
          </nav>
        </aside>

        <main className="flex-1">
          <header className="bg-slate-900 border-b border-slate-800 px-6 py-4">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-semibold text-white">Dashboard</h1>
              <div className="flex items-center gap-4">
                <div className="text-sm text-slate-400">{currentTime || "Loading..."}</div>
                {user && (
                  <span className="text-xs text-slate-500 hidden sm:inline">
                    {user.fullName || user.username} {user.role === "ADMIN" && (
                      <span className="ml-2 px-1.5 py-0.5 text-[10px] font-bold rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">ADMIN</span>
                    )}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  className="text-xs px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
                >
                  Logout
                </button>
              </div>
            </div>
          </header>

          <div className="p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{<DashboardLayoutInner>{children}</DashboardLayoutInner>}</AuthProvider>;
}