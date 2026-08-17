"use client";

export type DeviationLevel = "NORMAL" | "WARNING" | "CRITICAL" | "INSUFFICIENT_DATA";

const LEVEL_CONFIG: Record<DeviationLevel, { label: string; cls: string }> = {
  NORMAL: {
    label: "Normal",
    cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  },
  WARNING: {
    label: "Waspada",
    cls: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  },
  CRITICAL: {
    label: "Kritis",
    cls: "bg-rose-500/10 text-rose-400 border-rose-500/30",
  },
  INSUFFICIENT_DATA: {
    label: "Data minim",
    cls: "bg-slate-800 text-slate-400 border-slate-700",
  },
};

const LEVEL_ICON: Record<DeviationLevel, string> = {
  NORMAL: "🟢",
  WARNING: "🟡",
  CRITICAL: "🔴",
  INSUFFICIENT_DATA: "⚪",
};

export default function BaselineBadge({ level, showIcon = true }: { level: DeviationLevel; showIcon?: boolean }) {
  const c = LEVEL_CONFIG[level] ?? LEVEL_CONFIG.INSUFFICIENT_DATA;
  const label = LEVEL_CONFIG[level]?.label ?? "Data minim";
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full border ${c.cls}`}>
      {showIcon && <span>{LEVEL_ICON[level]}</span>}
      {label}
    </span>
  );
}