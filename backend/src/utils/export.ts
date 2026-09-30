import fs from 'fs';
import type { Response } from 'express';
import ExcelJS from 'exceljs';
import type { SchoolSettings } from '@prisma/client';
import { getSettings } from './settings';
import { publicUrlToPath } from './files';
import { createPdf } from './pdf';
import { formatDate, formatDateTime, formatMoney, formatNumber, formatPercent, t } from '../i18n';
import { label } from '../i18n/labels';

/** `score` is a mark percentage: same output as `percent`, but coloured by pass mark on screen. */
export type ColumnFormat = 'text' | 'date' | 'money' | 'number' | 'percent' | 'score';

export interface ReportColumn {
  key: string;
  header: string;
  format?: ColumnFormat;
  /** Relative width weight for PDF; Excel uses it ×6 as character width. */
  width?: number;
}

export interface Report {
  title: string;
  subtitle?: string;
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  summary?: { label: string; value: string | number }[];
}

export type ExportFormat = 'json' | 'xlsx' | 'pdf';

/** Columns holding a status code (PRESENT, OVERDUE…), shown by name. */
const STATUS_KEYS = new Set(['status', 'flag', 'type']);

function display(value: unknown, format: ColumnFormat | undefined, currency: string, key?: string): string {
  if (value === null || value === undefined || value === '') return '';
  if (key && STATUS_KEYS.has(key) && typeof value === 'string' && /^[A-Z_]+$/.test(value))
    return label(value);
  if (value instanceof Date) return formatDate(value);
  const n = typeof value === 'number' ? value : Number(value);
  switch (format) {
    case 'money':
      return Number.isFinite(n) ? formatMoney(n, currency) : String(value);
    case 'number':
      return Number.isFinite(n) ? formatNumber(n) : String(value);
    case 'percent':
    case 'score':
      return Number.isFinite(n) ? formatPercent(n) : String(value);
    case 'date':
      return typeof value === 'string' ? formatDate(value) : String(value);
    default:
      return String(value);
  }
}

export async function toXlsx(report: Report): Promise<Buffer> {
  const settings = await getSettings();
  const wb = new ExcelJS.Workbook();
  wb.creator = settings.name;
  wb.created = new Date();
  const ws = wb.addWorksheet(report.title.slice(0, 31).replace(/[\\/*?:[\]]/g, ''));

  ws.mergeCells(1, 1, 1, Math.max(1, report.columns.length));
  ws.getCell(1, 1).value = `${settings.name} — ${report.title}`;
  ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: 'FF4F6BED' } };
  ws.getCell(2, 1).value = [
    report.subtitle,
    t('Generated {date}', { date: formatDateTime(new Date(), settings.timezone) }),
  ]
    .filter(Boolean)
    .join(' · ');
  ws.getCell(2, 1).font = { italic: true, color: { argb: 'FF64748B' } };

  const headerRow = ws.getRow(4);
  report.columns.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F6BED' } };
    cell.alignment = { vertical: 'middle' };
    ws.getColumn(i + 1).width = Math.max(10, (col.width ?? 2) * 7);
  });
  headerRow.height = 20;

  report.rows.forEach((row, r) => {
    const excelRow = ws.getRow(5 + r);
    report.columns.forEach((col, i) => {
      const cell = excelRow.getCell(i + 1);
      const v = row[col.key];
      if (col.format === 'money' || col.format === 'number') {
        const n = Number(v);
        cell.value = v === null || v === undefined || v === '' || !Number.isFinite(n) ? null : n;
        cell.numFmt = col.format === 'money' ? `#,##0 "${settings.currency}"` : '#,##0';
      } else if (col.format === 'percent' || col.format === 'score') {
        const n = Number(v);
        cell.value = Number.isFinite(n) ? n / 100 : null;
        cell.numFmt = '0.0%';
      } else {
        cell.value = display(v, col.format, settings.currency, col.key);
      }
      if (r % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    });
  });
  ws.views = [{ state: 'frozen', ySplit: 4 }];
  if (report.rows.length)
    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: report.columns.length } };

  if (report.summary?.length) {
    let r = 6 + report.rows.length;
    for (const s of report.summary) {
      ws.getCell(r, 1).value = s.label;
      ws.getCell(r, 1).font = { bold: true };
      ws.getCell(r, 2).value = s.value;
      r++;
    }
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Draws the school letterhead; returns the y position below it. */
export function drawLetterhead(
  doc: PDFKit.PDFDocument,
  settings: SchoolSettings,
  title: string,
  subtitle?: string,
): number {
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const top = doc.page.margins.top;
  let textX = left;
  const logoPath = publicUrlToPath(settings.logo);
  if (logoPath && fs.existsSync(logoPath) && /\.(png|jpe?g)$/i.test(logoPath)) {
    try {
      doc.image(logoPath, left, top, { fit: [52, 52] });
      textX = left + 62;
    } catch {
      /* unsupported image: skip the logo */
    }
  }
  doc
    .fillColor('#4F6BED')
    .font('Heading')
    .fontSize(17)
    .text(settings.name, textX, top, { width: width - (textX - left) });
  doc.fillColor('#64748B').font('Helvetica').fontSize(8.5);
  const line2 = [settings.motto && `"${settings.motto}"`, settings.address, settings.phone, settings.email]
    .filter(Boolean)
    .join('  ·  ');
  if (line2) doc.text(line2, textX, doc.y + 1, { width: width - (textX - left) });
  let y = Math.max(doc.y, top + 54) + 6;
  doc
    .moveTo(left, y)
    .lineTo(left + width, y)
    .lineWidth(2)
    .strokeColor('#FFC93C')
    .stroke();
  y += 10;
  doc.fillColor('#0F172A').font('Heading').fontSize(14).text(title, left, y, { width });
  const meta = [subtitle, t('Generated {date}', { date: formatDateTime(new Date(), settings.timezone) })]
    .filter(Boolean)
    .join('  ·  ');
  doc
    .fillColor('#64748B')
    .font('Helvetica')
    .fontSize(8.5)
    .text(meta, left, doc.y + 2, { width });
  return doc.y + 10;
}

export function addPageNumbers(doc: PDFKit.PDFDocument): void {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const bottom = doc.page.height - doc.page.margins.bottom;
    // Temporarily zero the bottom margin so writing in the footer doesn't trigger a new page.
    const saved = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .fillColor('#94A3B8')
      .font('Helvetica')
      .fontSize(8)
      .text(
        t('Page {page} of {count}', { page: i + 1, count: range.count }),
        doc.page.margins.left,
        bottom + 12,
        {
          width: doc.page.width - doc.page.margins.left - doc.page.margins.right,
          align: 'right',
          lineBreak: false,
        },
      );
    doc.page.margins.bottom = saved;
  }
}

export function pdfToBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

export async function toPdf(report: Report): Promise<Buffer> {
  const settings = await getSettings();
  const landscape = report.columns.length > 6;
  const doc = createPdf({
    size: 'A4',
    layout: landscape ? 'landscape' : 'portrait',
    margin: 36,
    bufferPages: true,
  });
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  let y = drawLetterhead(doc, settings, report.title, report.subtitle);

  if (report.summary?.length) {
    const boxW = Math.min(150, width / report.summary.length - 6);
    report.summary.forEach((s, i) => {
      const x = left + i * (boxW + 6);
      doc.roundedRect(x, y, boxW, 36, 6).fill('#EEF2FF');
      doc
        .fillColor('#64748B')
        .font('Helvetica')
        .fontSize(7.5)
        .text(s.label, x + 8, y + 6, { width: boxW - 16 });
      doc
        .fillColor('#1E293B')
        .font('Helvetica-Bold')
        .fontSize(11)
        .text(typeof s.value === 'number' ? formatNumber(s.value) : s.value, x + 8, y + 18, {
          width: boxW - 16,
        });
    });
    y += 46;
  }

  const totalWeight = report.columns.reduce((a, c) => a + (c.width ?? 2), 0);
  const widths = report.columns.map((c) => ((c.width ?? 2) / totalWeight) * width);
  const fontSize = report.columns.length > 9 ? 7 : 8;
  const pad = 4;

  const drawHeader = () => {
    doc.rect(left, y, width, 18).fill('#4F6BED');
    let x = left;
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(fontSize);
    report.columns.forEach((c, i) => {
      const align = ['money', 'number', 'percent', 'score'].includes(c.format ?? '') ? 'right' : 'left';
      doc.text(c.header, x + pad, y + 5, {
        width: widths[i] - pad * 2,
        height: 10,
        ellipsis: true,
        lineBreak: false,
        align,
      });
      x += widths[i];
    });
    y += 18;
  };
  drawHeader();

  if (!report.rows.length) {
    doc
      .fillColor('#64748B')
      .font('Helvetica-Oblique')
      .fontSize(9)
      .text(t('No records found for the selected filters.'), left, y + 10);
  }

  doc.font('Helvetica').fontSize(fontSize);
  report.rows.forEach((row, r) => {
    const cells = report.columns.map((c) => display(row[c.key], c.format, settings.currency, c.key));
    const rowH = Math.max(
      16,
      ...cells.map((t, i) => doc.heightOfString(t, { width: widths[i] - pad * 2 }) + pad * 2),
    );
    if (y + rowH > doc.page.height - doc.page.margins.bottom - 10) {
      doc.addPage();
      y = doc.page.margins.top;
      drawHeader();
      doc.font('Helvetica').fontSize(fontSize);
    }
    if (r % 2 === 1) doc.rect(left, y, width, rowH).fill('#F1F5F9');
    let x = left;
    doc.fillColor('#1E293B');
    cells.forEach((t, i) => {
      const align = ['money', 'number', 'percent', 'score'].includes(report.columns[i].format ?? '')
        ? 'right'
        : 'left';
      doc.text(t, x + pad, y + pad, { width: widths[i] - pad * 2, align });
      x += widths[i];
    });
    y += rowH;
  });

  addPageNumbers(doc);
  return pdfToBuffer(doc);
}

export function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function sendFile(res: Response, buffer: Buffer, filename: string, mime: string): void {
  res.setHeader('Content-Type', mime);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', buffer.length);
  res.end(buffer);
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Sends a report as JSON (default), Excel or PDF depending on `format`. */
export async function sendReport(
  res: Response,
  report: Report,
  format: ExportFormat = 'json',
): Promise<Report | undefined> {
  const name = `${slug(report.title)}-${new Date().toISOString().slice(0, 10)}`;
  if (format === 'xlsx') {
    sendFile(res, await toXlsx(report), `${name}.xlsx`, XLSX_MIME);
    return undefined;
  }
  if (format === 'pdf') {
    sendFile(res, await toPdf(report), `${name}.pdf`, 'application/pdf');
    return undefined;
  }
  return report;
}
