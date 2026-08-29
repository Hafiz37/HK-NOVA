"use client";

import { useEffect, useState, ReactNode } from "react";

export default function ClientOnly({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950" suppressHydrationWarning>
        <div className="text-center space-y-4" suppressHydrationWarning>
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" suppressHydrationWarning></div>
          <p className="text-slate-400 text-lg">Memuat HK-NOVA...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}