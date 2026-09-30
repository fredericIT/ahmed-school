import type { Request } from 'express';
import type { ActivityStatus, Prisma } from '@prisma/client';
import type { z } from 'zod';
import { prisma, type Tx } from '../../config/prisma';
import { audit, diff } from '../../utils/audit';
import { fmtDate, toDateOnly } from '../../utils/dates';
import { badRequest, notFound } from '../../utils/errors';
import { addPageNumbers, drawLetterhead, pdfToBuffer, type Report } from '../../utils/export';
import { publicUrlToPath, removeUpload } from '../../utils/files';
import { orderBy, paged, skipTake } from '../../utils/pagination';
import { getSettings } from '../../utils/settings';
import { termForDate } from '../academic/service';
import type * as s from './schema';
import fs from 'fs';
import { createPdf } from '../../utils/pdf';
import { formatDate, formatMoney, periodLabel, t } from '../../i18n';
import { label } from '../../i18n/labels';

const detailInclude = {
  term: { select: { id: true, name: true } },
  participants: {
    include: {
      class: { select: { id: true, name: true } },
      student: { select: { id: true, firstName: true, lastName: true, photo: true, admissionNumber: true } },
    },
  },
  photos: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.ActivityInclude;

export function buildWhere(q: z.infer<typeof s.listQuery>): Prisma.ActivityWhereInput {
  return {
    deletedAt: null,
    category: q.category,
    status: q.status,
    termId: q.termId,
    date:
      q.from || q.to
        ? { gte: q.from ? toDateOnly(q.from) : undefined, lte: q.to ? toDateOnly(q.to) : undefined }
        : undefined,
    ...(q.classId && {
      participants: { some: { OR: [{ classId: q.classId }, { student: { currentClassId: q.classId } }] } },
    }),
    ...(q.search && {
      OR: [
        { title: { contains: q.search } },
        { location: { contains: q.search } },
        { organizer: { contains: q.search } },
      ],
    }),
  };
}

const listInclude = {
  participants: { include: { class: { select: { id: true, name: true } } } },
  _count: { select: { photos: true } },
} satisfies Prisma.ActivityInclude;

function summarize(a: Prisma.ActivityGetPayload<{ include: typeof listInclude }>) {
  const { participants, _count, ...rest } = a;
  return {
    ...rest,
    classes: participants.filter((p) => p.class).map((p) => p.class as { id: number; name: string }),
    studentCount: participants.filter((p) => p.studentId).length,
    photoCount: _count.photos,
  };
}

export async function list(q: z.infer<typeof s.listQuery>) {
  const where = buildWhere(q);
  const [rows, total] = await Promise.all([
    prisma.activity.findMany({
      where,
      include: listInclude,
      orderBy: orderBy(q, ['date', 'title', 'status', 'category', 'createdAt'] as const, 'date'),
      ...skipTake(q),
    }),
    prisma.activity.count({ where }),
  ]);
  return paged(rows.map(summarize), total, q);
}

export async function listReport(q: z.infer<typeof s.listQuery>): Promise<Report> {
  const rows = await prisma.activity.findMany({
    where: buildWhere(q),
    include: listInclude,
    orderBy: { date: 'asc' },
    take: 2000,
  });
  const data = rows.map(summarize).map((a) => ({
    date: fmtDate(a.date),
    title: a.title,
    category: label(a.category),
    status: a.status,
    location: a.location ?? '',
    organizer: a.organizer ?? '',
    participants: [
      a.classes.map((c) => c.name).join(', '),
      a.studentCount ? `${a.studentCount} students` : '',
    ]
      .filter(Boolean)
      .join(' + '),
    budget: a.budget ? Number(a.budget) : null,
    actualCost: a.actualCost ? Number(a.actualCost) : null,
  }));
  return {
    title: t('Activities Report'),
    subtitle:
      [periodLabel(q.from, q.to), q.category && label(q.category), q.status && label(q.status)]
        .filter(Boolean)
        .join(' · ') || undefined,
    columns: [
      { key: 'date', header: t('Date'), format: 'date', width: 1.4 },
      { key: 'title', header: t('Title'), width: 3 },
      { key: 'category', header: t('Category'), width: 1.6 },
      { key: 'status', header: t('Status'), width: 1.4 },
      { key: 'location', header: t('Location'), width: 2 },
      { key: 'organizer', header: t('Organizer'), width: 2 },
      { key: 'participants', header: t('Participants'), width: 2.5 },
      { key: 'budget', header: t('Budget'), format: 'money', width: 1.6 },
      { key: 'actualCost', header: t('Actual cost'), format: 'money', width: 1.6 },
    ],
    rows: data,
    summary: [
      { label: t('Activities'), value: data.length },
      { label: t('Completed'), value: data.filter((d) => d.status === 'COMPLETED').length },
      {
        label: t('Total budget'),
        value: Math.round(data.reduce((a, d) => a + (d.budget ?? 0), 0)),
      },
      {
        label: t('Total spent'),
        value: Math.round(data.reduce((a, d) => a + (d.actualCost ?? 0), 0)),
      },
    ],
  };
}

export async function calendar(from: string, to: string) {
  if (from > to) throw badRequest('"from" must be before "to"');
  return prisma.activity.findMany({
    where: { deletedAt: null, date: { gte: toDateOnly(from), lte: toDateOnly(to) } },
    select: {
      id: true,
      title: true,
      category: true,
      date: true,
      startTime: true,
      endTime: true,
      status: true,
      location: true,
    },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
  });
}

export async function get(id: number) {
  const a = await prisma.activity.findFirst({ where: { id, deletedAt: null }, include: detailInclude });
  if (!a) throw notFound('Activity');
  const classIds = a.participants.filter((p) => p.classId).map((p) => p.classId as number);
  const classStudentCount = classIds.length
    ? await prisma.student.count({
        where: { currentClassId: { in: classIds }, status: 'ACTIVE', deletedAt: null },
      })
    : 0;
  return {
    ...a,
    classes: a.participants.filter((p) => p.class).map((p) => p.class),
    students: a.participants.filter((p) => p.student).map((p) => p.student),
    totalParticipants: classStudentCount + a.participants.filter((p) => p.studentId).length,
  };
}

async function setParticipants(tx: Tx, activityId: number, classIds?: number[], studentIds?: number[]) {
  if (classIds) {
    const n = await tx.class.count({ where: { id: { in: classIds }, deletedAt: null } });
    if (n !== new Set(classIds).size) throw badRequest('Some selected classes do not exist');
    await tx.activityParticipant.deleteMany({ where: { activityId, classId: { not: null } } });
    await tx.activityParticipant.createMany({
      data: [...new Set(classIds)].map((classId) => ({ activityId, classId })),
    });
  }
  if (studentIds) {
    const n = await tx.student.count({ where: { id: { in: studentIds }, deletedAt: null } });
    if (n !== new Set(studentIds).size) throw badRequest('Some selected students do not exist');
    await tx.activityParticipant.deleteMany({ where: { activityId, studentId: { not: null } } });
    await tx.activityParticipant.createMany({
      data: [...new Set(studentIds)].map((studentId) => ({ activityId, studentId })),
    });
  }
}

export async function create(data: z.infer<typeof s.createBody>, req: Request) {
  const { classIds, studentIds, date, termId, ...fields } = data;
  const term = termId ?? (await termForDate(date))?.id ?? null;
  const created = await prisma.$transaction(async (tx) => {
    const a = await tx.activity.create({
      data: { ...fields, date: toDateOnly(date), termId: term, createdById: req.user?.id },
    });
    await setParticipants(tx, a.id, classIds, studentIds);
    await audit(
      req,
      { action: 'CREATE', entity: 'Activity', entityId: a.id, newValues: { ...a, classIds, studentIds } },
      tx,
    );
    return a;
  });
  return get(created.id);
}

export async function update(id: number, data: z.infer<typeof s.updateBody>, req: Request) {
  const before = await prisma.activity.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw notFound('Activity');
  const { classIds, studentIds, date, ...fields } = data;
  await prisma.$transaction(async (tx) => {
    const after = await tx.activity.update({
      where: { id },
      data: { ...fields, ...(date && { date: toDateOnly(date) }) },
    });
    await setParticipants(tx, id, classIds, studentIds);
    const d = diff(before, after);
    await audit(
      req,
      {
        action: 'UPDATE',
        entity: 'Activity',
        entityId: id,
        oldValues: d.oldValues,
        newValues: { ...d.newValues, classIds, studentIds },
      },
      tx,
    );
  });
  return get(id);
}

export async function complete(id: number, data: z.infer<typeof s.completeBody>, req: Request) {
  const before = await prisma.activity.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw notFound('Activity');
  if (before.status === 'CANCELLED') throw badRequest('A cancelled activity cannot be completed');
  const after = await prisma.activity.update({
    where: { id },
    data: { status: 'COMPLETED', outcome: data.outcome, actualCost: data.actualCost },
  });
  await audit(req, { action: 'UPDATE', entity: 'Activity', entityId: id, ...diff(before, after) });
  return get(id);
}

export async function setStatus(id: number, status: ActivityStatus, req: Request) {
  const before = await prisma.activity.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw notFound('Activity');
  await prisma.activity.update({ where: { id }, data: { status } });
  await audit(req, {
    action: 'STATUS_CHANGE',
    entity: 'Activity',
    entityId: id,
    oldValues: { status: before.status },
    newValues: { status },
  });
  return get(id);
}

export async function remove(id: number, hard: boolean, req: Request) {
  const before = await prisma.activity.findFirst({
    where: { id, deletedAt: hard ? undefined : null },
    include: { photos: true },
  });
  if (!before) throw notFound('Activity');
  if (hard) {
    await prisma.activity.delete({ where: { id } });
    before.photos.forEach((p) => removeUpload(p.url));
  } else {
    await prisma.activity.update({ where: { id }, data: { deletedAt: new Date() } });
  }
  await audit(req, {
    action: 'DELETE',
    entity: 'Activity',
    entityId: id,
    oldValues: before,
    newValues: { hard },
  });
  return { deleted: true };
}

export async function addPhotos(id: number, urls: string[], caption: string | undefined, req: Request) {
  const a = await prisma.activity.findFirst({ where: { id, deletedAt: null } });
  if (!a) {
    urls.forEach(removeUpload);
    throw notFound('Activity');
  }
  await prisma.activityPhoto.createMany({
    data: urls.map((url) => ({ activityId: id, url, caption: caption || null })),
  });
  await audit(req, { action: 'UPDATE', entity: 'Activity', entityId: id, newValues: { photosAdded: urls } });
  return get(id);
}

export async function updatePhoto(id: number, photoId: number, caption: string | null, req: Request) {
  const p = await prisma.activityPhoto.findFirst({ where: { id: photoId, activityId: id } });
  if (!p) throw notFound('Photo');
  const after = await prisma.activityPhoto.update({ where: { id: photoId }, data: { caption } });
  await audit(req, {
    action: 'UPDATE',
    entity: 'ActivityPhoto',
    entityId: photoId,
    oldValues: { caption: p.caption },
    newValues: { caption },
  });
  return after;
}

export async function removePhoto(id: number, photoId: number, req: Request) {
  const p = await prisma.activityPhoto.findFirst({ where: { id: photoId, activityId: id } });
  if (!p) throw notFound('Photo');
  await prisma.activityPhoto.delete({ where: { id: photoId } });
  removeUpload(p.url);
  await audit(req, { action: 'DELETE', entity: 'ActivityPhoto', entityId: photoId, oldValues: p });
  return { deleted: true };
}

/** Single-activity report: details, participants, costs and up to 4 photos. */
export async function activityPdf(id: number): Promise<Buffer> {
  const a = await get(id);
  const settings = await getSettings();
  const doc = createPdf({ size: 'A4', margin: 40, bufferPages: true });
  const left = 40;
  const width = doc.page.width - 80;
  let y = drawLetterhead(
    doc,
    settings,
    a.title,
    `${label(a.category)} · ${formatDate(a.date)} · ${label(a.status)}`,
  );

  const row = (label: string, value: string) => {
    doc.fillColor('#64748B').font('Helvetica').fontSize(9).text(label, left, y, { width: 120 });
    doc
      .fillColor('#0F172A')
      .font('Helvetica-Bold')
      .fontSize(9.5)
      .text(value || '—', left + 125, y, { width: width - 125 });
    y = doc.y + 5;
  };
  const money = (v: unknown) => (v == null ? '—' : formatMoney(Number(v), settings.currency));
  row(t('Time'), [a.startTime, a.endTime].filter(Boolean).join(' – '));
  row(t('Location'), a.location ?? '');
  row(t('Organizer'), a.organizer ?? '');
  row(t('Term'), a.term?.name ?? '');
  row(t('Classes'), a.classes.map((c) => c?.name).join(', '));
  row(t('Individual students'), a.students.map((st) => `${st?.firstName} ${st?.lastName}`).join(', '));
  row(t('Total participants'), String(a.totalParticipants));
  row(t('Budget'), money(a.budget));
  row(t('Actual cost'), money(a.actualCost));
  if (a.budget != null && a.actualCost != null)
    row(t('Variance'), money(Number(a.budget) - Number(a.actualCost)));

  for (const [title, body] of [
    [t('Description'), a.description],
    [t('Outcome & notes'), a.outcome],
  ] as const) {
    if (!body) continue;
    y += 6;
    doc.fillColor('#4F6BED').font('Helvetica-Bold').fontSize(11).text(title, left, y);
    doc
      .fillColor('#1E293B')
      .font('Helvetica')
      .fontSize(9.5)
      .text(body, left, doc.y + 4, { width });
    y = doc.y + 6;
  }

  const photos = a.photos
    .map((p) => publicUrlToPath(p.url))
    .filter((p): p is string => !!p && fs.existsSync(p) && /\.(png|jpe?g)$/i.test(p));
  if (photos.length) {
    if (y > doc.page.height - 220) {
      doc.addPage();
      y = 40;
    }
    doc
      .fillColor('#4F6BED')
      .font('Helvetica-Bold')
      .fontSize(11)
      .text(t('Photos'), left, y + 6);
    y = doc.y + 6;
    const w = (width - 10) / 2;
    photos.slice(0, 4).forEach((p, i) => {
      const x = left + (i % 2) * (w + 10);
      const py = y + Math.floor(i / 2) * 150;
      if (py + 140 > doc.page.height - 40) return;
      try {
        doc.image(p, x, py, { fit: [w, 140], align: 'center', valign: 'center' });
      } catch {
        /* skip unreadable image */
      }
    });
  }
  addPageNumbers(doc);
  return pdfToBuffer(doc);
}
