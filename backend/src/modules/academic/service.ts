import type { Request } from 'express';
import type { z } from 'zod';
import { prisma } from '../../config/prisma';
import { audit, diff } from '../../utils/audit';
import { fmtDate, toDateOnly } from '../../utils/dates';
import { badRequest, conflict, notFound } from '../../utils/errors';
import type * as s from './schema';

// ─── Academic years ───
export const listYears = () =>
  prisma.academicYear.findMany({
    where: { deletedAt: null },
    orderBy: { startDate: 'desc' },
    include: { terms: { where: { deletedAt: null }, orderBy: { startDate: 'asc' } } },
  });

async function getYear(id: number) {
  const y = await prisma.academicYear.findFirst({ where: { id, deletedAt: null } });
  if (!y) throw notFound('Academic year');
  return y;
}

export async function createYear(data: z.infer<typeof s.yearBody>, req: Request) {
  const year = await prisma.$transaction(async (tx) => {
    if (data.isCurrent) await tx.academicYear.updateMany({ data: { isCurrent: false } });
    return tx.academicYear.create({
      data: {
        name: data.name.replace('–', '-'),
        startDate: toDateOnly(data.startDate),
        endDate: toDateOnly(data.endDate),
        isCurrent: !!data.isCurrent,
      },
    });
  });
  await audit(req, { action: 'CREATE', entity: 'AcademicYear', entityId: year.id, newValues: year });
  return year;
}

export async function updateYear(id: number, data: z.infer<typeof s.yearUpdateBody>, req: Request) {
  const before = await getYear(id);
  const start = data.startDate ?? fmtDate(before.startDate);
  const end = data.endDate ?? fmtDate(before.endDate);
  if (start >= end) throw badRequest('End date must be after start date');
  const after = await prisma.academicYear.update({
    where: { id },
    data: { name: data.name, startDate: toDateOnly(start), endDate: toDateOnly(end) },
  });
  await audit(req, { action: 'UPDATE', entity: 'AcademicYear', entityId: id, ...diff(before, after) });
  return after;
}

export async function setCurrentYear(id: number, req: Request) {
  await getYear(id);
  const year = await prisma.$transaction(async (tx) => {
    await tx.academicYear.updateMany({ data: { isCurrent: false } });
    return tx.academicYear.update({ where: { id }, data: { isCurrent: true } });
  });
  await audit(req, {
    action: 'UPDATE',
    entity: 'AcademicYear',
    entityId: id,
    newValues: { isCurrent: true },
  });
  return year;
}

export async function deleteYear(id: number, req: Request) {
  const y = await getYear(id);
  if (y.isCurrent) throw badRequest('The current academic year cannot be deleted');
  const used = await prisma.enrollment.count({ where: { academicYearId: id } });
  if (used) throw conflict('This academic year has enrollments and cannot be deleted');
  await prisma.$transaction([
    prisma.term.updateMany({
      where: { academicYearId: id },
      data: { deletedAt: new Date(), isCurrent: false },
    }),
    prisma.academicYear.update({
      where: { id },
      data: { deletedAt: new Date(), name: `${y.name}#deleted-${id}` },
    }),
  ]);
  await audit(req, { action: 'DELETE', entity: 'AcademicYear', entityId: id, oldValues: y });
  return { deleted: true };
}

// ─── Terms ───
export const listTerms = (academicYearId?: number) =>
  prisma.term.findMany({
    where: { deletedAt: null, academicYearId, academicYear: { deletedAt: null } },
    orderBy: { startDate: 'asc' },
    include: { academicYear: { select: { id: true, name: true } } },
  });

async function getTerm(id: number) {
  const term = await prisma.term.findFirst({
    where: { id, deletedAt: null },
    include: { academicYear: true },
  });
  if (!term) throw notFound('Term');
  return term;
}

function assertWithinYear(start: string, end: string, year: { startDate: Date; endDate: Date }) {
  if (start < fmtDate(year.startDate) || end > fmtDate(year.endDate))
    throw badRequest('Term dates must fall within the academic year');
}

export async function createTerm(data: z.infer<typeof s.termBody>, req: Request) {
  const year = await getYear(data.academicYearId);
  assertWithinYear(data.startDate, data.endDate, year);
  const term = await prisma.$transaction(async (tx) => {
    if (data.isCurrent) await tx.term.updateMany({ data: { isCurrent: false } });
    return tx.term.create({
      data: {
        academicYearId: data.academicYearId,
        name: data.name,
        startDate: toDateOnly(data.startDate),
        endDate: toDateOnly(data.endDate),
        isCurrent: !!data.isCurrent,
      },
    });
  });
  await audit(req, { action: 'CREATE', entity: 'Term', entityId: term.id, newValues: term });
  return term;
}

export async function updateTerm(id: number, data: z.infer<typeof s.termUpdateBody>, req: Request) {
  const before = await getTerm(id);
  const start = data.startDate ?? fmtDate(before.startDate);
  const end = data.endDate ?? fmtDate(before.endDate);
  if (start >= end) throw badRequest('End date must be after start date');
  assertWithinYear(start, end, before.academicYear);
  const after = await prisma.term.update({
    where: { id },
    data: { name: data.name, startDate: toDateOnly(start), endDate: toDateOnly(end) },
  });
  const { academicYear: _y, ...plainBefore } = before;
  await audit(req, { action: 'UPDATE', entity: 'Term', entityId: id, ...diff(plainBefore, after) });
  return after;
}

export async function setCurrentTerm(id: number, req: Request) {
  const current = await getTerm(id);
  const term = await prisma.$transaction(async (tx) => {
    await tx.term.updateMany({ data: { isCurrent: false } });
    // The current term's year becomes the current year as well.
    await tx.academicYear.updateMany({ data: { isCurrent: false } });
    await tx.academicYear.update({ where: { id: current.academicYearId }, data: { isCurrent: true } });
    return tx.term.update({ where: { id }, data: { isCurrent: true } });
  });
  await audit(req, { action: 'UPDATE', entity: 'Term', entityId: id, newValues: { isCurrent: true } });
  return term;
}

export async function deleteTerm(id: number, req: Request) {
  const term = await getTerm(id);
  if (term.isCurrent) throw badRequest('The current term cannot be deleted');
  const used =
    (await prisma.attendance.count({ where: { termId: id } })) +
    (await prisma.activity.count({ where: { termId: id } }));
  if (used) throw conflict('This term has attendance or activities and cannot be deleted');
  await prisma.term.update({
    where: { id },
    data: { deletedAt: new Date(), name: `${term.name}#deleted-${id}` },
  });
  await audit(req, { action: 'DELETE', entity: 'Term', entityId: id, oldValues: term });
  return { deleted: true };
}

/** Finds the term whose date range contains the given date. */
export async function termForDate(iso: string) {
  const d = toDateOnly(iso);
  return prisma.term.findFirst({ where: { deletedAt: null, startDate: { lte: d }, endDate: { gte: d } } });
}

export async function currentTerm() {
  return prisma.term.findFirst({
    where: { isCurrent: true, deletedAt: null },
    include: { academicYear: true },
  });
}

export async function currentYear() {
  return prisma.academicYear.findFirst({ where: { isCurrent: true, deletedAt: null } });
}

export async function getCurrent() {
  return { year: await currentYear(), term: await currentTerm() };
}

// ─── Holidays ───
export function listHolidays(year?: number) {
  return prisma.holiday.findMany({
    where: year
      ? { date: { gte: toDateOnly(`${year}-01-01`), lte: toDateOnly(`${year}-12-31`) } }
      : undefined,
    orderBy: { date: 'asc' },
  });
}

export async function createHoliday(data: z.infer<typeof s.holidayBody>, req: Request) {
  const h = await prisma.holiday.create({ data: { name: data.name, date: toDateOnly(data.date) } });
  await audit(req, { action: 'CREATE', entity: 'Holiday', entityId: h.id, newValues: h });
  return h;
}

export async function deleteHoliday(id: number, req: Request) {
  const h = await prisma.holiday.findUnique({ where: { id } });
  if (!h) throw notFound('Holiday');
  await prisma.holiday.delete({ where: { id } });
  await audit(req, { action: 'DELETE', entity: 'Holiday', entityId: id, oldValues: h });
  return { deleted: true };
}

export async function isHoliday(iso: string) {
  return prisma.holiday.findUnique({ where: { date: toDateOnly(iso) } });
}
