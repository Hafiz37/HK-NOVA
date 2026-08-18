"use client";

import { useState } from 'react';

export type ExportFormat = 'csv' | 'xlsx' | 'pdf';

const LABELS: Record<ExportFormat, string> = { csv: 'CSV', xlsx: 'Excel', pdf: 'PDF' };

/**
 * Renders CSV / Excel / PDF export buttons. Downloads the file produced by
 * `buildUrl(format)` and saves it client-side with the server-provided name.
 */
export function ExportMenu({ buildUrl }: { buildUrl: (format: ExportFormat) => string }) {
  const [busy, setBusy] = useState<ExportFormat | null>(null);

  const run = async (format: ExportFormat) => {
    if (busy) return;
    setBusy(format);
    try {
      const res = await fetch(buildUrl(format));
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Gagal mengekspor (HTTP ${res.status})`);
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const match = disposition.match(/filename="?([^";]+)"?/);
      const filename = match?.[1] ?? `export-${format}`;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Terjadi kesalahan saat mengekspor';
      console.error('[Export] Error:', err);
      alert(message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="inline-flex items-center rounded-lg border border-slate-700 bg-slate-800 divide-x divide-slate-700 overflow-hidden">
      {(Object.keys(LABELS) as ExportFormat[]).map((format) => (
        <button
          key={format}
          onClick={() => void run(format)}
          disabled={busy !== null}
          title={`Ekspor sebagai ${LABELS[format]}`}
          className="px-3 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 hover:text-white disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {busy === format ? '⏳' : `⬇ ${LABELS[format]}`}
        </button>
      ))}
    </div>
  );
}