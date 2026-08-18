import { toCsv } from './csv';
import { buildXlsx } from './excel';
import { buildPdf } from './pdf';
import { EXPORT_MAX_ROWS, type ExportSpec } from './types';

const MIME_TYPES: Record<string, string> = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

function safeFilename(name: string): string {
  return name.replace(/[^a-z0-9._-]+/gi, '_').slice(0, 120);
}

/**
 * Render an export spec into a downloadable Response.
 * Enforces an upper bound on the number of rows to protect memory/CPU.
 */
export async function renderExport(spec: ExportSpec): Promise<Response> {
  const rows = spec.rows.slice(0, EXPORT_MAX_ROWS);
  const truncated = rows.length < spec.rows.length;

  let body: Buffer | string;
  switch (spec.format) {
    case 'csv':
      body = toCsv(spec.columns, rows);
      break;
    case 'xlsx':
      body = await buildXlsx(spec.sheetName, spec.columns, rows);
      break;
    case 'pdf':
      body = await buildPdf(spec.title, spec.subtitle, spec.columns, rows);
      break;
    default:
      throw new Error(`Unknown export format: ${String(spec.format)}`);
  }

  const extension = spec.format;
  const filename = `${safeFilename(spec.filename)}.${extension}`;

  // Add UTF-8 BOM so Excel opens CSV with correct encoding
  const payload =
    spec.format === 'csv'
      ? `\uFEFF${body as string}${truncated ? `\r\n[Ekspor dibatasi ${EXPORT_MAX_ROWS} baris pertama]` : ''}`
      : (body as Buffer);
  const finalBody = typeof payload === 'string' ? Buffer.from(payload, 'utf8') : (payload as Buffer);

  return new Response(new Uint8Array(finalBody), {
    status: 200,
    headers: {
      'Content-Type': MIME_TYPES[spec.format] ?? 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}