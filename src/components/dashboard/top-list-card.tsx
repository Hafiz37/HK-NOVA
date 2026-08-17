"use client";

import Link from "next/link";

export interface TopItem {
  deviceId: string;
  name: string;
  ip: string;
  type: string;
  status: string;
  value: number;
  timestamp: string | null;
}

interface TopListCardProps {
  title: string;
  icon: string;
  accent: "blue" | "rose" | "orange" | "cyan";
  unit?: string;
  items: TopItem[];
  loading: boolean;
  formatValue?: (v: number) => string;
}

const ACCENT = {
  blue: {
    chip: "bg-blue-500/10 border-blue-500/20",
    text: "text-blue-400",
    bar: "bg-blue-500",
    icon: "bg-blue-500/10 border border-blue-500/20 text-xl",
  },
  rose: {
    chip: "bg-rose-500/10 border-rose-500/20",
    text: "text-rose-400",
    bar: "bg-rose-500",
    icon: "bg-rose-500/10 border border-rose-500/20 text-xl",
  },
  orange: {
    chip: "bg-orange-500/10 border-orange-500/20",
    text: "text-orange-400",
    bar: "bg-orange-500",
    icon: "bg-orange-500/10 border border-orange-500/20 text-xl",
  },
  cyan: {
    chip: "bg-cyan-500/10 border-cyan-500/20",
    text: "text-cyan-400",
    bar: "bg-cyan-500",
    icon: "bg-cyan-500/10 border border-cyan-500/20 text-xl",
  },
} as const;

const RANK_COLORS = [
  "bg-rose-500 text-white",
  "bg-orange-500 text-white",
  "bg-amber-500 text-slate-900",
  "bg-slate-600 text-white",
  "bg-slate-700 text-slate-300",
];

export default function TopListCard({
  title,
  icon,
  accent,
  unit,
  items,
  loading,
  formatValue,
}: TopListCardProps) {
  const a = ACCENT[accent];
  const maxValue = items.reduce((m, it) => Math.max(m, it.value), 0);

  return (
    <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
          {title}
        </h3>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${a.icon}`}>
          {icon}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3 animate-pulse">
              <div className="w-7 h-7 rounded-md bg-slate-800" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-2/3 bg-slate-800 rounded" />
                <div className="h-2.5 w-1/2 bg-slate-800/70 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-2xl mb-1">📭</p>
          <p className="text-xs text-slate-500">Belum ada data</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item, idx) => {
            const pct = maxValue > 0 ? Math.round((item.value / maxValue) * 100) : 0;
            return (
              <Link
                key={item.deviceId}
                href="/dashboard/monitoring"
                className="block group"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`w-7 h-7 shrink-0 rounded-md flex items-center justify-center text-xs font-bold ${RANK_COLORS[idx] ?? RANK_COLORS[RANK_COLORS.length - 1]}`}
                  >
                    {idx + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-200 truncate group-hover:text-white transition-colors">
                        {item.name}
                      </p>
                      <p className={`text-sm font-semibold ${a.text} font-mono shrink-0`}>
                        {formatValue ? formatValue(item.value) : `${item.value}${unit ? " " + unit : ""}`}
                      </p>
                    </div>
                    <p className="text-[11px] text-slate-500 font-mono truncate">{item.ip}</p>
                    <div className="h-1 bg-slate-800 rounded-full overflow-hidden mt-1.5">
                      <div
                        className={`h-full ${a.bar} rounded-full transition-all`}
                        style={{ width: `${Math.max(pct, 4)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
