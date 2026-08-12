"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard Error Boundary caught an error:", error);
  }, [error]);

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center p-6 space-y-4">
      <div className="w-16 h-16 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center justify-center text-rose-400 text-3xl">
        ⚠️
      </div>
      <div>
        <h2 className="text-xl font-bold text-white tracking-tight">Terjadi Kesalahan pada Dashboard</h2>
        <p className="text-slate-400 text-sm mt-1 max-w-md">
          {error.message || "Aplikasi mengalami masalah yang tidak terduga saat memuat halaman ini."}
        </p>
      </div>
      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={() => reset()}
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm rounded-xl shadow-lg shadow-blue-500/20 transition-all"
        >
          🔄 Coba Lagi
        </button>
        <Link
          href="/dashboard"
          className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-sm rounded-xl border border-slate-700 transition-colors"
        >
          🏠 Kembali ke Dashboard
        </Link>
      </div>
    </div>
  );
}
