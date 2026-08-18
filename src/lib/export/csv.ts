import type { ExportColumn } from './types';

function escapeCsv(value: unknown): string {
  const str = value == null ? '' : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Build a CSV payload (RFC 4180). Header row follows the column order.
 */
export function toCsv(columns: ExportColumn[], rows: Array<Record<string, unknown>>): string {
  const header = columns.map((c) => escapeCsv(c.header)).join(',');
  const body = rows.map((row) => columns.map((c) => escapeCsv(row[c.key])).join(','));
  return [header, ...body].join('\r\n');
}