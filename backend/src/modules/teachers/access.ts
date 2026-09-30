import { prisma } from '../../config/prisma';
import type { AuthUser } from '../../types/express';
import { forbidden } from '../../utils/errors';

/** Classes a teacher is assigned to (through any course). */
export async function teacherClassIds(teacherId: number): Promise<number[]> {
  const rows = await prisma.teacherAssignment.findMany({
    where: { teacherId, class: { deletedAt: null }, course: { deletedAt: null } },
    select: { classId: true },
    distinct: ['classId'],
  });
  return rows.map((r) => r.classId);
}

/** Administrators pass; teachers must be assigned to the class. */
export async function assertCanUseClass(user: AuthUser, classId: number): Promise<void> {
  if (user.role !== 'TEACHER') return;
  const ids = await teacherClassIds(user.id);
  if (!ids.includes(classId)) throw forbidden('You are not assigned to this class');
}
