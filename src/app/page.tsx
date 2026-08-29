import Link from 'next/link';
import { Activity, Bell, Bot, Server, Shield, ArrowRight, FileText } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-blue-500 selection:text-white">
      {/* Header / Navbar */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-600/30">
              HK
            </div>
            <div>
              <span className="font-bold text-lg tracking-wider text-white">HK-NOVA</span>
              <span className="hidden sm:inline-block ml-2 text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                NOC Platform
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Link
              href="/docs/api"
              className="text-sm text-slate-400 hover:text-white transition-colors hidden sm:block"
            >
              Dokumentasi API
            </Link>
            <Link
              href="/login"
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold shadow-md shadow-blue-600/20 transition-all flex items-center gap-2"
            >
              Portal Login
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-20 flex flex-col justify-center">
        {/* Hero Section */}
        <div className="text-center max-w-3xl mx-auto space-y-6">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs text-slate-300">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Platform Intelligent Network Operations Center
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold text-white tracking-tight leading-tight">
            Monitoring & Otomasi Jaringan <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-400 to-sky-400">ISP Real-Time</span>
          </h1>

          <p className="text-slate-400 text-base sm:text-lg max-w-2xl mx-auto leading-relaxed">
            Integrasi monitoring ICMP/SNMP, deteksi anomali berbasis AI, otomasi backup konfigurasi perangkat, dan manajemen alert multi-channel dalam satu sistem terpusat.
          </p>

          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="/login"
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm shadow-lg shadow-blue-600/25 transition-all flex items-center justify-center gap-2"
            >
              Masuk ke Dashboard Operator
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/docs/api"
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-semibold text-sm transition-all flex items-center justify-center gap-2"
            >
              <FileText className="w-4 h-4" />
              Dokumentasi API
            </Link>
          </div>
        </div>

        {/* Features Grid */}
        <div className="mt-16 sm:mt-24 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 hover:border-slate-700 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mb-4">
              <Activity className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-white text-base mb-2">Monitoring ICMP & SNMP</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Polling status status UP/DOWN, latency, CPU, memory, dan status interface perangkat secara real-time.
            </p>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 hover:border-slate-700 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mb-4">
              <Bell className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-white text-base mb-2">Smart Alerting System</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Manajemen lifecycle alert ACTIVE/ACK/RESOLVED dengan pengiriman notifikasi via Telegram, Email, & Webhook.
            </p>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 hover:border-slate-700 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 flex items-center justify-center mb-4">
              <Bot className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-white text-base mb-2">ML Anomaly Detection</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Model Isolation Forest AI untuk mendeteksi keanehan latensi dan trafik secara otomatis tanpa ambang batas manual.
            </p>
          </div>

          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-6 hover:border-slate-700 transition-colors">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mb-4">
              <Server className="w-5 h-5" />
            </div>
            <h3 className="font-semibold text-white text-base mb-2">Backup & Provisioning</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Autobackup konfigurasi perangkat via SSH beserta fitur provisi OLT Huawei dan ZTE secara otomatis.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-6 bg-slate-950">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <p>© {new Date().getFullYear()} HK-NOVA Platform. Network Operations Center System.</p>
          <div className="flex items-center gap-4">
            <Link href="/login" className="hover:text-slate-300 transition-colors">
              Login Operator
            </Link>
            <span>•</span>
            <Link href="/docs/api" className="hover:text-slate-300 transition-colors">
              API Docs
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
