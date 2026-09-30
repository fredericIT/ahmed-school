import type { Request } from 'express';
import type { AttendanceStatus, Prisma } from '@prisma/client';
import type { z } from 'zod';
import { prisma } from '../../config/prisma';
import { audit } from '../../utils/audit';
import { addDays, eachDay, fmtDate, isWeekend, monthRange, toDateOnly, todayIn } from '../../utils/dates';
import { badRequest, notFound } from '../../utils/errors';
import type { Report } from '../../utils/export';
import { getSettings } from '../../utils/settings';
import { isHoliday, termForDate } from '../academic/service';
import type * as s from './schema';
import { formatDate, formatPercent, periodLabel, t } from '../../i18n';

export const ATTENDED: AttendanceStatus[] = ['PRESENT', 'LATE'];

export function rate(attended: number, total: number): number | null {
  return total ? Math.round((attended / total) * 1000) / 10 : null;
}

/** Returns why attendance can't be taken on this date, or null if it can. */
export async function dateLockReason(date: string): Promise<string | null> {
  const settings = await getSettings();
  if (date > todayIn(settings.timezone)) return t('Attendance cannot be recorded for a future date');
  if (!settings.allowWeekendAttendance && isWeekend(date)) return t('Attendance is not taken on weekends');
  const holiday = await isHoliday(date);
  if (holiday)
    return t('{date} is a holiday ({name})', { date: formatDate(holiday.date), name: holiday.name });
  return null;
}

/** Resolves a reporting window from explicit dates, a term, the current term, or the last 30 days. */
export async function resolveRange(q: { from?: string; to?: string; termId?: number }) {
  const { timezone } = await getSettings();
  const today = todayIn(timezone);
  if (q.termId) {
    const term = await prisma.term.findFirst({
      where: { id: q.termId, deletedAt: null },
      include: { academicYear: true },
    });
    if (!term) throw notFound('Term');
    const to = fmtDate(term.endDate) < today ? fmtDate(term.endDate) : today;
    return { from: fmtDate(term.startDate), to, label: `${term.name} ${term.academicYear.name}` };
  }
  if (q.from || q.to) {
    const from = q.from ?? addDays(q.to as string, -30);
    const to = q.to ?? today;
    if (from > to) throw badRequest('"from" must be before "to"');
    return { from, to, label: periodLabel(from, to) };
  }
  const current = await prisma.term.findFirst({
    where: { isCurrent: true, deletedAt: null },
    include: { academicYear: true },
  });
  if (current && fmtDate(current.startDate) <= today) {
    const to = fmtDate(current.endDate) < today ? fmtDate(current.endDate) : today;
    return { from: fmtDate(current.startDate), to, label: `${current.name} ${current.academicYear.name}` };
  }
  return { from: addDays(today, -29), to: today, label: t('Last 30 days') };
}

async function getClass(classId: number) {
  const cls = await prisma.class.findFirst({ where: { id: classId, deletedAt: null } });
  if (!cls) throw notFound('Class');
  return cls;
}

const rosterSelect = {
  id: true,
  admissionNumber: true,
  firstName: true,
  lastName: true,
  gender: true,
  photo: true,
} as const;

// ─── Daily sheet ───

export async function sheet(classId: number, date: string) {
  const cls = await getClass(classId);
  const [students, records, lockReason] = await Promise.all([
    prisma.student.findMany({
      where: { currentClassId: classId, status: 'ACTIVE', deletedAt: null },
      select: {
        ...rosterSelect,
        allergies: true,
        guardians: {
          where: { guardian: { canPickUp: true } },
          select: { guardian: { select: { fullName: true, relationship: true } } },
        },
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    }),
    prisma.attendance.findMany({
      where: { classId, date: toDateOnly(date) },
      include: { recordedBy: { select: { firstName: true, lastName: true } } },
    }),
    dateLockReason(date),
  ]);
  const byStudent = new Map(records.map((r) => [r.studentId, r]));
  const summary: Record<AttendanceStatus, number> = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0, SICK: 0 };
  records.forEach((r) => summary[r.status]++);
  return {
    class: cls,
    date,
    lockReason,
    taken: records.length > 0,
    summary: {
      ...summary,
      total: students.length,
      recorded: records.length,
      rate: rate(summary.PRESENT + summary.LATE, records.length),
    },
    rows: students.map(({ guardians, ...st }) => ({
      student: st,
      authorizedPickups: guardians.map((g) => `${g.guardian.fullName} (${t(g.guardian.relationship)})`),
      attendance: byStudent.get(st.id) ?? null,
    })),
  };
}

export async function saveSheet(data: z.infer<typeof s.saveSheetBody>, req: Request) {
  const lock = await dateLockReason(data.date);
  if (lock) throw badRequest(lock);
  await getClass(data.classId);

  const ids = data.records.map((r) => r.studentId);
  if (new Set(ids).size !== ids.length) throw badRequest('Each student can only appear once');
  const valid = await prisma.student.findMany({
    where: { id: { in: ids }, currentClassId: data.classId, status: 'ACTIVE', deletedAt: null },
    select: { id: true },
  });
  if (valid.length !== ids.length) {
    const ok = new Set(valid.map((v) => v.id));
    throw badRequest('Some students are not active members of this class', {
      studentIds: ids.filter((i) => !ok.has(i)),
    });
  }

  const date = toDateOnly(data.date);
  const term = await termForDate(data.date);
  const { timezone } = await getSettings();
  const isPastDay = data.date < todayIn(timezone);

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.attendance.findMany({ where: { studentId: { in: ids }, date } });
    const before = new Map(existing.map((e) => [e.studentId, e]));
    let created = 0;
    let updated = 0;
    const changes: {
      studentId: number;
      old: Partial<(typeof existing)[number]>;
      new: Record<string, unknown>;
    }[] = [];

    for (const r of data.records) {
      const fields = {
        status: r.status,
        arrivalTime: r.arrivalTime ?? null,
        pickedUpBy: r.pickedUpBy ?? null,
        remark: r.remark ?? null,
      };
      const prev = before.get(r.studentId);
      if (!prev) {
        await tx.attendance.create({
          data: {
            ...fields,
            studentId: r.studentId,
            classId: data.classId,
            termId: term?.id ?? null,
            date,
            recordedById: req.user?.id,
          },
        });
        created++;
        continue;
      }
      const changed = (Object.keys(fields) as (keyof typeof fields)[]).some((k) => prev[k] !== fields[k]);
      if (!changed) continue;
      await tx.attendance.update({
        where: { id: prev.id },
        data: { ...fields, classId: data.classId, recordedById: req.user?.id },
      });
      updated++;
      changes.push({
        studentId: r.studentId,
        old: {
          status: prev.status,
          arrivalTime: prev.arrivalTime,
          pickedUpBy: prev.pickedUpBy,
          remark: prev.remark,
        },
        new: fields,
      });
    }

    if (created) {
      await audit(
        req,
        {
          action: 'CREATE',
          entity: 'Attendance',
          entityId: `${data.classId}:${data.date}`,
          newValues: { classId: data.classId, date: data.date, created },
        },
        tx,
      );
    }
    // Edits are always logged with a per-student before/after; edits of past days are flagged.
    if (changes.length) {
      await audit(
        req,
        {
          action: 'UPDATE',
          entity: 'Attendance',
          entityId: `${data.classId}:${data.date}`,
          oldValues: {
            date: data.date,
            pastEdit: isPastDay,
            records: changes.map((c) => ({ studentId: c.studentId, ...c.old })),
          },
          newValues: {
            date: data.date,
            pastEdit: isPastDay,
            records: changes.map((c) => ({ studentId: c.studentId, ...c.new })),
          },
        },
        tx,
      );
    }
    return { created, updated, unchanged: data.records.length - created - updated };
  });
  return result;
}

// ─── Calendar & history ───

export async function monthly(classId: number, month: string) {
  const cls = await getClass(classId);
  const { from, to } = monthRange(month);
  const settings = await getSettings();
  const [students, records, holidays] = await Promise.all([
    prisma.student.findMany({
      where: { currentClassId: classId, status: 'ACTIVE', deletedAt: null },
      select: rosterSelect,
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    }),
    prisma.attendance.findMany({
      where: { classId, date: { gte: toDateOnly(from), lte: toDateOnly(to) } },
      select: { studentId: true, date: true, status: true },
    }),
    prisma.holiday.findMany({ where: { date: { gte: toDateOnly(from), lte: toDateOnly(to) } } }),
  ]);
  const holidayMap = new Map(holidays.map((h) => [fmtDate(h.date), h.name]));
  const days = eachDay(from, to).map((d) => ({
    date: d,
    weekend: isWeekend(d),
    holiday: holidayMap.get(d) ?? null,
    schoolDay: (settings.allowWeekendAttendance || !isWeekend(d)) && !holidayMap.has(d),
  }));
  const grid = new Map<number, Record<string, AttendanceStatus>>();
  for (const r of records) {
    const row = grid.get(r.studentId) ?? {};
    row[fmtDate(r.date)] = r.status;
    grid.set(r.studentId, row);
  }
  return {
    class: cls,
    month,
    days,
    students: students.map((st) => {
      const statuses = grid.get(st.id) ?? {};
      const vals = Object.values(statuses);
      return {
        ...st,
        statuses,
        rate: rate(vals.filter((v) => ATTENDED.includes(v)).length, vals.length),
        absences: vals.filter((v) => v === 'ABSENT').length,
      };
    }),
  };
}

export async function studentHistory(studentId: number, q: { from?: string; to?: string }) {
  const st = await prisma.student.findFirst({
    where: { id: studentId },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!st) throw notFound('Student');
  const where: Prisma.AttendanceWhereInput = {
    studentId,
    date: { gte: q.from ? toDateOnly(q.from) : undefined, lte: q.to ? toDateOnly(q.to) : undefined },
  };
  const records = await prisma.attendance.findMany({
    where,
    orderBy: { date: 'desc' },
    include: {
      class: { select: { name: true } },
      recordedBy: { select: { firstName: true, lastName: true } },
    },
  });
  const counts: Record<AttendanceStatus, number> = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0, SICK: 0 };
  records.forEach((r) => counts[r.status]++);
  return {
    student: st,
    summary: { ...counts, total: records.length, rate: rate(counts.PRESENT + counts.LATE, records.length) },
    records: records.map((r) => ({ ...r, date: fmtDate(r.date) })),
  };
}

// ─── Reports ───

export async function studentRates(q: { from: string; to: string; classId?: number }) {
  const where: Prisma.AttendanceWhereInput = {
    date: { gte: toDateOnly(q.from), lte: toDateOnly(q.to) },
    classId: q.classId,
  };
  const grouped = await prisma.attendance.groupBy({ by: ['studentId', 'status'], where, _count: true });
  const students = await prisma.student.findMany({
    where: { status: 'ACTIVE', deletedAt: null, currentClassId: q.classId },
    select: {
      id: true,
      admissionNumber: true,
      firstName: true,
      lastName: true,
      currentClass: { select: { id: true, name: true } },
    },
    orderBy: [{ currentClassId: 'asc' }, { firstName: 'asc' }],
  });
  return students.map((st) => {
    const counts: Record<AttendanceStatus, number> = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0, SICK: 0 };
    grouped.filter((g) => g.studentId === st.id).forEach((g) => (counts[g.status] = g._count));
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return {
      studentId: st.id,
      admissionNumber: st.admissionNumber,
      name: `${st.firstName} ${st.lastName}`,
      className: st.currentClass?.name ?? '',
      classId: st.currentClass?.id ?? null,
      ...counts,
      total,
      rate: rate(counts.PRESENT + counts.LATE, total),
    };
  });
}

export async function classRates(q: { from: string; to: string }) {
  const grouped = await prisma.attendance.groupBy({
    by: ['classId', 'status'],
    where: { date: { gte: toDateOnly(q.from), lte: toDateOnly(q.to) } },
    _count: true,
  });
  const classes = await prisma.class.findMany({ where: { deletedAt: null }, orderBy: { id: 'asc' } });
  return classes.map((c) => {
    const counts: Record<AttendanceStatus, number> = { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0, SICK: 0 };
    grouped.filter((g) => g.classId === c.id).forEach((g) => (counts[g.status] = g._count));
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return {
      classId: c.id,
      className: c.name,
      ...counts,
      total,
      rate: rate(counts.PRESENT + counts.LATE, total),
    };
  });
}

const countColumns = [
  {
    key: 'PRESENT',
    get header() {
      return t('Present');
    },
    format: 'number' as const,
    width: 1.2,
  },
  {
    key: 'LATE',
    get header() {
      return t('Late');
    },
    format: 'number' as const,
    width: 1,
  },
  {
    key: 'ABSENT',
    get header() {
      return t('Absent');
    },
    format: 'number' as const,
    width: 1.2,
  },
  {
    key: 'EXCUSED',
    get header() {
      return t('Excused');
    },
    format: 'number' as const,
    width: 1.2,
  },
  {
    key: 'SICK',
    get header() {
      return t('Sick');
    },
    format: 'number' as const,
    width: 1,
  },
  {
    key: 'total',
    get header() {
      return t('Days');
    },
    format: 'number' as const,
    width: 1,
  },
  {
    key: 'rate',
    get header() {
      return t('Rate');
    },
    format: 'percent' as const,
    width: 1.2,
  },
];

export async function studentReport(q: z.infer<typeof s.reportQuery>): Promise<Report> {
  const range = await resolveRange(q);
  const rows = await studentRates({ ...range, classId: q.classId });
  const cls = q.classId ? await getClass(q.classId) : null;
  const rated = rows.filter((r) => r.rate !== null);
  return {
    title: t('Attendance by Student'),
    subtitle: [cls?.name ?? t('All classes'), range.label].join(' · '),
    columns: [
      { key: 'admissionNumber', header: t('Adm. No'), width: 2 },
      { key: 'name', header: t('Name'), width: 3 },
      { key: 'className', header: t('Class'), width: 1.6 },
      ...countColumns,
    ],
    rows,
    summary: [
      { label: t('Students'), value: rows.length },
      {
        label: t('Average rate'),
        value: rated.length
          ? formatPercent(rated.reduce((a, r) => a + (r.rate ?? 0), 0) / rated.length)
          : '—',
      },
    ],
  };
}

export async function classReport(q: z.infer<typeof s.reportQuery>): Promise<Report> {
  const range = await resolveRange(q);
  const rows = await classRates(range);
  const totals = rows.reduce((a, r) => ({ att: a.att + r.PRESENT + r.LATE, all: a.all + r.total }), {
    att: 0,
    all: 0,
  });
  return {
    title: t('Attendance by Class'),
    subtitle: range.label,
    columns: [{ key: 'className', header: t('Class'), width: 2.5 }, ...countColumns],
    rows,
    summary: [
      {
        label: t('School rate'),
        value: totals.all ? formatPercent((totals.att / totals.all) * 100) : '—',
      },
    ],
  };
}

export async function chronicReport(q: z.infer<typeof s.reportQuery>): Promise<Report> {
  const settings = await getSettings();
  const threshold = q.threshold ?? settings.chronicAbsenceThreshold;
  const range = await resolveRange(q);
  const rows = (await studentRates({ ...range, classId: q.classId }))
    .filter((r) => r.rate !== null && r.rate < threshold)
    .sort((a, b) => (a.rate ?? 0) - (b.rate ?? 0));
  return {
    title: t('Chronic Absentees'),
    subtitle: `${t('Attendance below {percent}', { percent: formatPercent(threshold) })} · ${range.label}`,
    columns: [
      { key: 'admissionNumber', header: t('Adm. No'), width: 2 },
      { key: 'name', header: t('Name'), width: 3 },
      { key: 'className', header: t('Class'), width: 1.6 },
      ...countColumns,
    ],
    rows,
    summary: [
      { label: t('Threshold'), value: formatPercent(threshold) },
      { label: t('Students below'), value: rows.length },
    ],
  };
}
