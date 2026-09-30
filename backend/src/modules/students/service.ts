import type { Request } from 'express';
import { Prisma, type Gender, type StudentStatus } from '@prisma/client';
import type { z } from 'zod';
import { prisma, type Tx } from '../../config/prisma';
import { audit, diff } from '../../utils/audit';
import { ageInYears, fmtDate, toDateOnly, todayIn } from '../../utils/dates';
import { badRequest, conflict, notFound } from '../../utils/errors';
import { removeUpload } from '../../utils/files';
import { GRADE_INFO, nextGrade, suggestGrade } from '../../utils/grades';
import { orderBy, paged, skipTake } from '../../utils/pagination';
import { getSettings } from '../../utils/settings';
import type * as s from './schema';
import { storedText, t, translateStored } from '../../i18n';

type GuardianInput = z.infer<typeof s.guardianInput>;

// ─── Helpers ───

async function nextAdmissionNumber(tx: Tx, year: number): Promise<string> {
  const { admissionPrefix } = await getSettings();
  const prefix = `${admissionPrefix}-${year}-`;
  const last = await tx.student.findFirst({
    where: { admissionNumber: { startsWith: prefix } },
    orderBy: { admissionNumber: 'desc' },
    select: { admissionNumber: true },
  });
  const seq = last ? parseInt(last.admissionNumber.slice(prefix.length), 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
}

export async function previewAdmissionNumber() {
  const { timezone } = await getSettings();
  return { admissionNumber: await nextAdmissionNumber(prisma, Number(todayIn(timezone).slice(0, 4))) };
}

async function assertClassHasSeat(tx: Tx, classId: number) {
  const cls = await tx.class.findFirst({ where: { id: classId, deletedAt: null } });
  if (!cls) throw badRequest('Selected class does not exist');
  const count = await tx.student.count({
    where: { currentClassId: classId, status: 'ACTIVE', deletedAt: null },
  });
  if (count >= cls.capacity)
    throw conflict(
      t('{className} is full ({count}/{capacity}). Choose another class or raise its capacity.', {
        className: cls.name,
        count,
        capacity: cls.capacity,
      }),
    );
  return cls;
}

async function currentYearId(tx: Tx): Promise<number | null> {
  const y = await tx.academicYear.findFirst({
    where: { isCurrent: true, deletedAt: null },
    select: { id: true },
  });
  return y?.id ?? null;
}

async function linkGuardian(tx: Tx, studentId: number, g: GuardianInput) {
  let guardianId: number;
  if ('existingId' in g) {
    const existing = await tx.guardian.findFirst({ where: { id: g.existingId, deletedAt: null } });
    if (!existing) throw badRequest(t('Guardian #{id} not found', { id: String(g.existingId) }));
    guardianId = existing.id;
  } else {
    const { isPrimary: _p, ...fields } = g;
    guardianId = (await tx.guardian.create({ data: fields })).id;
  }
  if (g.isPrimary) await tx.studentGuardian.updateMany({ where: { studentId }, data: { isPrimary: false } });
  await tx.studentGuardian.upsert({
    where: { studentId_guardianId: { studentId, guardianId } },
    create: { studentId, guardianId, isPrimary: g.isPrimary },
    update: { isPrimary: g.isPrimary },
  });
  return guardianId;
}

const listInclude = {
  currentClass: { select: { id: true, name: true, grade: true, level: true } },
  guardians: {
    where: { isPrimary: true },
    include: { guardian: { select: { id: true, fullName: true, phone: true, relationship: true } } },
  },
} satisfies Prisma.StudentInclude;

// ─── Queries ───

export function buildWhere(q: z.infer<typeof s.listStudentsQuery>): Prisma.StudentWhereInput {
  const where: Prisma.StudentWhereInput = {
    deletedAt: q.includeDeleted ? undefined : null,
    currentClassId: q.classId,
    gender: q.gender,
    status: q.status === 'ALL' ? undefined : q.status,
    ...(q.level && { currentClass: { level: q.level } }),
  };
  if (q.search) {
    const terms = q.search.split(/\s+/).filter(Boolean).slice(0, 3);
    where.AND = terms.map((term) => ({
      OR: [
        { firstName: { contains: term } },
        { lastName: { contains: term } },
        { admissionNumber: { contains: term } },
        {
          guardians: {
            some: { guardian: { OR: [{ fullName: { contains: term } }, { phone: { contains: term } }] } },
          },
        },
      ],
    }));
  }
  return where;
}

export async function list(q: z.infer<typeof s.listStudentsQuery>) {
  const where = buildWhere(q);
  const [rows, total] = await Promise.all([
    prisma.student.findMany({
      where,
      include: listInclude,
      orderBy: orderBy(
        q,
        ['firstName', 'lastName', 'admissionNumber', 'dateOfBirth', 'admissionDate', 'createdAt'] as const,
        'createdAt',
      ),
      ...skipTake(q),
    }),
    prisma.student.count({ where }),
  ]);
  const data = rows.map(({ guardians, ...st }) => ({
    ...st,
    primaryGuardian: guardians[0]?.guardian ?? null,
  }));
  return paged(data, total, q);
}

export async function listAll(q: z.infer<typeof s.listStudentsQuery>) {
  const rows = await prisma.student.findMany({
    where: buildWhere(q),
    include: listInclude,
    orderBy: [{ currentClassId: 'asc' }, { firstName: 'asc' }],
    take: 5000,
  });
  return rows.map(({ guardians, ...st }) => ({ ...st, primaryGuardian: guardians[0]?.guardian ?? null }));
}

export async function get(id: number) {
  const student = await prisma.student.findFirst({
    where: { id, deletedAt: null },
    include: {
      currentClass: true,
      guardians: { include: { guardian: true }, orderBy: { isPrimary: 'desc' } },
      enrollments: { include: { class: true, academicYear: true }, orderBy: { enrolledAt: 'desc' } },
    },
  });
  if (!student) throw notFound('Student');
  const { timezone } = await getSettings();
  const [attendance, activeLoans, activities] = await Promise.all([
    prisma.attendance.groupBy({ by: ['status'], where: { studentId: id }, _count: true }),
    prisma.bookLoan.count({ where: { studentId: id, status: { in: ['BORROWED', 'OVERDUE'] } } }),
    prisma.activityParticipant.count({
      where: {
        OR: [{ studentId: id }, ...(student.currentClassId ? [{ classId: student.currentClassId }] : [])],
        activity: { deletedAt: null },
      },
    }),
  ]);
  const totalDays = attendance.reduce((a, r) => a + r._count, 0);
  const attended = attendance
    .filter((r) => r.status === 'PRESENT' || r.status === 'LATE')
    .reduce((a, r) => a + r._count, 0);
  return {
    ...student,
    // Notes are stored in English ("Promoted from P1 A") and shown in the reader's language.
    enrollments: student.enrollments.map((e) => ({ ...e, note: e.note && translateStored(e.note) })),
    guardians: student.guardians.map((sg) => ({ ...sg.guardian, isPrimary: sg.isPrimary })),
    age: ageInYears(student.dateOfBirth, todayIn(timezone)),
    stats: {
      attendanceRate: totalDays ? Math.round((attended / totalDays) * 1000) / 10 : null,
      daysRecorded: totalDays,
      byStatus: Object.fromEntries(attendance.map((r) => [r.status, r._count])),
      activeLoans,
      activities,
    },
  };
}

export async function ageSuggestion(dateOfBirth: string) {
  const { timezone } = await getSettings();
  const age = ageInYears(toDateOnly(dateOfBirth), todayIn(timezone));
  const grade = suggestGrade(age);
  const classes = await prisma.class.findMany({
    where: { grade, deletedAt: null },
    select: { id: true, name: true },
  });
  return { age, grade, gradeLabel: GRADE_INFO[grade].label, classes };
}

// ─── Mutations ───

export async function create(data: z.infer<typeof s.createStudentBody>, req: Request) {
  const { timezone } = await getSettings();
  const admissionDate = data.admissionDate ?? todayIn(timezone);
  const { guardians, dateOfBirth, admissionDate: _ad, ...fields } = data;
  if (dateOfBirth >= admissionDate) throw badRequest('Date of birth must be before the admission date');

  // Admission numbers are sequential; retry if two registrations race for the same number.
  for (let attempt = 0; ; attempt++) {
    try {
      const student = await prisma.$transaction(async (tx) => {
        await assertClassHasSeat(tx, data.currentClassId);
        const admissionNumber = await nextAdmissionNumber(tx, Number(admissionDate.slice(0, 4)));
        const created = await tx.student.create({
          data: {
            ...fields,
            admissionNumber,
            dateOfBirth: toDateOnly(dateOfBirth),
            admissionDate: toDateOnly(admissionDate),
            createdById: req.user?.id,
          },
        });
        const hasPrimary = guardians.some((g) => g.isPrimary);
        for (const [i, g] of guardians.entries()) {
          await linkGuardian(tx, created.id, { ...g, isPrimary: g.isPrimary || (!hasPrimary && i === 0) });
        }
        const yearId = await currentYearId(tx);
        if (yearId)
          await tx.enrollment.create({
            data: {
              studentId: created.id,
              classId: data.currentClassId,
              academicYearId: yearId,
              note: storedText('Admission'),
            },
          });
        await audit(
          req,
          { action: 'CREATE', entity: 'Student', entityId: created.id, newValues: { ...created, guardians } },
          tx,
        );
        return created;
      });
      return get(student.id);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002' && attempt < 3)
        continue;
      throw err;
    }
  }
}

export async function update(id: number, data: z.infer<typeof s.updateStudentBody>, req: Request) {
  const before = await prisma.student.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw notFound('Student');
  const { dateOfBirth, admissionDate, ...rest } = data;
  const after = await prisma.$transaction(async (tx) => {
    const classChanged = data.currentClassId !== undefined && data.currentClassId !== before.currentClassId;
    if (classChanged) await assertClassHasSeat(tx, data.currentClassId as number);
    const updated = await tx.student.update({
      where: { id },
      data: {
        ...rest,
        ...(dateOfBirth && { dateOfBirth: toDateOnly(dateOfBirth) }),
        ...(admissionDate && { admissionDate: toDateOnly(admissionDate) }),
      },
    });
    if (classChanged) {
      const yearId = await currentYearId(tx);
      if (yearId)
        await tx.enrollment.create({
          data: {
            studentId: id,
            classId: data.currentClassId as number,
            academicYearId: yearId,
            note: storedText('Class change'),
          },
        });
    }
    await audit(req, { action: 'UPDATE', entity: 'Student', entityId: id, ...diff(before, updated) }, tx);
    return updated;
  });
  return after;
}

export async function setPhoto(id: number, url: string, req: Request) {
  const before = await prisma.student.findFirst({ where: { id, deletedAt: null } });
  if (!before) {
    removeUpload(url);
    throw notFound('Student');
  }
  const after = await prisma.student.update({ where: { id }, data: { photo: url } });
  removeUpload(before.photo);
  await audit(req, {
    action: 'UPDATE',
    entity: 'Student',
    entityId: id,
    oldValues: { photo: before.photo },
    newValues: { photo: url },
  });
  return after;
}

export async function setStatus(id: number, status: StudentStatus, reason: string | undefined, req: Request) {
  const before = await prisma.student.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw notFound('Student');
  if (status === 'ACTIVE' && before.status !== 'ACTIVE' && before.currentClassId)
    await assertClassHasSeat(prisma, before.currentClassId);
  const after = await prisma.student.update({
    where: { id },
    data: { status, statusReason: reason ?? null },
  });
  await audit(req, {
    action: 'STATUS_CHANGE',
    entity: 'Student',
    entityId: id,
    oldValues: { status: before.status },
    newValues: { status, reason },
  });
  return after;
}

export async function remove(id: number, hard: boolean, req: Request) {
  const before = await prisma.student.findFirst({ where: { id, deletedAt: hard ? undefined : null } });
  if (!before) throw notFound('Student');
  if (hard) {
    const openLoans = await prisma.bookLoan.count({
      where: { studentId: id, status: { in: ['BORROWED', 'OVERDUE'] } },
    });
    if (openLoans) throw conflict('This student has books on loan. Return them first.');
    await prisma.$transaction(async (tx) => {
      await tx.bookLoan.updateMany({
        where: { studentId: id },
        data: { studentId: null, borrowerName: `${before.firstName} ${before.lastName} (deleted)` },
      });
      await tx.student.delete({ where: { id } });
      await audit(
        req,
        { action: 'DELETE', entity: 'Student', entityId: id, oldValues: before, newValues: { hard: true } },
        tx,
      );
    });
  } else {
    await prisma.student.update({ where: { id }, data: { deletedAt: new Date() } });
    await audit(req, {
      action: 'DELETE',
      entity: 'Student',
      entityId: id,
      oldValues: before,
      newValues: { hard: false },
    });
  }
  return { deleted: true };
}

export async function restore(id: number, req: Request) {
  const before = await prisma.student.findFirst({ where: { id, deletedAt: { not: null } } });
  if (!before) throw notFound('Deleted student');
  const after = await prisma.student.update({ where: { id }, data: { deletedAt: null } });
  await audit(req, { action: 'RESTORE', entity: 'Student', entityId: id });
  return after;
}

/** Moves a whole class up one grade (or graduates P2), recording the new enrolment year. */
export async function promote(data: z.infer<typeof s.promoteBody>, req: Request) {
  const from = await prisma.class.findFirst({ where: { id: data.fromClassId, deletedAt: null } });
  if (!from) throw notFound('Class');
  const year = await prisma.academicYear.findFirst({ where: { id: data.academicYearId, deletedAt: null } });
  if (!year) throw notFound('Academic year');

  const target = nextGrade(from.grade);
  let to = null as Awaited<ReturnType<typeof prisma.class.findFirst>>;
  if (target) {
    to = data.toClassId
      ? await prisma.class.findFirst({ where: { id: data.toClassId, deletedAt: null } })
      : ((await prisma.class.findFirst({
          where: { grade: target, section: from.section, deletedAt: null },
        })) ?? (await prisma.class.findFirst({ where: { grade: target, deletedAt: null } })));
    if (!to)
      throw badRequest(t('No {grade} class exists to promote into', { grade: GRADE_INFO[target].label }));
    if (to.id === from.id) throw badRequest('Target class must be different from the source class');
  }

  const students = await prisma.student.findMany({
    where: {
      currentClassId: from.id,
      status: 'ACTIVE',
      deletedAt: null,
      id: { notIn: data.excludeStudentIds },
    },
    select: { id: true },
  });
  if (!students.length) throw badRequest('No active students to promote in this class');

  if (to) {
    const occupied = await prisma.student.count({
      where: { currentClassId: to.id, status: 'ACTIVE', deletedAt: null },
    });
    if (occupied + students.length > to.capacity)
      throw conflict(
        t('{className} can only take {free} more students ({count} to promote)', {
          className: to.name,
          free: to.capacity - occupied,
          count: students.length,
        }),
      );
  }

  const ids = students.map((st) => st.id);
  await prisma.$transaction(async (tx) => {
    if (to) {
      await tx.student.updateMany({ where: { id: { in: ids } }, data: { currentClassId: to.id } });
      await tx.enrollment.createMany({
        data: ids.map((studentId) => ({
          studentId,
          classId: (to as { id: number }).id,
          academicYearId: year.id,
          note: storedText('Promoted from {className}', { className: from.name }),
        })),
      });
    } else {
      await tx.student.updateMany({
        where: { id: { in: ids } },
        data: { status: 'GRADUATED', statusReason: `Graduated ${year.name}` },
      });
    }
    await audit(
      req,
      {
        action: 'PROMOTE',
        entity: 'Class',
        entityId: from.id,
        newValues: { to: to?.name ?? 'GRADUATED', year: year.name, studentIds: ids },
      },
      tx,
    );
  });
  return { promoted: ids.length, to: to ? { id: to.id, name: to.name } : null, graduated: !to };
}

// ─── Guardians ───

export async function addGuardian(studentId: number, g: GuardianInput, req: Request) {
  const st = await prisma.student.findFirst({ where: { id: studentId, deletedAt: null } });
  if (!st) throw notFound('Student');
  const guardianId = await prisma.$transaction((tx) => linkGuardian(tx, studentId, g));
  await audit(req, {
    action: 'UPDATE',
    entity: 'Student',
    entityId: studentId,
    newValues: { guardianAdded: guardianId },
  });
  return get(studentId);
}

export async function updateLink(studentId: number, guardianId: number, isPrimary: boolean, req: Request) {
  const link = await prisma.studentGuardian.findUnique({
    where: { studentId_guardianId: { studentId, guardianId } },
  });
  if (!link) throw notFound('Guardian link');
  await prisma.$transaction(async (tx) => {
    if (isPrimary) await tx.studentGuardian.updateMany({ where: { studentId }, data: { isPrimary: false } });
    await tx.studentGuardian.update({
      where: { studentId_guardianId: { studentId, guardianId } },
      data: { isPrimary },
    });
  });
  await audit(req, {
    action: 'UPDATE',
    entity: 'Student',
    entityId: studentId,
    newValues: { primaryGuardian: guardianId },
  });
  return get(studentId);
}

export async function removeGuardian(studentId: number, guardianId: number, req: Request) {
  const links = await prisma.studentGuardian.findMany({ where: { studentId } });
  if (!links.some((l) => l.guardianId === guardianId)) throw notFound('Guardian link');
  if (links.length <= 1) throw badRequest('A student must have at least one guardian');
  await prisma.studentGuardian.delete({ where: { studentId_guardianId: { studentId, guardianId } } });
  await audit(req, {
    action: 'UPDATE',
    entity: 'Student',
    entityId: studentId,
    newValues: { guardianRemoved: guardianId },
  });
  return get(studentId);
}

export function searchGuardians(search: string) {
  return prisma.guardian.findMany({
    where: {
      deletedAt: null,
      OR: [
        { fullName: { contains: search } },
        { phone: { contains: search } },
        { nationalId: { contains: search } },
      ],
    },
    include: {
      students: { include: { student: { select: { id: true, firstName: true, lastName: true } } } },
    },
    take: 10,
  });
}

export async function updateGuardian(id: number, data: z.infer<typeof s.updateGuardianBody>, req: Request) {
  const before = await prisma.guardian.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw notFound('Guardian');
  const after = await prisma.guardian.update({ where: { id }, data });
  await audit(req, { action: 'UPDATE', entity: 'Guardian', entityId: id, ...diff(before, after) });
  return after;
}

// ─── History tabs ───

export async function activities(studentId: number) {
  const st = await prisma.student.findFirst({ where: { id: studentId }, select: { currentClassId: true } });
  if (!st) throw notFound('Student');
  return prisma.activity.findMany({
    where: {
      deletedAt: null,
      participants: {
        some: { OR: [{ studentId }, ...(st.currentClassId ? [{ classId: st.currentClassId }] : [])] },
      },
    },
    orderBy: { date: 'desc' },
    select: { id: true, title: true, category: true, date: true, status: true, location: true },
  });
}

export function loans(studentId: number) {
  return prisma.bookLoan.findMany({
    where: { studentId },
    orderBy: { issuedAt: 'desc' },
    include: {
      bookCopy: { include: { book: { select: { id: true, title: true, author: true, coverImage: true } } } },
    },
  });
}

// ─── Export rows ───

export function toExportRow(st: Awaited<ReturnType<typeof listAll>>[number]) {
  return {
    admissionNumber: st.admissionNumber,
    name: `${st.firstName} ${st.lastName}`,
    gender: st.gender === 'MALE' ? t('Boy') : t('Girl'),
    dateOfBirth: fmtDate(st.dateOfBirth),
    class: st.currentClass?.name ?? '',
    status: st.status,
    guardian: st.primaryGuardian?.fullName ?? '',
    phone: st.primaryGuardian?.phone ?? '',
    admissionDate: fmtDate(st.admissionDate),
  };
}

export type { Gender };
