"use client";

import { useEffect, useState } from "react";

interface ComplianceReport {
  id: string;
  reportType: string;
  standard: string | null;
  startDate: string;
  endDate: string;
  summary: any;
  findings: any;
  recommendations?: string[];
  filePath: string | null;
  fileHash: string | null;
  generatedBy: string;
  generatedAt: string;
}

interface ComplianceCheck {
  requirement: string;
  status: "pass" | "fail";
  evidence: any;
}

export default function ComplianceDashboardPage() {
  const [reports, setReports] = useState<ComplianceReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [checks, setChecks] = useState<ComplianceCheck[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [formData, setFormData] = useState({ standard: "ISO27001", startDate: "", endDate: "" });

  const fetchReports = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/compliance/reports");
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setReports(json.data);
    } catch (err) {
      console.error("Failed to fetch reports:", err);
    } finally {
      setLoading(false);
    }
  };

  const generateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.startDate || !formData.endDate) {
      alert("Please select date range");
      return;
    }
    setGenerating(true);
    try {
      const res = await fetch("/api/compliance/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw new Error("Failed to generate");
      const json = await res.json();
      setReports([json.report, ...reports]);
      alert("Report generated successfully!");
    } catch (err) {
      console.error("Generate report failed:", err);
      alert("Failed to generate report");
    } finally {
      setGenerating(false);
    }
  };

  const runComplianceCheck = async (standard: string) => {
    setChecking(true);
    try {
      const res = await fetch(`/api/compliance/check?standard=${standard}`);
      if (!res.ok) throw new Error("Failed to check");
      const json = await res.json();
      setChecks(json.details);
    } catch (err) {
      console.error("Compliance check failed:", err);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => { fetchReports(); }, []);

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleString("id-ID", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

  const getStatusBadge = (status: string) => (
    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${status === "pass" ? "text-green-400 bg-green-500/10" : "text-red-400 bg-red-500/10"}`}>
      {status.toUpperCase()}
    </span>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Compliance Reports</h2>
          <p className="text-slate-400 mt-1 text-sm">Generate and manage compliance reports for ISO 27001, SOC 2, GDPR, PCI-DSS</p>
        </div>
      </div>

      {/* Generate Report Form */}
      <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-4 space-y-4">
        <h3 className="text-lg font-semibold text-white">Generate New Report</h3>
        <form onSubmit={generateReport} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Standard</label>
              <select value={formData.standard} onChange={(e) => setFormData(p => ({ ...p, standard: e.target.value }))} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white">
                <option value="ISO27001">ISO 27001</option>
                <option value="SOC2">SOC 2</option>
                <option value="GDPR">GDPR</option>
                <option value="PCI-DSS">PCI-DSS</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">Start Date</label>
              <input type="date" value={formData.startDate} onChange={(e) => setFormData(p => ({ ...p, startDate: e.target.value }))} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1">End Date</label>
              <input type="date" value={formData.endDate} onChange={(e) => setFormData(p => ({ ...p, endDate: e.target.value }))} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white" required />
            </div>
          </div>
          <button type="submit" disabled={generating} className="px-4 py-2 bg-blue-600 border border-blue-500 rounded-lg text-sm text-white hover:bg-blue-500 disabled:opacity-50">
            {generating ? "Generating..." : "Generate Report"}
          </button>
        </form>
      </div>

      {/* Compliance Check */}
      <div className="bg-slate-900 border border-slate-800/80 rounded-xl p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Compliance Status Check</h3>
          <div className="flex items-center gap-2">
            <select defaultValue="ISO27001" onChange={(e) => runComplianceCheck(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white">
              <option value="ISO27001">ISO 27001</option>
              <option value="SOC2">SOC 2</option>
              <option value="GDPR">GDPR</option>
              <option value="PCI-DSS">PCI-DSS</option>
            </select>
            <button onClick={() => runComplianceCheck(formData.standard)} disabled={checking} className="px-3 py-2 bg-indigo-600 border border-indigo-500 rounded-lg text-sm text-white hover:bg-indigo-500 disabled:opacity-50">
              {checking ? "Checking..." : "Run Check"}
            </button>
          </div>
        </div>

        {checks && (
          <div className="space-y-3">
            <div className="flex items-center gap-4 text-sm">
              <span className="text-slate-400">Passed:</span>
              <span className="text-green-400 font-bold">{checks.filter(c => c.status === "pass").length}</span>
              <span className="text-slate-400">Failed:</span>
              <span className="text-red-400 font-bold">{checks.filter(c => c.status === "fail").length}</span>
            </div>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {checks.map((check, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    {getStatusBadge(check.status)}
                    <span className="text-sm text-slate-300">{check.requirement}</span>
                  </div>
                  <button onClick={() => console.log(check.evidence)} className="text-xs text-slate-400 hover:text-slate-300">View Evidence</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Reports List */}
      <div className="bg-slate-900 border border-slate-800/80 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-slate-800/50 animate-pulse rounded" />)}
          </div>
        ) : reports.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-slate-500">No compliance reports generated yet</p>
            <p className="text-sm text-slate-600 mt-2">Generate your first report using the form above</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/50">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Report</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Standard</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Period</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Generated By</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Generated At</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {reports.map((report) => (
                  <tr key={report.id} className="hover:bg-slate-800/30">
                    <td className="px-4 py-3">
                      <div className="font-medium text-white">{report.reportType}</div>
                      <div className="text-xs text-slate-500 font-mono">{report.id.slice(0, 12)}...</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/20">
                        {report.standard || "Custom"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">
                      {formatDate(report.startDate)} - {formatDate(report.endDate)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-300">{report.generatedBy}</td>
                    <td className="px-4 py-3 text-sm text-slate-300">{formatDate(report.generatedAt)}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => console.log(report.summary)} className="text-xs text-blue-400 hover:text-blue-300">View Summary</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}