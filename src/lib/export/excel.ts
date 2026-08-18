import ExcelJS from 'exceljs';
import type { ExportColumn } from './types';

const HEADER_BG = 'FF1D4ED8';
const HEADER_FG = 'FFFFFFFF';
const BANDING_FILL = 'FFF1F5F9';

/**
 * Build an .xlsx workbook buffer from rows/columns.
 * Includes styled header, column widths, auto-filter, and banded rows.
 */
export async function buildXlsx(
  sheetName: string,
  columns: ExportColumn[],
  rows: Array<Record<string, unknown>>
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'HK-NOVA NOC';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: Math.max(8, Math.min(60, c.width ?? 16)),
  }));

  const headerRow = sheet.getRow(1);
  headerRow.height = 22;
  for (let i = 1; i <= columns.length; i++) {
    const cell = headerRow.getCell(i);
    cell.font = { bold: true, color: { argb: HEADER_FG }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } };
    cell.alignment = { vertical: 'middle' };
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FF94A3B8' } },
    };
  }

  rows.forEach((row, idx) => {
    const values = columns.map((c) => (row[c.key] == null ? '' : row[c.key]));
    const excelRow = sheet.addRow(values);
    excelRow.height = 18;
    if (idx % 2 === 1) {
      for (let i = 1; i <= columns.length; i++) {
        const cell = excelRow.getCell(i);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BANDING_FILL } };
      }
    }
  });

  if (rows.length > 0) {
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: columns.length },
    };
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}