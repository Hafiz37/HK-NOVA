export function AnomalyBadge({ severity }: { severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' }) {
  const styles = {
    CRITICAL: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
    HIGH: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    MEDIUM: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    LOW: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  };

  const labels = {
    CRITICAL: '🔴 CRITICAL',
    HIGH: '🟠 HIGH',
    MEDIUM: '🟡 MEDIUM',
    LOW: '🟢 LOW',
  };

  return (
    <span className={`px-2 py-0.5 text-xs font-bold rounded border ${styles[severity]}`}>
      {labels[severity]}
    </span>
  );
}
