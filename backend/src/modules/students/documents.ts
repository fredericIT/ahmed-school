import fs from 'fs';
import type { Request } from 'express';
import ExcelJS from 'exceljs';
import { prisma } from '../../config/prisma';
import { audit } from '../../utils/audit';
import { addPageNumbers, drawLetterhead, pdfToBuffer } from '../../utils/export';
import { publicUrlToPath } from '../../utils/files';
import { getSettings } from '../../utils/settings';
import { createStudentBody } from './schema';
import * as service from './service';
import { createPdf } from '../../utils/pdf';
import { formatDate, plural, t } from '../../i18n';
import { label } from '../../i18n/labels';

function imagePath(url: string | null | undefined): string | null {
  const p = publicUrlToPath(url);
  return p && fs.existsSync(p) && /\.(png|jpe?g)$/i.test(p) ? p : null;
}

function initials(first: string, last: string) {
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase();
}

/** Credit-card sized (CR80) ID card, front and back. */
export async function idCard(id: number): Promise<Buffer> {
  const st = await service.get(id);
  const settings = await getSettings();
  const W = 243;
  const H = 153;
  const doc = createPdf({ size: [W, H], margin: 0 });

  // Front
  doc.rect(0, 0, W, H).fill('#FFFFFF');
  doc.rect(0, 0, W, 34).fill('#4F6BED');
  doc.circle(W - 12, 6, 22).fill('#FFC93C');
  doc.circle(W - 40, 32, 7).fill('#FF7A6B');
  const logo = imagePath(settings.logo);
  if (logo) doc.image(logo, 7, 5, { fit: [24, 24] });
  doc
    .fillColor('#FFFFFF')
    .font('Helvetica-Bold')
    .fontSize(9)
    .text(settings.name, logo ? 36 : 8, 8, { width: logo ? 150 : 178, lineBreak: false, ellipsis: true });
  doc
    .font('Helvetica')
    .fontSize(6)
    .text(t('STUDENT IDENTITY CARD'), logo ? 36 : 8, 20);

  const photo = imagePath(st.photo);
  doc.roundedRect(8, 42, 62, 74, 6).lineWidth(1.5).strokeColor('#FFC93C').stroke();
  if (photo) doc.image(photo, 10, 44, { fit: [58, 70], align: 'center', valign: 'center' });
  else {
    doc.roundedRect(10, 44, 58, 70, 5).fill('#EEF2FF');
    doc
      .fillColor('#4F6BED')
      .font('Helvetica-Bold')
      .fontSize(20)
      .text(initials(st.firstName, st.lastName), 10, 68, { width: 58, align: 'center' });
  }

  const x = 78;
  doc
    .fillColor('#0F172A')
    .font('Helvetica-Bold')
    .fontSize(10.5)
    .text(`${st.firstName} ${st.lastName}`, x, 44, { width: W - x - 8, lineBreak: false, ellipsis: true });
  const rows: [string, string][] = [
    [t('Adm. No'), st.admissionNumber],
    [t('Class'), st.currentClass?.name ?? '-'],
    [t('Date of birth'), formatDate(st.dateOfBirth)],
    [t('Blood group'), st.bloodGroup ?? '-'],
  ];
  let y = 60;
  for (const [k, v] of rows) {
    doc.fillColor('#64748B').font('Helvetica').fontSize(6).text(k.toUpperCase(), x, y);
    doc
      .fillColor('#1E293B')
      .font('Helvetica-Bold')
      .fontSize(7.5)
      .text(v, x + 52, y - 1, { width: W - x - 60, lineBreak: false, ellipsis: true });
    y += 13;
  }
  doc.rect(0, H - 22, W, 22).fill('#3CCF91');
  doc
    .fillColor('#FFFFFF')
    .font('Helvetica')
    .fontSize(6)
    .text(settings.motto ? `"${settings.motto}"` : (settings.address ?? ''), 8, H - 15, {
      width: W - 16,
      align: 'center',
      lineBreak: false,
      ellipsis: true,
    });

  // Back
  doc.addPage({ size: [W, H], margin: 0 });
  doc.rect(0, 0, W, H).fill('#FFFFFF');
  doc.rect(0, 0, W, 6).fill('#9B8CFF');
  doc
    .fillColor('#4F6BED')
    .font('Helvetica-Bold')
    .fontSize(8.5)
    .text(t('In case of emergency, please contact'), 10, 14);
  y = 30;
  const contacts = st.guardians.filter((g) => g.isEmergencyContact || g.isPrimary).slice(0, 2);
  for (const g of contacts.length ? contacts : st.guardians.slice(0, 2)) {
    doc
      .fillColor('#0F172A')
      .font('Helvetica-Bold')
      .fontSize(8)
      .text(`${g.fullName} (${g.relationship})`, 10, y, { width: W - 20 });
    doc
      .fillColor('#334155')
      .font('Helvetica')
      .fontSize(7.5)
      .text(g.phone + (g.altPhone ? ` / ${g.altPhone}` : ''), 10, y + 10);
    y += 26;
  }
  if (st.allergies) {
    doc
      .fillColor('#FF7A6B')
      .font('Helvetica-Bold')
      .fontSize(7)
      .text(t('Allergies: {allergies}', { allergies: st.allergies }), 10, y, {
        width: W - 20,
        height: 18,
        ellipsis: true,
      });
  }
  doc
    .fillColor('#64748B')
    .font('Helvetica')
    .fontSize(6.5)
    .text(
      settings.phone
        ? t('If found, please return to {school} · {phone}', { school: settings.name, phone: settings.phone })
        : t('If found, please return to {school}', { school: settings.name }),
      10,
      H - 24,
      { width: W - 20, align: 'center' },
    );
  return pdfToBuffer(doc);
}

export async function registrationForm(id: number): Promise<Buffer> {
  const st = await service.get(id);
  const settings = await getSettings();
  const doc = createPdf({ size: 'A4', margin: 40, bufferPages: true });
  const left = 40;
  const width = doc.page.width - 80;
  let y = drawLetterhead(
    doc,
    settings,
    t('Student Registration Form'),
    t('Admission No. {number}', { number: st.admissionNumber }),
  );

  const photo = imagePath(st.photo);
  if (photo) doc.image(photo, left + width - 90, y, { fit: [90, 110] });
  else {
    doc
      .rect(left + width - 90, y, 90, 110)
      .lineWidth(1)
      .strokeColor('#CBD5E1')
      .stroke();
    doc
      .fillColor('#94A3B8')
      .fontSize(8)
      .text(t('Photo'), left + width - 90, y + 50, { width: 90, align: 'center' });
  }

  const photoBottom = y + 110;
  const section = (title: string) => {
    if (y > doc.page.height - 140) {
      doc.addPage();
      y = 40;
    }
    // Keep section bars clear of the photo box in the top-right corner.
    doc.roundedRect(left, y, y < photoBottom ? width - 100 : width, 20, 4).fill('#EEF2FF');
    doc
      .fillColor('#4F6BED')
      .font('Helvetica-Bold')
      .fontSize(10)
      .text(title, left + 8, y + 5);
    y += 28;
  };
  const field = (label: string, value: string | null | undefined, w = width - 100) => {
    doc.fillColor('#64748B').font('Helvetica').fontSize(8.5).text(label, left, y, { width: 130 });
    const h = doc
      .fillColor('#0F172A')
      .font('Helvetica-Bold')
      .fontSize(9.5)
      .heightOfString(value || '—', { width: w - 140 });
    doc.text(value || '—', left + 135, y, { width: w - 140 });
    y += Math.max(15, h + 4);
  };

  section(t('1. Child information'));
  field(t('Full name'), `${st.firstName} ${st.lastName}`);
  field(t('Gender'), st.gender === 'MALE' ? t('Male') : t('Female'));
  field(
    t('Date of birth'),
    plural(st.age, '{date} ({count} year old)', '{date} ({count} years old)', {
      date: formatDate(st.dateOfBirth),
    }),
  );
  field(t('Nationality'), st.nationality);
  field(t('Home address'), st.address);
  field(t('Previous school'), st.previousSchool);
  y = Math.max(y, doc.y) + 6;

  section(t('2. Parents / guardians'));
  st.guardians.forEach((g, i) => {
    field(
      t('Guardian {number}', { number: i + 1 }),
      g.isPrimary
        ? t('{name} — {relationship} (primary)', { name: g.fullName, relationship: t(g.relationship) })
        : `${g.fullName} — ${t(g.relationship)}`,
      width + 100,
    );
    field(t('Phone'), [g.phone, g.altPhone].filter(Boolean).join(' / '), width + 100);
    field(t('Email / Occupation'), [g.email, g.occupation].filter(Boolean).join(' · '), width + 100);
    field(t('National ID'), g.nationalId, width + 100);
    field(
      t('Emergency / Pick-up'),
      `${g.isEmergencyContact ? t('Emergency contact') : t('Not emergency contact')} · ${g.canPickUp ? t('Authorized to pick up') : t('NOT authorized to pick up')}`,
      width + 100,
    );
    y += 4;
  });

  section(t('3. Medical information'));
  field(t('Blood group'), st.bloodGroup, width + 100);
  field(t('Allergies'), st.allergies, width + 100);
  field(t('Medical notes'), st.medicalNotes, width + 100);
  field(t('Special needs'), st.specialNeeds, width + 100);

  section(t('4. Class assignment'));
  field(t('Class'), st.currentClass?.name, width + 100);
  field(t('Admission date'), formatDate(st.admissionDate), width + 100);
  field(t('Status'), label(st.status), width + 100);

  y += 30;
  if (y > doc.page.height - 100) {
    doc.addPage();
    y = 60;
  }
  const sig = (label: string, x: number) => {
    doc
      .moveTo(x, y)
      .lineTo(x + 200, y)
      .lineWidth(0.8)
      .strokeColor('#94A3B8')
      .stroke();
    doc
      .fillColor('#64748B')
      .font('Helvetica')
      .fontSize(8.5)
      .text(label, x, y + 4);
  };
  sig(t('Parent / guardian signature & date'), left);
  sig(t('School administration signature & stamp'), left + width - 200);

  addPageNumbers(doc);
  return pdfToBuffer(doc);
}

// ─── Bulk import ───

const IMPORT_COLUMNS = [
  {
    get header() {
      return t('First Name*');
    },
    key: 'firstName',
    width: 16,
  },
  {
    get header() {
      return t('Last Name*');
    },
    key: 'lastName',
    width: 16,
  },
  {
    get header() {
      return t('Gender* (M/F)');
    },
    key: 'gender',
    width: 12,
  },
  {
    get header() {
      return t('Date of Birth* (YYYY-MM-DD)');
    },
    key: 'dateOfBirth',
    width: 24,
  },
  {
    get header() {
      return t('Class*');
    },
    key: 'className',
    width: 16,
  },
  {
    get header() {
      return t('Admission Date (YYYY-MM-DD)');
    },
    key: 'admissionDate',
    width: 24,
  },
  {
    get header() {
      return t('Nationality');
    },
    key: 'nationality',
    width: 14,
  },
  {
    get header() {
      return t('Address');
    },
    key: 'address',
    width: 24,
  },
  {
    get header() {
      return t('Blood Group');
    },
    key: 'bloodGroup',
    width: 12,
  },
  {
    get header() {
      return t('Allergies');
    },
    key: 'allergies',
    width: 18,
  },
  {
    get header() {
      return t('Medical Notes');
    },
    key: 'medicalNotes',
    width: 20,
  },
  {
    get header() {
      return t('Special Needs');
    },
    key: 'specialNeeds',
    width: 18,
  },
  {
    get header() {
      return t('Previous School');
    },
    key: 'previousSchool',
    width: 18,
  },
  {
    get header() {
      return t('Guardian Name*');
    },
    key: 'guardianName',
    width: 22,
  },
  {
    get header() {
      return t('Relationship*');
    },
    key: 'relationship',
    width: 14,
  },
  {
    get header() {
      return t('Guardian Phone*');
    },
    key: 'guardianPhone',
    width: 16,
  },
  {
    get header() {
      return t('Guardian Email');
    },
    key: 'guardianEmail',
    width: 22,
  },
  {
    get header() {
      return t('Guardian Occupation');
    },
    key: 'guardianOccupation',
    width: 18,
  },
  {
    get header() {
      return t('Guardian National ID');
    },
    key: 'guardianNationalId',
    width: 20,
  },
] as const;

export async function importTemplate(): Promise<Buffer> {
  const classes = await prisma.class.findMany({ where: { deletedAt: null }, select: { name: true } });
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(t('Students'));
  ws.columns = IMPORT_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  ws.getRow(1).eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F6BED' } };
  });
  ws.addRow({
    firstName: 'Keza', // i18n-ignore: sample data
    lastName: 'Uwase', // i18n-ignore: sample data
    gender: 'F',
    dateOfBirth: '2022-03-14',
    className: classes[0]?.name ?? t('Baby Class'),
    nationality: t('Rwandan'),
    address: 'Kicukiro, Kigali', // i18n-ignore: sample data
    guardianName: 'Jeanne Mukamana', // i18n-ignore: sample data
    relationship: t('Mother'),
    guardianPhone: '+250788123456',
  });
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  const help = wb.addWorksheet(t('Instructions'));
  help.getColumn(1).width = 100;
  [
    t('Fill one row per student in the "Students" sheet. Columns marked * are required.'),
    t('Delete the example row before importing.'),
    t('Gender: M or F. Dates: YYYY-MM-DD.'),
    t('Class must match an existing class name exactly: {classes}', {
      classes: classes.map((c) => c.name).join(', '),
    }),
    t('Blood group (optional): A+, A-, B+, B-, AB+, AB-, O+, O-.'),
    t('Guardian phone: digits with optional leading + (e.g. +250788123456).'),
  ].forEach((line) => help.addRow([line]));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('text' in v && typeof v.text === 'string') return v.text.trim();
    if ('result' in v) return cellText(v.result as ExcelJS.CellValue);
    if ('richText' in v)
      return v.richText
        .map((r) => r.text)
        .join('')
        .trim();
    if ('hyperlink' in v) return String(v.hyperlink).replace(/^mailto:/, '');
  }
  return String(v).trim();
}

export interface ImportResult {
  total: number;
  imported: number;
  dryRun: boolean;
  errors: { row: number; messages: string[] }[];
  created: { row: number; id: number; admissionNumber: string; name: string }[];
}

export async function importStudents(buffer: Buffer, dryRun: boolean, req: Request): Promise<ImportResult> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    return {
      total: 0,
      imported: 0,
      dryRun,
      errors: [{ row: 0, messages: [t('The file is not a valid .xlsx workbook')] }],
      created: [],
    };
  }
  const ws = wb.getWorksheet(t('Students')) ?? wb.worksheets[0];
  if (!ws)
    return {
      total: 0,
      imported: 0,
      dryRun,
      errors: [{ row: 0, messages: [t('Workbook has no sheets')] }],
      created: [],
    };

  const classes = await prisma.class.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
  });
  const classByName = new Map(classes.map((c) => [c.name.toLowerCase(), c.id]));
  const result: ImportResult = { total: 0, imported: 0, dryRun, errors: [], created: [] };

  const rows: { row: number; values: Record<string, string> }[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const values: Record<string, string> = {};
    IMPORT_COLUMNS.forEach((c, i) => (values[c.key] = cellText(row.getCell(i + 1).value)));
    if (Object.values(values).every((v) => !v)) return;
    rows.push({ row: n, values });
  });
  if (rows.length > 1000) throw new Error('Too many rows');
  result.total = rows.length;

  for (const { row, values: v } of rows) {
    const g = v.gender.toUpperCase();
    const candidate = {
      firstName: v.firstName,
      lastName: v.lastName,
      gender: g === 'M' || g === 'MALE' ? 'MALE' : g === 'F' || g === 'FEMALE' ? 'FEMALE' : v.gender,
      dateOfBirth: v.dateOfBirth,
      admissionDate: v.admissionDate || undefined,
      nationality: v.nationality || null,
      address: v.address || null,
      bloodGroup: v.bloodGroup || null,
      allergies: v.allergies || null,
      medicalNotes: v.medicalNotes || null,
      specialNeeds: v.specialNeeds || null,
      previousSchool: v.previousSchool || null,
      currentClassId: classByName.get(v.className.toLowerCase()) ?? -1,
      guardians: [
        {
          fullName: v.guardianName,
          relationship: v.relationship,
          phone: v.guardianPhone,
          email: v.guardianEmail || null,
          occupation: v.guardianOccupation || null,
          nationalId: v.guardianNationalId || null,
          isPrimary: true,
          isEmergencyContact: true,
          canPickUp: true,
        },
      ],
    };
    const parsed = createStudentBody.safeParse(candidate);
    const messages: string[] = [];
    if (candidate.currentClassId === -1)
      messages.push(t('Class "{className}" not found', { className: v.className }));
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const path = issue.path.join('.');
        if (path === 'currentClassId') continue;
        messages.push(`${path.replace('guardians.0.', 'guardian ')}: ${issue.message}`);
      }
    }
    if (messages.length || !parsed.success) {
      result.errors.push({ row, messages });
      continue;
    }
    if (dryRun) continue;
    try {
      const st = await service.create(parsed.data, req);
      result.created.push({
        row,
        id: st.id,
        admissionNumber: st.admissionNumber,
        name: `${st.firstName} ${st.lastName}`,
      });
      result.imported++;
    } catch (err) {
      result.errors.push({ row, messages: [err instanceof Error ? err.message : t('Failed to import')] });
    }
  }
  if (!dryRun && result.imported) {
    await audit(req, {
      action: 'IMPORT',
      entity: 'Student',
      newValues: { imported: result.imported, failed: result.errors.length },
    });
  }
  return result;
}
