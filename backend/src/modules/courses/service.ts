import type { Request } from 'express';
import type { z } from 'zod';
import { prisma } from '../../config/prisma';
import { audit, diff } from '../../utils/audit';
import { notFound } from '../../utils/errors';
import type * as s from './schema';

export async function list(q: z.infer<typeof s.listCoursesQuery>) {
  const courses = await prisma.course.findMany({
    where: {
      deletedAt: null,
      // A course with no level is taught at both levels.
      ...(q.level && { OR: [{ level: q.level }, { level: null }] }),
      ...(q.search && { OR: [{ name: { contains: q.search } }, { code: { contains: q.search } }] }),
    },
    orderBy: { name: 'asc' },
    include: {
      assignments: { where: { teacher: { deletedAt: null } }, select: { teacherId: true, classId: true } },
    },
  });
  return courses.map(({ assignments, ...c }) => ({
    ...c,
    teacherCount: new Set(assignments.map((a) => a.teacherId)).size,
    classCount: new Set(assignments.map((a) => a.classId)).size,
  }));
}

async function getCourse(id: number) {
  const c = await prisma.course.findFirst({ where: { id, deletedAt: null } });
  if (!c) throw notFound('Course');
  return c;
}

export async function create(data: z.infer<typeof s.courseBody>, req: Request) {
  const c = await prisma.course.create({ data });
  await audit(req, { action: 'CREATE', entity: 'Course', entityId: c.id, newValues: c });
  return c;
}

export async function update(id: number, data: z.infer<typeof s.courseUpdateBody>, req: Request) {
  const before = await getCourse(id);
  const after = await prisma.course.update({ where: { id }, data });
  await audit(req, { action: 'UPDATE', entity: 'Course', entityId: id, ...diff(before, after) });
  return after;
}

export async function remove(id: number, req: Request) {
  const before = await getCourse(id);
  await prisma.$transaction([
    // Teachers stop teaching a deleted course.
    prisma.teacherAssignment.deleteMany({ where: { courseId: id } }),
    // Free the code so it can be reused.
    prisma.course.update({
      where: { id },
      data: { deletedAt: new Date(), code: `${before.code}-D${id}`.slice(0, 20) },
    }),
  ]);
  await audit(req, { action: 'DELETE', entity: 'Course', entityId: id, oldValues: before });
  return { deleted: true };
}
