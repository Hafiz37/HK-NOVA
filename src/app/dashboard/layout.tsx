"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [currentTime, setCurrentTime] = useState("");
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
    const updateTime = () => setCurrentTime(new Date().toLocaleString("id-ID"));
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

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
                pathname.startsWith("/dashboard/monitoring")
                  ? "bg-slate-800 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              📡 Monitoring
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
              href="/dashboard/provisioning"
              className={`block px-3 py-2 text-sm rounded-md transition-colors ${
                pathname.startsWith("/dashboard/provisioning")
                  ? "bg-slate-800 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              ⚙️ Provisioning
            </Link>
            <Link
              href="/dashboard/backups"
              className={`block px-3 py-2 text-sm rounded-md transition-colors ${
                pathname.startsWith("/dashboard/backups")
                  ? "bg-slate-800 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              💾 Backups
            </Link>
            <Link
              href="/dashboard/anomalies"
              className={`block px-3 py-2 text-sm rounded-md transition-colors ${
                pathname.startsWith("/dashboard/anomalies")
                  ? "bg-slate-800 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              🔍 Anomalies
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
          </nav>
        </aside>

        <main className="flex-1">
          <header className="bg-slate-900 border-b border-slate-800 px-6 py-4">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-semibold text-white">Dashboard</h1>
              <div className="flex items-center gap-4">
                <div className="text-sm text-slate-400">{currentTime || "Loading..."}</div>
              </div>
            </div>
          </header>

          <div className="p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}