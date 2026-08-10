import { ReactNode } from 'react';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950">
      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 bg-slate-900 border-r border-slate-800 min-h-screen">
          <div className="p-6">
            <h2 className="text-xl font-bold text-white">HK-NOVA</h2>
            <p className="text-xs text-slate-500">NOC Platform</p>
          </div>
          
          <nav className="px-3 space-y-1">
            <a
              href="/dashboard"
              className="block px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white rounded-md transition-colors"
            >
              📊 Dashboard
            </a>
            <a
              href="/dashboard/monitoring"
              className="block px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white rounded-md transition-colors"
            >
              📡 Monitoring
            </a>
            <a
              href="/dashboard/devices"
              className="block px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white rounded-md transition-colors"
            >
              🖥️ Devices
            </a>
            <a
              href="/dashboard/provisioning"
              className="block px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white rounded-md transition-colors"
            >
              ⚙️ Provisioning
            </a>
            <a
              href="/dashboard/backups"
              className="block px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white rounded-md transition-colors"
            >
              💾 Backups
            </a>
            <a
              href="/dashboard/anomalies"
              className="block px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white rounded-md transition-colors"
            >
              🔍 Anomalies
            </a>
            <a
              href="/dashboard/alerts"
              className="block px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white rounded-md transition-colors"
            >
              🔔 Alerts
            </a>
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1">
          <header className="bg-slate-900 border-b border-slate-800 px-6 py-4">
            <div className="flex items-center justify-between">
              <h1 className="text-lg font-semibold text-white">Dashboard</h1>
              <div className="flex items-center gap-4">
                <div className="text-sm text-slate-400">
                  {new Date().toLocaleString('id-ID')}
                </div>
              </div>
            </div>
          </header>

          <div className="p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
