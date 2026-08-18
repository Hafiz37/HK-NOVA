export type ExportFormat = 'csv' | 'xlsx' | 'pdf';

export interface ExportColumn {
  /** Row object key */
  key: string;
  /** Column header shown in files */
  header: string;
  /** Approximate display width (chars) — used by Excel & PDF layout */
  width?: number;
}

export interface ExportSpec {
  format: ExportFormat;
  /** Base filename without extension */
  filename: string;
  sheetName: string;
  title: string;
  subtitle?: string;
  columns: ExportColumn[];
  rows: Array<Record<string, unknown>>;
}

export const EXPORT_FORMATS: ExportFormat[] = ['csv', 'xlsx', 'pdf'];

export const EXPORT_MAX_ROWS = 50_000;

export function parseExportFormat(value: string | null | undefined): ExportFormat | null {
  if (value && (EXPORT_FORMATS as string[]).includes(value)) {
    return value as ExportFormat;
  }
  return null;
}