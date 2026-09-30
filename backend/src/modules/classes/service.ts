import type { Request } from 'express';
import type { z } from 'zod';
import { prisma } from '../../config/prisma';
import { audit, diff } from '../../utils/audit';
import { conflict, notFound } from '../../utils/errors';
import { GRADE_INFO, GRADE_ORDER } from '../../utils/grades';
import type * as s from './schema';
import { plural, t } from '../../i18n';

export async function list(q: z.infer<typeof s.listClassesQuery>) {
  const classes = await prisma.class.findMany({
    where: { deletedAt: null, level: q.level, grade: q.grade },
    include: { _count: { select: { students: { where: { status: 'ACTIVE', deletedAt: null } } } } },
  });
  const genders = await prisma.student.groupBy({
    by: ['currentClassId', 'gender'],
    where: { status: 'ACTIVE', deletedAt: null },
    _count: true,
  });
  return classes
    .map(({ _count, ...c }) => ({
      ...c,
      studentCount: _count.students,
      boys: genders.find((g) => g.currentClassId === c.id && g.gender === 'MALE')?._count ?? 0,
      girls: genders.find((g) => g.currentClassId === c.id && g.gender === 'FEMALE')?._count ?? 0,
      availableSeats: Math.max(0, c.capacity - _count.students),
    }))
    .sort(
      (a, b) =>
        GRADE_ORDER.indexOf(a.grade) - GRADE_ORDER.indexOf(b.grade) ||
        (a.section ?? '').localeCompare(b.section ?? ''),
    );
}

export async function get(id: number) {
  const c = await prisma.class.findFirst({ where: { id, deletedAt: null } });
  if (!c) throw notFound('Class');
  const students = await prisma.student.findMany({
    where: { currentClassId: id, status: 'ACTIVE', deletedAt: null },
    select: {
      id: true,
      admissionNumber: true,
      firstName: true,
      lastName: true,
      gender: true,
      dateOfBirth: true,
      photo: true,
    },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });
  return {
    ...c,
    studentCount: students.length,
    availableSeats: Math.max(0, c.capacity - students.length),
    students,
  };
}

export async function activeCount(classId: number) {
  return prisma.student.count({ where: { currentClassId: classId, status: 'ACTIVE', deletedAt: null } });
}

export async function create(data: z.infer<typeof s.classBody>, req: Request) {
  const created = await prisma.class.create({
    data: { ...data, level: GRADE_INFO[data.grade].level, createdById: req.user?.id },
  });
  await audit(req, { action: 'CREATE', entity: 'Class', entityId: created.id, newValues: created });
  return created;
}

export async function update(id: number, data: z.infer<typeof s.classUpdateBody>, req: Request) {
  const before = await prisma.class.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw notFound('Class');
  if (data.capacity !== undefined) {
    const count = await activeCount(id);
    if (data.capacity < count)
      throw conflict(t('Capacity cannot be lower than the {count} students currently enrolled', { count }));
  }
  const after = await prisma.class.update({
    where: { id },
    data: { ...data, ...(data.grade && { level: GRADE_INFO[data.grade].level }) },
  });
  await audit(req, { action: 'UPDATE', entity: 'Class', entityId: id, ...diff(before, after) });
  return after;
}

export async function remove(id: number, req: Request) {
  const before = await prisma.class.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw notFound('Class');
  const count = await activeCount(id);
  if (count)
    throw conflict(
      plural(
        count,
        'This class still has {count} active student. Move them first.',
        'This class still has {count} active students. Move them first.',
      ),
    );
  // Clear section so the (grade, section) pair can be reused by a new class.
  await prisma.class.update({
    where: { id },
    data: { deletedAt: new Date(), section: `X${id}`.slice(0, 5) },
  });
  await audit(req, { action: 'DELETE', entity: 'Class', entityId: id, oldValues: before });
  return { deleted: true };
}
