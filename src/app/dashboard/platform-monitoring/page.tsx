'use client';

import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';

// Simple Card component
const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <div className={`bg-gray-900 border border-gray-800 rounded-lg shadow-lg ${className}`}>
    {children}
  </div>
);

interface MonitoringStats {
  conditionEvaluations: {
    timestamp: string;
    success: number;
    failed: number;
  }[];
  rateLimitViolations: {
    endpoint: string;
    count: number;
    topIPs: { ip: string; count: number }[];
  }[];
  suspiciousPatterns: {
    type: string;
    severity: string;
    count: number;
    timestamp: string;
  }[];
  workerHealth: {
    name: string;
    lastRun: Date;
    status: 'healthy' | 'warning' | 'error';
    lag: number;
  }[];
}

export default function PlatformMonitoringPage() {
  const [stats, setStats] = useState<MonitoringStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  async function fetchStats() {
    try {
      const res = await fetch('/api/monitoring/platform');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Failed to fetch monitoring stats:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Platform Monitoring</h1>
        <p className="text-gray-600 mt-2">Real-time monitoring of system performance and security</p>
      </div>

      {/* Condition Evaluations Chart */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Condition Evaluations</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={stats?.conditionEvaluations || []}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="timestamp" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="success" stroke="#10b981" name="Success" />
            <Line type="monotone" dataKey="failed" stroke="#ef4444" name="Failed" />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      {/* Rate Limit Violations */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Rate Limit Violations</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={stats?.rateLimitViolations || []}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="endpoint" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="count" fill="#f59e0b" name="Violations" />
          </BarChart>
        </ResponsiveContainer>
        
        {stats?.rateLimitViolations && stats.rateLimitViolations.length > 0 && (
          <div className="mt-4">
            <h3 className="font-medium mb-2">Top Offender IPs</h3>
            <div className="space-y-2">
              {stats.rateLimitViolations[0]?.topIPs?.slice(0, 5).map((ip) => (
                <div key={ip.ip} className="flex justify-between text-sm">
                  <span className="font-mono">{ip.ip}</span>
                  <span className="text-gray-600">{ip.count} violations</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Suspicious Patterns */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Suspicious Patterns Detected</h2>
        {stats?.suspiciousPatterns && stats.suspiciousPatterns.length > 0 ? (
          <div className="space-y-2">
            {stats.suspiciousPatterns.map((pattern, idx) => (
              <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                <div>
                  <span className="font-medium">{pattern.type}</span>
                  <span className="text-sm text-gray-600 ml-2">({pattern.count} occurrences)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 rounded text-xs ${
                    pattern.severity === 'high' ? 'bg-red-100 text-red-800' :
                    pattern.severity === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-blue-100 text-blue-800'
                  }`}>
                    {pattern.severity.toUpperCase()}
                  </span>
                  <span className="text-sm text-gray-500">{pattern.timestamp}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500">No suspicious patterns detected</p>
        )}
      </Card>

      {/* Worker Health Status */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Worker Health Status</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stats?.workerHealth?.map((worker) => (
            <div key={worker.name} className="p-4 border rounded">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">{worker.name}</span>
                <span className={`w-3 h-3 rounded-full ${
                  worker.status === 'healthy' ? 'bg-green-500' :
                  worker.status === 'warning' ? 'bg-yellow-500' :
                  'bg-red-500'
                }`}></span>
              </div>
              <div className="text-sm text-gray-600">
                <p>Last run: {new Date(worker.lastRun).toLocaleString()}</p>
                <p>Lag: {worker.lag}s</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Metrics Link */}
      <Card className="p-6 bg-blue-50">
        <h3 className="font-semibold mb-2">Prometheus Metrics</h3>
        <p className="text-sm text-gray-600 mb-3">
          Raw Prometheus metrics are available for scraping or integration with monitoring tools like Grafana.
        </p>
        <a 
          href="/api/metrics" 
          target="_blank"
          className="text-blue-600 hover:underline text-sm font-medium"
        >
          View Prometheus Metrics →
        </a>
      </Card>
    </div>
  );
}
