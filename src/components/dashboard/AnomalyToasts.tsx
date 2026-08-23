"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

interface ToastProps {
  id: string;
  anomaly: {
    id: string;
    deviceId: string;
    device: { name: string; ip: string } | null;
    metricType: string;
    anomalyScore: number;
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    timestamp: string;
    confidence?: number;
  };
  onDismiss: (id: string) => void;
  onClick: () => void;
}

function AnomalyToast({ id, anomaly, onDismiss, onClick }: ToastProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(() => onDismiss(id), 300);
    }, 10000); // Auto-dismiss after 10 seconds
    return () => clearTimeout(timer);
  }, [id, onDismiss]);

  const sevStyles: Record<string, { bg: string; border: string; text: string; icon: string }> = {
    CRITICAL: { bg: "bg-rose-500/20", border: "border-rose-500/30", text: "text-rose-400", icon: "🔴" },
    HIGH: { bg: "bg-orange-500/20", border: "border-orange-500/30", text: "text-orange-400", icon: "🟠" },
    MEDIUM: { bg: "bg-amber-500/20", border: "border-amber-500/30", text: "text-amber-400", icon: "🟡" },
    LOW: { bg: "bg-emerald-500/20", border: "border-emerald-500/30", text: "text-emerald-400", icon: "🟢" },
  };

  const style = sevStyles[anomaly.severity] ?? sevStyles.HIGH;

  if (!visible) return null;

  return (
    <div
      onClick={onClick}
      className={`fixed bottom-4 right-4 z-50 max-w-sm p-4 rounded-lg border shadow-xl animate-slide-in ${style.bg} ${style.border} ${style.text} cursor-pointer`}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl">{style.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-sm truncate">{anomaly.device?.name || "Unknown Device"}</p>
            <button
              onClick={(e) => { e.stopPropagation(); onDismiss(id); }}
              className="p-1 hover:bg-white/10 rounded transition-colors"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-1 truncate">{anomaly.device?.ip}</p>
          <div className="flex items-center gap-3 mt-2 text-xs">
            <span className="px-2 py-0.5 bg-slate-800 rounded font-mono">{anomaly.metricType}</span>
            <span className="px-2 py-0.5 bg-slate-800 rounded font-mono">Score: {anomaly.anomalyScore.toFixed(3)}</span>
            {anomaly.confidence && <span className="px-2 py-0.5 bg-slate-800 rounded font-mono">Conf: {anomaly.confidence.toFixed(0)}%</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

export function AnomalyToastContainer({ toasts, onDismiss, onClick }: {
  toasts: Array<{ id: string; anomaly: ToastProps["anomaly"]; read: boolean }>;
  onDismiss: (id: string) => void;
  onClick: (anomaly: ToastProps["anomaly"]) => void;
}) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col-reverse gap-2 pointer-events-none">
      {toasts.map((t) => (
        <AnomalyToast
          key={t.id}
          id={t.id}
          anomaly={t.anomaly}
          onDismiss={onDismiss}
          onClick={() => onClick(t.anomaly)}
        />
      ))}
    </div>
  );
}

// Live anomaly counter badge component
export function AnomalyCounterBadge({ count }: { count: number }) {
  if (count === 0) return null;

  return (
    <span className="relative">
      <span className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 text-white text-xs font-bold rounded-full flex items-center justify-center animate-pulse">
        {count > 99 ? "99+" : count}
      </span>
    </span>
  );
}