"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from "recharts";
import Link from "next/link";

interface FeatureContribution {
  featureName: string;
  value: number;
  normalValue: number;
  deviation: number;
  contribution: number;
  severity: "LOW" | "MEDIUM" | "HIGH";
}

interface AnomalyDetail {
  anomaly: {
    id: string;
    deviceId: string;
    device: {
      id: string;
      name: string;
      ip: string;
      type: string;
      location: string | null;
    } | null;
    metricType: string;
    anomalyScore: number;
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    timestamp: string;
    autoResolved: boolean;
    resolvedAt: string | null;
    confidence?: number;
    explanation?: {
      summary: string;
      topContributors: FeatureContribution[];
      recommendation: string;
    };
    contributingFeatures?: FeatureContribution[];
    algorithmVotes?: Record<string, { score: number; isAnomaly: boolean }>;
  };
  relatedAnomalies: Array<{
    id: string;
    deviceId: string;
    device: { name: string; ip: string } | null;
    metricType: string;
    anomalyScore: number;
    severity: string;
    timestamp: string;
  }>;
  scoreHistory: Array<{
    anomalyScore: number;
    severity: string;
    timestamp: string;
  }>;
  feedback?: {
    feedback: string;
    user: { username: string; fullName: string | null };
    comment: string | null;
    tags: string[];
    createdAt: string;
  } | null;
}

const SEV_STYLES: Record<string, { label: string; cls: string; color: string; bg: string }> = {
  CRITICAL: { label: "CRITICAL", cls: "text-rose-400", color: "#f43f5e", bg: "bg-rose-500/20" },
  HIGH:     { label: "HIGH",     cls: "text-orange-400", color: "#fb923c", bg: "bg-orange-500/20" },
  MEDIUM:   { label: "MEDIUM",   cls: "text-amber-400", color: "#fbbf24", bg: "bg-amber-500/20" },
  LOW:      { label: "LOW",      cls: "text-emerald-400", color: "#34d399", bg: "bg-emerald-500/20" },
};

function SevBadge({ severity }: { severity: string }) {
  const s = SEV_STYLES[severity] ?? SEV_STYLES.LOW;
  return (
    <span className={`px-3 py-1 text-sm font-bold rounded-full border ${s.bg} ${s.cls} border-opacity-30`}>
      {s.label}
    </span>
  );
}

function MetricCard({ label, value, unit = "" }: { label: string; value: string | number; unit?: string }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
      <p className="text-xs text-slate-400 font-medium">{label}</p>
      <p className="text-2xl font-bold text-slate-100 mt-1">{value} <span className="text-sm font-normal text-slate-400">{unit}</span></p>
    </div>
  );
}

function FeatureBarChart({ data }: { data: FeatureContribution[] }) {
  if (!data.length) return <div className="h-48 flex items-center justify-center text-slate-400">No contribution data</div>;

  const chartData = data.map((d) => ({
    name: d.featureName.length > 15 ? d.featureName.substring(0, 15) + "..." : d.featureName,
    contribution: d.contribution * 100,
    deviation: d.deviation,
    fullName: d.featureName,
    severity: d.severity,
  }));

  const COLORS = { HIGH: "#f43f5e", MEDIUM: "#fb923c", LOW: "#34d399" };

  return (
    <div className="h-64">
      <BarChart data={chartData} layout="vertical" margin={{ top: 10, right: 10, left: 100, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" horizontal={false} />
        <XAxis type="number" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
        <YAxis dataKey="name" type="category" stroke="#64748b" fontSize={10} tickLine={false} axisLine={{ stroke: "#334155" }} width={100} />
<Tooltip
                    contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(v: any) => (v ?? 0).toFixed(3)}
                  />
        <Bar dataKey="contribution" radius={[0, 4, 4, 0]}>
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={COLORS[entry.severity as keyof typeof COLORS] || "#6366f1"} />
          ))}
        </Bar>
      </BarChart>
    </div>
  );
}

function AlgorithmVotes({ votes }: { votes: Record<string, { score: number; isAnomaly: boolean }> }) {
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
      <h3 className="text-sm font-semibold mb-3">Algorithm Votes</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {Object.entries(votes).map(([algo, result]) => (
          <div key={algo} className="p-3 bg-slate-900/50 rounded border border-slate-700">
            <p className="text-xs text-slate-400 font-medium">{algo}</p>
            <div className="flex items-center justify-between mt-2">
              <span className="text-lg font-bold text-slate-100">{(result.score * 100).toFixed(1)}%</span>
              <span className={`px-2 py-0.5 text-xs rounded-full ${result.isAnomaly ? "bg-rose-500/20 text-rose-400" : "bg-emerald-500/20 text-emerald-400"}`}>
                {result.isAnomaly ? "ANOMALY" : "NORMAL"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AnomalyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [data, setData] = useState<AnomalyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchDetail = async () => {
      try {
        const res = await fetch(`/api/anomalies/explain?anomalyId=${params.id}`);
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Failed to fetch" }));
          throw new Error(err.error || "Failed to fetch anomaly detail");
        }
        const json = await res.json();
        setData(json.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };
    fetchDetail();
  }, [params.id]);

  const handleFeedback = async (feedbackType: string) => {
    try {
      const res = await fetch("/api/anomalies/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ anomalyId: params.id, feedback: feedbackType }),
      });
      if (res.ok) {
        alert("Feedback submitted!");
        router.refresh();
      }
    } catch (err) {
      console.error("Failed to submit feedback:", err);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">🔍 Anomaly Detail</h1>
        <p className="text-slate-400">Loading...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">🔍 Anomaly Detail</h1>
        <p className="text-rose-400">{error || "Anomaly not found"}</p>
        <Link href="/dashboard/anomalies" className="mt-4 inline-block text-blue-400 hover:underline">← Back to Anomalies</Link>
      </div>
    );
  }

  const a = data.anomaly;
  const sev = SEV_STYLES[a.severity];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link href="/dashboard/anomalies" className="text-blue-400 hover:underline text-sm mb-2 inline-block">← Back to Anomalies</Link>
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold">Anomaly Detail</h1>
            <SevBadge severity={a.severity} />
          </div>
          <p className="text-sm text-slate-400 mt-1">
            {a.device?.name} ({a.device?.ip}) · {a.metricType} · {format(new Date(a.timestamp), "PPpp")}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => handleFeedback("TRUE_POSITIVE")} className="px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded text-sm hover:bg-emerald-500/30">✅ True Positive</button>
          <button onClick={() => handleFeedback("FALSE_POSITIVE")} className="px-3 py-1 bg-rose-500/20 text-rose-400 rounded text-sm hover:bg-rose-500/30">❌ False Positive</button>
          <button onClick={() => handleFeedback("EXPECTED_BEHAVIOR")} className="px-3 py-1 bg-amber-500/20 text-amber-400 rounded text-sm hover:bg-amber-500/30">⚙️ Expected</button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Anomaly Score" value={a.anomalyScore.toFixed(3)} />
        <MetricCard label="Confidence" value={`${(a.confidence ?? 0).toFixed(0)}%`} />
        <MetricCard label="Agreeing Algorithms" value={Object.values(a.algorithmVotes ?? {}).filter((v) => v.isAnomaly).length} unit={` / ${Object.keys(a.algorithmVotes ?? {}).length}`} />
        <MetricCard label="Status" value={a.autoResolved ? "Auto-Resolved" : "Active"} />
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Explanation & Root Cause */}
        <div className="lg:col-span-2 space-y-6">
          {/* Explanation Card */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-6">
            <h3 className="text-lg font-semibold mb-4">🧠 Root Cause Analysis</h3>
            {a.explanation && (
              <>
                <div className="mb-4 p-3 bg-slate-900/50 rounded border border-slate-700">
                  <p className="text-slate-300">{a.explanation.summary}</p>
                </div>
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-slate-300 mb-2">Top Contributing Features</h4>
                  <FeatureBarChart data={a.explanation.topContributors} />
                </div>
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded">
                  <p className="text-sm font-medium text-emerald-400 mb-1">💡 Recommendation</p>
                  <p className="text-slate-300 text-sm">{a.explanation.recommendation}</p>
                </div>
              </>
            )}
            {(!a.explanation || !a.explanation.topContributors.length) && (
              <p className="text-slate-400">No detailed explanation available for this anomaly.</p>
            )}
          </div>

          {/* Algorithm Votes */}
          {a.algorithmVotes && Object.keys(a.algorithmVotes).length > 0 && (
            <AlgorithmVotes votes={a.algorithmVotes} />
          )}

          {/* Contributing Features Table */}
          {a.contributingFeatures && a.contributingFeatures.length > 0 && (
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
              <h3 className="text-sm font-semibold mb-3">All Contributing Features</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-700">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400">Feature</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400">Value</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400">Normal</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400">Deviation</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400">Contribution</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400">Severity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {a.contributingFeatures.map((f, i) => {
                      const sev = SEV_STYLES[f.severity] ?? SEV_STYLES.LOW;
                      return (
                        <tr key={i} className="hover:bg-slate-700/30">
                          <td className="px-3 py-2 text-slate-300 font-mono">{f.featureName}</td>
                          <td className="px-3 py-2 text-slate-300 font-mono">{f.value.toFixed(2)}</td>
                          <td className="px-3 py-2 text-slate-500 font-mono">{f.normalValue.toFixed(2)}</td>
                          <td className="px-3 py-2 text-slate-300 font-mono">{f.deviation.toFixed(1)}σ</td>
                          <td className="px-3 py-2 text-slate-300 font-mono">{(f.contribution * 100).toFixed(1)}%</td>
                          <td className="px-3 py-2"><span className={`px-2 py-0.5 text-xs rounded-full ${sev.bg} ${sev.cls}`}>{f.severity}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Score History Chart */}
          {data.scoreHistory && data.scoreHistory.length > 1 && (
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
              <h3 className="text-sm font-semibold mb-3">Score History (Last 50)</h3>
              <div className="h-64">
                <LineChart data={data.scoreHistory.slice().reverse()} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="timestamp" stroke="#64748b" fontSize={10} tickLine={false} axisLine={{ stroke: "#334155" }} tickFormatter={(v) => format(new Date(v), "MM/dd HH:mm")} />
                  <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} domain={[0, 1]} />
                  <Tooltip
                    contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(v: any) => (v ?? 0).toFixed(3)}
                  />
                  <Line type="monotone" dataKey="anomalyScore" stroke={sev.color} strokeWidth={2} dot={false} />
                </LineChart>
              </div>
            </div>
          )}

          {/* Related Anomalies */}
          {data.relatedAnomalies && data.relatedAnomalies.length > 0 && (
            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
              <h3 className="text-sm font-semibold mb-3">Related Anomalies (±30 min)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-700">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400">Time</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400">Device</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400">Metric</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400">Score</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-400">Severity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                    {data.relatedAnomalies.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-700/30">
                        <td className="px-3 py-2 text-slate-300">{format(new Date(r.timestamp), "HH:mm:ss")}</td>
                        <td className="px-3 py-2 text-slate-300">{r.device?.name}</td>
                        <td className="px-3 py-2 text-slate-300 font-mono">{r.metricType}</td>
                        <td className="px-3 py-2 font-mono">{r.anomalyScore.toFixed(3)}</td>
                        <td className="px-3 py-2"><SevBadge severity={r.severity} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Right Column - Device Info & Feedback */}
        <div className="space-y-6">
          {/* Device Info */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-3">Device Info</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-slate-400">Name</dt><dd className="text-slate-200 font-mono">{a.device?.name}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">IP</dt><dd className="text-slate-200 font-mono">{a.device?.ip}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">Type</dt><dd className="text-slate-200">{a.device?.type}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">Location</dt><dd className="text-slate-200">{a.device?.location || "N/A"}</dd></div>
            </dl>
          </div>

          {/* Anomaly Context */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-3">Anomaly Context</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-slate-400">Metric Type</dt><dd className="text-slate-200 font-mono">{a.metricType}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">Timestamp</dt><dd className="text-slate-200">{format(new Date(a.timestamp), "PPpp")}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-400">Auto-Resolved</dt><dd className="text-slate-200">{a.autoResolved ? "Yes" : "No"}</dd></div>
              {a.resolvedAt && <div className="flex justify-between"><dt className="text-slate-400">Resolved At</dt><dd className="text-slate-200">{format(new Date(a.resolvedAt), "PPpp")}</dd></div>}
            </dl>
          </div>

          {/* Feedback */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-3">Feedback</h3>
            {data.feedback ? (
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-slate-400">Status</dt><dd className="text-slate-200">{data.feedback.feedback}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-400">By</dt><dd className="text-slate-200">{data.feedback.user.fullName || data.feedback.user.username}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-400">At</dt><dd className="text-slate-200">{format(new Date(data.feedback.createdAt), "PPpp")}</dd></div>
                {data.feedback.comment && <div className="flex justify-between"><dt className="text-slate-400">Comment</dt><dd className="text-slate-200">{data.feedback.comment}</dd></div>}
                {data.feedback.tags?.length && <div className="flex justify-between"><dt className="text-slate-400">Tags</dt><dd className="text-slate-200">{data.feedback.tags.join(", ")}</dd></div>}
              </dl>
            ) : (
              <p className="text-slate-400 text-sm">No feedback submitted yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}