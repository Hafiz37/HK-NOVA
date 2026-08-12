"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global Error Boundary caught an error:", error);
  }, [error]);

  return (
    <html>
      <body className="bg-slate-950 text-white min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-4 shadow-2xl">
          <div className="w-16 h-16 bg-rose-500/10 border border-rose-500/20 rounded-2xl flex items-center justify-center text-rose-400 text-3xl mx-auto">
            💥
          </div>
          <div>
            <h2 className="text-xl font-bold text-white tracking-tight">Sistem Mengalami Kendala</h2>
            <p className="text-slate-400 text-sm mt-1">
              {error.message || "Aplikasi mengalami masalah teknis yang tidak terduga."}
            </p>
          </div>
          <div className="pt-2">
            <button
              onClick={() => reset()}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm rounded-xl shadow-lg shadow-blue-500/20 transition-all"
            >
              🔄 Reload Halaman
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
