export default function HomePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="text-center space-y-6 p-8">
        <div className="space-y-2">
          <h1 className="text-6xl font-bold text-white tracking-tight">
            HK-NOVA
          </h1>
          <p className="text-xl text-slate-400">
            Network Operations Center Platform
          </p>
        </div>
        
        <div className="space-y-4 pt-8">
          <div className="flex items-center justify-center gap-2 text-green-400">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            <span className="text-sm">System Online</span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
            <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-lg p-4">
              <div className="text-2xl font-bold text-white">0</div>
              <div className="text-sm text-slate-400">Devices</div>
            </div>
            
            <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-lg p-4">
              <div className="text-2xl font-bold text-white">0</div>
              <div className="text-sm text-slate-400">Active Alerts</div>
            </div>
            
            <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-lg p-4">
              <div className="text-2xl font-bold text-white">0</div>
              <div className="text-sm text-slate-400">Anomalies</div>
            </div>
          </div>
        </div>

        <div className="pt-8">
          <a
            href="/dashboard"
            className="inline-flex items-center px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            Masuk ke Dashboard
          </a>
        </div>

        <div className="pt-12 text-xs text-slate-500">
          <p>Project Magang - ISP Network Operations Center</p>
        </div>
      </div>
    </div>
  );
}
