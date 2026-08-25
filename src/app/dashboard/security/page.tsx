"use client";

import { useEffect, useState, useCallback } from "react";
import { ExportMenu } from "@/components/dashboard/export-menu";

interface SecurityTimelineEvent {
  id: string;
  eventType: string;
  severity: "info" | "warning" | "high" | "critical";
  title: string;
  description: string;
  metadata: any | null;
  ipAddress: string | null;
  deviceName: string | null;
  location: string | null;
  timestamp: string;
  acknowledged: boolean;
  acknowledgedAt: string | null;
}

interface SecurityTimelineResponse {
  data: SecurityTimelineEvent[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  unacknowledgedCount: number;
}

interface LoginHistoryEntry {
  id: string;
  success: boolean;
  timestamp: string;
  deviceFingerprint: string;
  deviceName: string | null;
  ipAddress: string;
  country: string | null;
  city: string | null;
  isNewDevice: boolean;
  isNewLocation: boolean;
  isSuspicious: boolean;
  riskScore: number | null;
  failureReason: string | null;
  sessionId: string | null;
}

interface LoginHistoryResponse {
  data: LoginHistoryEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  stats: {
    totalLogins: number;
    successRate: number;
    uniqueDevices: number;
    uniqueLocations: number;
    uniqueCountries: number;
    byCountry: Record<string, number>;
    byDevice: Record<string, number>;
    recentActivity: Array<{ date: string; logins: number; failures: number }>;
  };
}

interface UserSession {
  id: string;
  deviceName: string | null;
  browser: string | null;
  os: string | null;
  ipAddress: string;
  country: string | null;
  city: string | null;
  isActive: boolean;
  isNewDevice: boolean;
  isNewLocation: boolean;
  isSuspicious: boolean;
  lastActivityAt: string;
  createdAt: string;
  expiresAt: string;
}

interface UserSessionResponse {
  data: UserSession[];
}

const SEVERITY_COLORS: Record<string, string> = {
  info: "text-blue-400 bg-blue-500/10 border-blue-500/20",
  warning: "text-amber-400 bg-amber-500/10 border-amber-500/20",
  high: "text-orange-400 bg-orange-500/10 border-orange-500/20",
  critical: "text-red-400 bg-red-500/10 border-red-500/20",
};

const EVENT_ICONS: Record<string, string> = {
  login: "🔐",
  logout: "🚪",
  password_change: "🔑",
  mfa_enabled: "🛡️",
  session_revoked: "🔒",
  new_device_login: "📱",
  new_location_login: "📍",
  failed_login: "❌",
};

export default function SecurityDashboardPage() {
  const [timeline, setTimeline] = useState<SecurityTimelineEvent[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(true);
  const [timelinePage, setTimelinePage] = useState(1);
  const [timelineTotal, setTimelineTotal] = useState(0);
  const [timelineTotalPages, setTimelineTotalPages] = useState(0);
  const [unacknowledgedCount, setUnacknowledgedCount] = useState(0);
  const [timelineFilters, setTimelineFilters] = useState({ severity: "", acknowledged: "" });

  const [loginHistory, setLoginHistory] = useState<LoginHistoryEntry[]>([]);
  const [loginHistoryLoading, setLoginHistoryLoading] = useState(true);
  const [loginHistoryPage, setLoginHistoryPage] = useState(1);
  const [loginHistoryTotal, setLoginHistoryTotal] = useState(0);
  const [loginHistoryTotalPages, setLoginHistoryTotalPages] = useState(0);
  const [loginStats, setLoginStats] = useState<LoginHistoryResponse["stats"] | null>(null);
  const [loginFilters, setLoginFilters] = useState({ success: "", dateFrom: "", dateTo: "" });

  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [expandedTimelineId, setExpandedTimelineId] = useState<string | null>(null);
  const [expandedLoginId, setExpandedLoginId] = useState<string | null>(null);

  const fetchTimeline = useCallback(async () => {
    setTimelineLoading(true);
    try {
      const params = new URLSearchParams({
        page: timelinePage.toString(),
        limit: "20",
      });
      if (timelineFilters.severity) params.set("severity", timelineFilters.severity);
      if (timelineFilters.acknowledged) params.set("acknowledged", timelineFilters.acknowledged);

      const res = await fetch(`/api/security/timeline?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const json: SecurityTimelineResponse = await res.json();
      setTimeline(json.data);
      setTimelineTotal(json.total);
      setTimelineTotalPages(json.totalPages);
      setUnacknowledgedCount(json.unacknowledgedCount);
    } catch (err) {
      console.error("Failed to fetch security timeline:", err);
    } finally {
      setTimelineLoading(false);
    }
  }, [timelinePage, timelineFilters.severity, timelineFilters.acknowledged]);

  const fetchLoginHistory = useCallback(async () => {
    setLoginHistoryLoading(true);
    try {
      const params = new URLSearchParams({
        page: loginHistoryPage.toString(),
        limit: "20",
      });
      if (loginFilters.success) params.set("success", loginFilters.success);
      if (loginFilters.dateFrom) params.set("dateFrom", loginFilters.dateFrom);
      if (loginFilters.dateTo) params.set("dateTo", loginFilters.dateTo);

      const res = await fetch(`/api/auth/history?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const json: LoginHistoryResponse = await res.json();
      setLoginHistory(json.data);
      setLoginHistoryTotal(json.total);
      setLoginHistoryTotalPages(json.totalPages);
      setLoginStats(json.stats);
    } catch (err) {
      console.error("Failed to fetch login history:", err);
    } finally {
      setLoginHistoryLoading(false);
    }
  }, [loginHistoryPage, loginFilters.success, loginFilters.dateFrom, loginFilters.dateTo]);

  const fetchSessions = useCallback(async () => {
    setSessionsLoading(true);
    try {
      const res = await fetch("/api/auth/sessions");
      if (!res.ok) throw new Error("Failed to fetch");
      const json: UserSessionResponse = await res.json();
      setSessions(json.data);
    } catch (err) {
      console.error("Failed to fetch sessions:", err);
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => { fetchTimeline(); }, [fetchTimeline]);
  useEffect(() => { fetchLoginHistory(); }, [fetchLoginHistory]);
  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const handleAcknowledge = async (eventId: string) => {
    try {
      const res = await fetch(`/api/security/timeline/${eventId}/acknowledge`, { method: "POST" });
      if (res.ok) {
        setTimeline((prev) => prev.map((e) => (e.id === eventId ? { ...e, acknowledged: true, acknowledgedAt: new Date().toISOString() } : e)));
        setUnacknowledgedCount((prev) => Math.max(0, prev - 1));
      }
    } catch (err) {
      console.error("Failed to acknowledge:", err);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    if (!confirm("Revoke this session? You will be logged out from that device.")) return;
    try {
      const res = await fetch(`/api/auth/sessions/${sessionId}`, { method: "DELETE" });
      if (res.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      }
    } catch (err) {
      console.error("Failed to revoke session:", err);
    }
  };

  const handleRevokeAllOtherSessions = async () => {
    if (!confirm("Revoke ALL other sessions? You will stay logged in on this device only.")) return;
    try {
      const res = await fetch("/api/auth/sessions", { method: "DELETE" });
      if (res.ok) {
        fetchSessions();
      }
    } catch (err) {
      console.error("Failed to revoke sessions:", err);
    }
  };

  const buildSecurityReportUrl = () => "/api/security/report";

  const getSeverityBadge = (severity: string) => (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border ${SEVERITY_COLORS[severity]}`}>
      {severity.toUpperCase()}
    </span>
  );

  const getEventBadge = (eventType: string) => {
    const icon = EVENT_ICONS[eventType] || "⚙️";
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border border-slate-700 bg-slate-800 text-slate-300">{icon} {eventType.replace(/_/g, ' ')}</span>;
  };

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleString("id-ID", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Security Dashboard</h2>
          <p className="text-slate-400 mt-1 text-sm">Monitor keamanan akun dan aktivitas login</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu buildUrl={buildSecurityReportUrl} />
          <a href="/api/security/report" className="px-4 py-2 bg-blue-600 border border-blue-500 rounded-lg text-sm text-white hover:bg-blue-500">
            📥 Download Security Report
          </a>
        </div>
      </div>

      {/* Alert Banner */}
      {unacknowledgedCount > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="font-medium text-amber-300">Unacknowledged Security Events</p>
              <p className="text-sm text-slate-400">You have {unacknowledgedCount} security event{unacknowledgedCount > 1 ? "s" : ""} requiring attention</p>
            </div>
          </div>
          <button onClick={() => setTimelineFilters((p) => ({ ...p, acknowledged: "false" }))} className="px-3 py-1.5 bg-amber-600 border border-amber-500 rounded-lg text-sm text-white hover:bg-amber-500">
            View Events
          </button>
        </div>
      )}

      {/* Active Sessions */}
      <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Active Sessions</h3>
          <button onClick={handleRevokeAllOtherSessions} className="px-3 py-1.5 bg-rose-600 border border-rose-500 rounded-lg text-sm text-white hover:bg-rose-500">
            🔒 Revoke All Other Sessions
          </button>
        </div>
        {sessionsLoading ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-16 bg-slate-800/50 animate-pulse rounded" />)}</div>
        ) : sessions.length === 0 ? (
          <p className="text-slate-500 text-center py-4">No active sessions</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800">
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Device</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Browser / OS</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Location</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Status</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Last Activity</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {sessions.map((session) => (
                  <tr key={session.id} className={session.isSuspicious ? "bg-red-500/5" : ""}>
                    <td className="px-4 py-3 text-sm">
                      <div className="font-medium text-white">{session.deviceName || "Unknown Device"}</div>
                      <div className="text-xs text-slate-500 font-mono">{session.ipAddress}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">
                      {session.browser} / {session.os}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">
                      {session.city && session.country ? `${session.city}, ${session.country}` : session.country || "Unknown"}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${
                        session.isSuspicious ? "text-red-400 bg-red-500/10 border-red-500/20" :
                        session.isNewDevice ? "text-amber-400 bg-amber-500/10 border-amber-500/20" :
                        "text-green-400 bg-green-500/10 border-green-500/20"
                      }`}>
                        {session.isSuspicious ? "⚠️ Suspicious" : session.isNewDevice ? "📱 New Device" : "✅ Trusted"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">{formatDate(session.lastActivityAt)}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleRevokeSession(session.id)}
                        disabled={!session.isActive}
                        className="px-3 py-1 text-xs bg-rose-600 border border-rose-500 rounded-lg text-white hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Security Timeline */}
      <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h3 className="text-lg font-semibold text-white">Security Timeline</h3>
          <div className="flex items-center gap-2">
            <select value={timelineFilters.severity} onChange={(e) => setTimelineFilters(p => ({ ...p, severity: e.target.value }))} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white">
              <option value="">All Severities</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>
            <select value={timelineFilters.acknowledged} onChange={(e) => setTimelineFilters(p => ({ ...p, acknowledged: e.target.value }))} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white">
              <option value="">All</option>
              <option value="false">Unacknowledged</option>
              <option value="true">Acknowledged</option>
            </select>
          </div>
        </div>

        {timelineLoading ? (
          <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-20 bg-slate-800/50 animate-pulse rounded" />)}</div>
        ) : timeline.length === 0 ? (
          <p className="text-slate-500 text-center py-8">No security events</p>
        ) : (
          <>
            <div className="space-y-3">
              {timeline.map((event) => (
                <div key={event.id} className={`border rounded-lg p-4 transition-colors ${event.acknowledged ? "bg-slate-800/30" : "bg-amber-500/5 border-amber-500/20"}`} onClick={() => setExpandedTimelineId(expandedTimelineId === event.id ? null : event.id)}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3 flex-1">
                      <span className="text-2xl">{EVENT_ICONS[event.eventType] || "⚙️"}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-white">{event.title}</p>
                          {getSeverityBadge(event.severity)}
                          {getEventBadge(event.eventType)}
                        </div>
                        <p className="text-sm text-slate-400 mt-1">{event.description}</p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
                          <span>{formatDate(event.timestamp)}</span>
                          {event.location && <span>📍 {event.location}</span>}
                          {event.deviceName && <span>📱 {event.deviceName}</span>}
                          {event.ipAddress && <span>🌐 {event.ipAddress}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {!event.acknowledged && (
                        <button onClick={(e) => { e.stopPropagation(); handleAcknowledge(event.id); }} className="px-3 py-1.5 bg-green-600 border border-green-500 rounded-lg text-sm text-white hover:bg-green-500">
                          ✅ Acknowledge
                        </button>
                      )}
                      <span className={`text-xs font-mono ${event.acknowledged ? "text-green-400" : "text-amber-400"}`}>
                        {event.acknowledged ? "✓ Acknowledged" : "⏳ Pending"}
                      </span>
                    </div>
                  </div>
                  {expandedTimelineId === event.id && event.metadata && (
                    <div className="mt-4 pt-4 border-t border-slate-800">
                      <p className="text-xs font-semibold text-slate-400 mb-1">Metadata</p>
                      <pre className="text-[10px] text-slate-300 overflow-x-auto max-h-48 bg-slate-950 p-3 rounded">{JSON.stringify(event.metadata, null, 2)}</pre>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {timelineTotalPages > 1 && (
              <div className="px-4 py-3 border-t border-slate-800 flex items-center justify-between">
                <p className="text-sm text-slate-400">Menampilkan {(timelinePage - 1) * 20 + 1} - {Math.min(timelinePage * 20, timelineTotal)} dari {timelineTotal}</p>
                <div className="flex items-center gap-2">
                  <button onClick={() => setTimelinePage(p => Math.max(1, p - 1))} disabled={timelinePage === 1} className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 hover:bg-slate-700 disabled:opacity-50">Sebelumnya</button>
                  <span className="text-sm text-slate-300 px-2">Halaman {timelinePage} / {timelineTotalPages}</span>
                  <button onClick={() => setTimelinePage(p => Math.min(timelineTotalPages, p + 1))} disabled={timelinePage === timelineTotalPages} className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 hover:bg-slate-700 disabled:opacity-50">Selanjutnya</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Login History */}
      <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h3 className="text-lg font-semibold text-white">Login History</h3>
          <div className="flex items-center gap-2">
            <select value={loginFilters.success} onChange={(e) => setLoginFilters(p => ({ ...p, success: e.target.value }))} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white">
              <option value="">All</option>
              <option value="true">Success</option>
              <option value="false">Failed</option>
            </select>
            <input type="date" value={loginFilters.dateFrom} onChange={(e) => setLoginFilters(p => ({ ...p, dateFrom: e.target.value }))} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white" />
            <input type="date" value={loginFilters.dateTo} onChange={(e) => setLoginFilters(p => ({ ...p, dateTo: e.target.value }))} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white" />
          </div>
        </div>

        {loginStats && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 p-3 bg-slate-800/50 rounded-lg">
            <div className="text-center"><p className="text-2xl font-bold text-white">{loginStats.totalLogins}</p><p className="text-xs text-slate-400">Total Logins</p></div>
            <div className="text-center"><p className="text-2xl font-bold text-green-400">{loginStats.successRate.toFixed(1)}%</p><p className="text-xs text-slate-400">Success Rate</p></div>
            <div className="text-center"><p className="text-2xl font-bold text-blue-400">{loginStats.uniqueDevices}</p><p className="text-xs text-slate-400">Unique Devices</p></div>
            <div className="text-center"><p className="text-2xl font-bold text-purple-400">{loginStats.uniqueLocations}</p><p className="text-xs text-slate-400">Unique Locations</p></div>
            <div className="text-center"><p className="text-2xl font-bold text-orange-400">{loginStats.uniqueCountries}</p><p className="text-xs text-slate-400">Countries</p></div>
          </div>
        )}

        {loginHistoryLoading ? (
          <div className="space-y-2">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-16 bg-slate-800/50 animate-pulse rounded" />)}</div>
        ) : loginHistory.length === 0 ? (
          <p className="text-slate-500 text-center py-8">No login history</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Time</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Status</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Device</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Location</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Flags</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Risk</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Detail</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {loginHistory.map((login) => (
                    <tr key={login.id} className={login.isSuspicious ? "bg-red-500/5" : ""} onClick={() => setExpandedLoginId(expandedLoginId === login.id ? null : login.id)}>
                      <td className="px-4 py-3 text-sm text-slate-300 whitespace-nowrap">{formatDate(login.timestamp)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${login.success ? "text-green-400 bg-green-500/10 border-green-500/20" : "text-red-400 bg-red-500/10 border-red-500/20"}`}>
                          {login.success ? "✅ Success" : "❌ Failed"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-300">{login.deviceName || "Unknown"}</td>
                      <td className="px-4 py-3 text-sm text-slate-300">{login.city && login.country ? `${login.city}, ${login.country}` : login.country || "Unknown"}</td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex flex-wrap gap-1">
                          {login.isNewDevice && <span className="px-1.5 py-0.5 text-[10px] bg-amber-500/20 text-amber-400 rounded">New Device</span>}
                          {login.isNewLocation && <span className="px-1.5 py-0.5 text-[10px] bg-blue-500/20 text-blue-400 rounded">New Location</span>}
                          {login.isSuspicious && <span className="px-1.5 py-0.5 text-[10px] bg-red-500/20 text-red-400 rounded">Suspicious</span>}
                          {login.failureReason && <span className="px-1.5 py-0.5 text-[10px] bg-slate-500/20 text-slate-400 rounded">{login.failureReason}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm font-mono text-right">
                        {login.riskScore !== null ? (
                          <span className={login.riskScore >= 70 ? "text-red-400" : login.riskScore >= 40 ? "text-amber-400" : "text-green-400"}>
                            {login.riskScore}/100
                          </span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button className="text-xs text-blue-400 hover:text-blue-300">{expandedLoginId === login.id ? "▲" : "▼"} Detail</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {loginHistory.map((login) =>
              expandedLoginId === login.id ? (
                <tr key={`login-detail-${login.id}`} className="bg-slate-800/50">
                  <td colSpan={7} className="px-4 py-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
                        <p className="text-xs font-semibold text-slate-400 mb-1">Details</p>
                        <pre className="text-[10px] text-slate-300 overflow-x-auto max-h-48">{JSON.stringify(login, null, 2)}</pre>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : null
            )}

            {loginHistoryTotalPages > 1 && (
              <div className="px-4 py-3 border-t border-slate-800 flex items-center justify-between">
                <p className="text-sm text-slate-400">Menampilkan {(loginHistoryPage - 1) * 20 + 1} - {Math.min(loginHistoryPage * 20, loginHistoryTotal)} dari {loginHistoryTotal}</p>
                <div className="flex items-center gap-2">
                  <button onClick={() => setLoginHistoryPage(p => Math.max(1, p - 1))} disabled={loginHistoryPage === 1} className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 hover:bg-slate-700 disabled:opacity-50">Sebelumnya</button>
                  <span className="text-sm text-slate-300 px-2">Halaman {loginHistoryPage} / {loginHistoryTotalPages}</span>
                  <button onClick={() => setLoginHistoryPage(p => Math.min(loginHistoryTotalPages, p + 1))} disabled={loginHistoryPage === loginHistoryTotalPages} className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 hover:bg-slate-700 disabled:opacity-50">Selanjutnya</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}