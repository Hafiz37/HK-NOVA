import { Server, Bell, Zap, Activity, BarChart3, Database, Bot, RefreshCw, Settings, Users, FileText, Search, HardDrive, AlertTriangle, TrendingUp } from "lucide-react";

interface LoadingSkeletonProps {
  type?: "card" | "table" | "circle" | "text";
  rows?: number;
}

export function LoadingSkeleton({ type = "card", rows = 3 }: LoadingSkeletonProps) {
  const renderCard = () => (
    <div className="bg-slate-900 border border-slate-800/80 rounded-2xl p-6 shadow-sm">
      <div className="h-4 w-32 bg-slate-800 rounded animate-pulse mb-4" />
      <div className="h-12 w-24 bg-slate-800 rounded animate-pulse mb-6" />
      <div className="space-y-3">
        <div className="h-3 w-full bg-slate-800 rounded animate-pulse" />
        <div className="h-3 w-3/4 bg-slate-800 rounded animate-pulse" />
        <div className="h-3 w-1/2 bg-slate-800 rounded animate-pulse" />
      </div>
    </div>
  );

  const renderTable = () => (
    <div className="space-y-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 bg-slate-950 rounded-2xl p-4">
          <div className="h-10 w-10 bg-slate-800 rounded-lg animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-3/4 bg-slate-800 rounded animate-pulse" />
            <div className="h-3 w-1/2 bg-slate-800 rounded animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );

  const renderCircle = () => (
    <div className="w-11 h-11 bg-slate-800 rounded-2xl animate-pulse" />
  );

  if (type === "table") return renderTable();
  if (type === "circle") return renderCircle();
  return renderCard();
}