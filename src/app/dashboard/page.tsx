export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Selamat Datang di HK-NOVA</h2>
        <p className="text-slate-400 mt-1">Platform Network Operations Center untuk ISP</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">Total Devices</p>
              <p className="text-3xl font-bold text-white mt-1">0</p>
            </div>
            <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center">
              <span className="text-2xl">🖥️</span>
            </div>
          </div>
          <div className="mt-4 flex items-center text-xs">
            <span className="text-green-400">0 UP</span>
            <span className="text-slate-600 mx-2">•</span>
            <span className="text-red-400">0 DOWN</span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">Active Alerts</p>
              <p className="text-3xl font-bold text-white mt-1">0</p>
            </div>
            <div className="w-12 h-12 bg-red-500/10 rounded-lg flex items-center justify-center">
              <span className="text-2xl">🔔</span>
            </div>
          </div>
          <div className="mt-4 text-xs text-slate-500">
            No active alerts
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">Anomalies</p>
              <p className="text-3xl font-bold text-white mt-1">0</p>
            </div>
            <div className="w-12 h-12 bg-yellow-500/10 rounded-lg flex items-center justify-center">
              <span className="text-2xl">🔍</span>
            </div>
          </div>
          <div className="mt-4 text-xs text-slate-500">
            Last 24 hours
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">Backups</p>
              <p className="text-3xl font-bold text-white mt-1">0</p>
            </div>
            <div className="w-12 h-12 bg-green-500/10 rounded-lg flex items-center justify-center">
              <span className="text-2xl">💾</span>
            </div>
          </div>
          <div className="mt-4 text-xs text-slate-500">
            Last backup: Never
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <a
            href="/dashboard/devices"
            className="flex items-center gap-3 p-4 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <span className="text-2xl">➕</span>
            <div>
              <p className="text-sm font-medium text-white">Add Device</p>
              <p className="text-xs text-slate-400">Register new network device</p>
            </div>
          </a>

          <a
            href="/dashboard/monitoring"
            className="flex items-center gap-3 p-4 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <span className="text-2xl">📊</span>
            <div>
              <p className="text-sm font-medium text-white">View Monitoring</p>
              <p className="text-xs text-slate-400">Real-time network status</p>
            </div>
          </a>

          <a
            href="/dashboard/provisioning"
            className="flex items-center gap-3 p-4 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
          >
            <span className="text-2xl">⚙️</span>
            <div>
              <p className="text-sm font-medium text-white">Provision Service</p>
              <p className="text-xs text-slate-400">Create new customer service</p>
            </div>
          </a>
        </div>
      </div>

      {/* System Status */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-white mb-4">System Status</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span className="text-sm text-slate-300">ICMP Worker</span>
            </div>
            <span className="text-xs text-slate-500">Not Running</span>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span className="text-sm text-slate-300">SNMP Worker</span>
            </div>
            <span className="text-xs text-slate-500">Not Running</span>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span className="text-sm text-slate-300">Backup Worker</span>
            </div>
            <span className="text-xs text-slate-500">Not Running</span>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              <span className="text-sm text-slate-300">Anomaly Detector</span>
            </div>
            <span className="text-xs text-slate-500">Not Running</span>
          </div>
        </div>
      </div>
    </div>
  );
}
