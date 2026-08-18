import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { toCsv } from '@/lib/export/csv';
import { buildXlsx } from '@/lib/export/excel';
import { buildPdf } from '@/lib/export/pdf';
import { parseExportFormat } from '@/lib/export/types';

describe('CSV builder', () => {
  const columns = [
    { key: 'name', header: 'Nama' },
    { key: 'note', header: 'Catatan' },
  ];

  it('menulis header + baris sesuai urutan kolom', () => {
    const csv = toCsv(columns, [{ name: 'Router-1', note: 'pintu gerbang' }]);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe('Nama,Catatan');
    expect(lines[1]).toBe('Router-1,pintu gerbang');
  });

  it('meloloskan koma, kutip, dan baris baru (RFC 4180)', () => {
    const csv = toCsv(columns, [{ name: 'A,B', note: 'line1\nline2' }]);
    expect(csv).toContain('"A,B"');
    expect(csv).toContain('"line1\nline2"');
  });

  it('nilai null/undefined menjadi sel kosong', () => {
    const csv = toCsv(columns, [{ name: null, note: undefined }]);
    expect(csv.split('\r\n')[1]).toBe(',');
  });
});

describe('XLSX builder', () => {
  it('menghasilkan workbook yang dapat dibaca kembali', async () => {
    const columns = [
      { key: 'a', header: 'Kolom A', width: 12 },
      { key: 'b', header: 'Kolom B', width: 12 },
    ];
    const buf = await buildXlsx('Sheet1', columns, [
      { a: 'x1', b: 'y1' },
      { a: 'x2', b: 'y2' },
    ]);
    expect(buf.length).toBeGreaterThan(100);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.getWorksheet('Sheet1');
    expect(ws).not.toBeUndefined();
    expect(ws!.getCell('A1').value).toBe('Kolom A');
    expect(ws!.getCell('B1').value).toBe('Kolom B');
    expect(ws!.getCell('A2').value).toBe('x1');
    expect(ws!.getCell('B3').value).toBe('y2');
  });
});

describe('PDF builder', () => {
  it('menghasilkan buffer PDF valid', async () => {
    const buf = await buildPdf(
      'Laporan Uji',
      'Subtitle',
      [
        { key: 'a', header: 'A', width: 10 },
        { key: 'b', header: 'B', width: 10 },
      ],
      [{ a: 1, b: 2 }]
    );
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(1000);
  });

  it('menangani banyak baris tanpa gagal (multiple pages)', async () => {
    const rows = Array.from({ length: 200 }, (_, i) => ({ a: `row-${i}`, b: i }));
    const buf = await buildPdf(
      'Laporan Panjang',
      undefined,
      [
        { key: 'a', header: 'A', width: 12 },
        { key: 'b', header: 'B', width: 8 },
      ],
      rows
    );
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});

describe('parseExportFormat', () => {
  it('menerima format yang valid', () => {
    expect(parseExportFormat('csv')).toBe('csv');
    expect(parseExportFormat('xlsx')).toBe('xlsx');
    expect(parseExportFormat('pdf')).toBe('pdf');
  });

  it('menolak format tak dikenal dan nilai kosong', () => {
    expect(parseExportFormat('docx')).toBeNull();
    expect(parseExportFormat(null)).toBeNull();
    expect(parseExportFormat('')).toBeNull();
  });
});