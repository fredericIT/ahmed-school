import { prisma } from '../../config/prisma';
import { addPageNumbers, drawLetterhead, pdfToBuffer } from '../../utils/export';
import { notFound } from '../../utils/errors';
import { getSettings } from '../../utils/settings';
import { GRADE_SCALE, PASS_MARK, classSheet, gradeFor, pctOf } from './service';
import { createPdf } from '../../utils/pdf';
import { formatNumber, formatPercent, t } from '../../i18n';

const INK = '#0F172A';
const MUTED = '#64748B';
const ROYAL = '#4F6BED';
const LINE = '#E2E8F0';

const fmt = (n: number) => formatNumber(n, 2);
const frac = (obtained: number, possible: number) =>
  possible > 0 ? `${fmt(obtained)} / ${fmt(possible)}` : '—';

/** Report cards (bulletins) for a class and term: one A4 page per pupil, or a single pupil's card. */
export async function reportCards(termId: number, classId: number, studentId?: number) {
  const settings = await getSettings();
  const { term, cls, courses, students } = await classSheet(termId, classId);
  const ranked = students.filter((r) => r.position !== null).length;
  const selected = studentId ? students.filter((r) => r.student.id === studentId) : students;
  if (!selected.length) throw notFound(studentId ? 'Pupil in this class' : 'Pupils in this class');

  const attendance = await prisma.attendance.groupBy({
    by: ['studentId', 'status'],
    where: { termId, classId, studentId: { in: selected.map((r) => r.student.id) } },
    _count: true,
  });

  const doc = createPdf({ size: 'A4', margin: 40, bufferPages: true });
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;

  selected.forEach((r, i) => {
    if (i > 0) doc.addPage();
    let y = drawLetterhead(doc, settings, t('School report'), `${term.name} · ${term.academicYear.name}`);

    // Pupil box
    const att = attendance.filter((a) => a.studentId === r.student.id);
    const days = att.reduce((sum, a) => sum + a._count, 0);
    const present = att
      .filter((a) => a.status === 'PRESENT' || a.status === 'LATE')
      .reduce((s, a) => s + a._count, 0);
    const info: [string, string][] = [
      [t('Pupil'), `${r.student.firstName} ${r.student.lastName}`],
      [t('Admission no.'), r.student.admissionNumber],
      [t('Class'), cls.name],
      [t('Class teacher'), cls.classTeacherName ?? '—'],
      [
        t('Position'),
        r.position === null ? '—' : t('{position} of {count}', { position: r.position, count: ranked }),
      ],
      [
        t('Attendance'),
        days
          ? t('{present} of {days} days ({percent})', {
              present,
              days,
              percent: formatPercent((present / days) * 100, 0),
            })
          : t('Not recorded'),
      ],
    ];
    doc.roundedRect(left, y, width, 64, 8).fill('#EEF2FF');
    const colW = width / 3;
    info.forEach(([label, value], k) => {
      const x = left + 12 + (k % 3) * colW;
      const yy = y + 10 + Math.floor(k / 3) * 26;
      doc
        .fillColor(MUTED)
        .font('Helvetica')
        .fontSize(7.5)
        .text(label.toUpperCase(), x, yy, { width: colW - 16 });
      doc
        .fillColor(INK)
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(value, x, yy + 9, { width: colW - 16, lineBreak: false, ellipsis: true });
    });
    y += 78;

    // Results table
    const cols = [
      // Widths leave room for longer French and Kinyarwanda words in the grade and remark columns.
      { h: t('Course'), w: 0.24, align: 'left' as const },
      { h: t('Continuous assessment'), w: 0.16, align: 'center' as const },
      { h: t('Exam'), w: 0.12, align: 'center' as const },
      { h: t('Total'), w: 0.13, align: 'center' as const },
      { h: '%', w: 0.08, align: 'right' as const },
      { h: t('Grade'), w: 0.09, align: 'center' as const },
      { h: t('Remark'), w: 0.18, align: 'left' as const },
    ];
    const drawRow = (cells: string[], opts: { header?: boolean; fill?: string; bold?: boolean }) => {
      doc.font(opts.header || opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.header ? 8 : 9);
      // Rows grow to fit long course names or headers instead of clipping them.
      const h =
        Math.max(...cells.map((c, k) => doc.heightOfString(c || ' ', { width: cols[k].w * width - 10 }))) +
        11;
      if (opts.fill) doc.rect(left, y, width, h).fill(opts.fill);
      let x = left;
      cells.forEach((c, k) => {
        const w = cols[k].w * width;
        doc
          .fillColor(opts.header ? '#FFFFFF' : INK)
          .text(c, x + 5, y + 6, { width: w - 10, align: cols[k].align });
        x += w;
      });
      y += h;
      doc
        .moveTo(left, y)
        .lineTo(left + width, y)
        .lineWidth(0.5)
        .strokeColor(LINE)
        .stroke();
    };
    drawRow(
      cols.map((c) => c.h),
      { header: true, fill: ROYAL },
    );
    if (!courses.length) {
      doc
        .fillColor(MUTED)
        .font('Helvetica-Oblique')
        .fontSize(9)
        .text(t('No marks recorded for this term yet.'), left, y + 8);
      y += 28;
    }
    courses.forEach((c, k) => {
      const tally = r.perCourse.get(c.id);
      const pct = pctOf(tally);
      const g = gradeFor(pct);
      drawRow(
        [
          c.name,
          tally ? frac(tally.caObtained, tally.caPossible) : '—',
          tally ? frac(tally.examObtained, tally.examPossible) : '—',
          tally ? frac(tally.obtained, tally.possible) : '—',
          pct === null ? '—' : formatNumber(pct, 1),
          g?.grade ?? '—',
          g?.remark ?? '',
        ],
        { fill: k % 2 ? '#F8FAFC' : undefined },
      );
    });
    const g = gradeFor(r.average);
    drawRow(
      [
        t('Average'),
        '',
        '',
        '',
        r.average === null ? '—' : formatNumber(r.average, 1),
        g?.grade ?? '—',
        g?.remark ?? '',
      ],
      { fill: '#FFF7DB', bold: true },
    );
    y += 8;

    const verdict =
      r.average === null
        ? t('No overall result yet.')
        : r.average >= PASS_MARK
          ? t('Overall result: {average}. Passed.', { average: formatPercent(r.average) })
          : t('Overall result: {average}. Below the pass mark of {passMark}; extra support is recommended.', {
              average: formatPercent(r.average),
              passMark: formatPercent(PASS_MARK, 0),
            });
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(10).text(verdict, left, y, { width });
    y = doc.y + 6;
    doc
      .fillColor(MUTED)
      .font('Helvetica')
      .fontSize(7.5)
      .text(
        t('Grading: {scale}.', {
          scale: GRADE_SCALE.map(
            (s, k) => `${s.grade} ${s.min}${k === 0 ? '–100' : `–${GRADE_SCALE[k - 1].min - 1}`} ${s.remark}`,
          ).join('  ·  '),
        }) +
          ' ' +
          t(
            'Every assessment of the term counts; continuous assessment covers classwork, homework, quizzes, tests and projects.',
          ),
        left,
        y,
        { width },
      );
    y = doc.y + 18;

    // Comments and signatures
    for (const label of [t("Class teacher's comment"), t("Head teacher's comment")]) {
      doc.fillColor(INK).font('Helvetica-Bold').fontSize(9).text(label, left, y);
      y = doc.y + 18;
      doc
        .moveTo(left, y)
        .lineTo(left + width, y)
        .lineWidth(0.6)
        .strokeColor('#CBD5E1')
        .stroke();
      y += 16;
    }
    const sigW = width / 3;
    [t('Class teacher'), t('Head teacher'), t('Parent / guardian')].forEach((label, k) => {
      const x = left + k * sigW;
      doc
        .moveTo(x + 6, y + 26)
        .lineTo(x + sigW - 12, y + 26)
        .lineWidth(0.6)
        .strokeColor('#94A3B8')
        .stroke();
      doc
        .fillColor(MUTED)
        .font('Helvetica')
        .fontSize(8)
        .text(`${label}: signature`, x + 6, y + 30, { width: sigW - 18 });
    });
  });

  addPageNumbers(doc);
  const name = studentId
    ? `report-card-${selected[0].student.admissionNumber}`
    : `report-cards-${cls.name.replace(/\s+/g, '-').toLowerCase()}`;
  return {
    buffer: await pdfToBuffer(doc),
    filename: `${name}-${term.name.replace(/\s+/g, '-').toLowerCase()}.pdf`,
  };
}
