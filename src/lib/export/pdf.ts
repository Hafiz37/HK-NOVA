import PDFDocument from 'pdfkit';
import type { ExportColumn } from './types';

const COLORS = {
  headerBg: '#1d4ed8',
  headerFg: '#ffffff',
  bandBg: '#f1f5f9',
  text: '#0f172a',
  muted: '#475569',
  line: '#cbd5e1',
};

function formatCell(value: unknown): string {
  if (value == null || value === '') return '—';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  return String(value);
}

function layoutColumns(width: number, columns: ExportColumn[]): number[] {
  const raw = columns.map((c) => Math.max(6, c.width ?? 16));
  const total = raw.reduce((a, b) => a + b, 0) || 1;
  return raw.map((w) => (w / total) * width);
}

/**
 * Build a table-style PDF report (with header, subtitle, generated-at, and
 * paginated rows). Column layout uses the same widths as Excel.
 */
export function buildPdf(
  title: string,
  subtitle: string | undefined,
  columns: ExportColumn[],
  rows: Array<Record<string, unknown>>
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: rows.length > 25 ? 'A4' : 'A4',
      layout: rows.length > 25 ? 'landscape' : 'portrait',
      margin: 32,
      info: { Title: title, Author: 'HK-NOVA NOC' },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const colWidths = layoutColumns(usable, columns);

    const drawHeaderBlock = () => {
      doc.rect(doc.page.margins.left, doc.y, usable, 4).fill(COLORS.headerBg);
      doc.moveDown(0.6);
      doc.font('Helvetica-Bold').fontSize(16).fillColor(COLORS.text).text(title, {
        width: usable,
      });
      if (subtitle) {
        doc.moveDown(0.2);
        doc.font('Helvetica').fontSize(10).fillColor(COLORS.muted).text(subtitle, { width: usable });
      }
      doc.moveDown(0.2);
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(COLORS.muted)
        .text(`Dibuat: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`, { width: usable });
      doc.moveDown(0.8);
    };

    const drawTableHeader = () => {
      const y = doc.y;
      const h = 22;
      doc.rect(doc.page.margins.left, y, usable, h).fill(COLORS.headerBg);
      let x = doc.page.margins.left;
      columns.forEach((c, i) => {
        doc
          .font('Helvetica-Bold')
          .fontSize(8)
          .fillColor(COLORS.headerFg)
          .text(c.header, x + 4, y + 7, {
            width: Math.max(10, colWidths[i] - 8),
            lineBreak: false,
          });
        x += colWidths[i];
      });
      doc.moveDown(h / 10);
    };

    const drawFooter = () => {
      const pageNumber = (doc as unknown as { pageNumber: number }).pageNumber;
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(COLORS.muted)
        .text(`HK-NOVA • ${title} • Halaman ${pageNumber}`, {
          width: usable,
          align: 'right',
        });
    };

    const startTable = () => {
      doc.y = 150;
      drawTableHeader();
      doc.y = 170;
    };

    drawHeaderBlock();
    startTable();

    const rowHeight = 18;
    const yLimit = doc.page.height - doc.page.margins.bottom - 24;

    rows.forEach((row, idx) => {
      if (doc.y + rowHeight > yLimit) {
        drawFooter();
        doc.addPage();
        doc.y = 32;
        drawTableHeader();
        doc.y = 48;
      }

      const y = doc.y;
      const isBand = idx % 2 === 1;
      if (isBand) {
        doc.rect(doc.page.margins.left, y, usable, rowHeight).fill(COLORS.bandBg);
      }

      let x = doc.page.margins.left;
      columns.forEach((c, i) => {
        const text = formatCell(row[c.key]);
        doc
          .font(text.length > 60 ? 'Helvetica' : 'Helvetica')
          .fontSize(7.5)
          .fillColor(COLORS.text)
          .text(text, x + 4, y + 5, {
            width: Math.max(10, colWidths[i] - 8),
            lineBreak: false,
          });
        x += colWidths[i];
      });

      doc.moveDown(rowHeight / 14.5);
    });

    // Closing line + footer on final page
    doc.moveDown(1);
    doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.margins.left + usable, doc.y).lineWidth(0.5).strokeColor(COLORS.line).stroke();
    drawFooter();

    doc.end();
  });
}