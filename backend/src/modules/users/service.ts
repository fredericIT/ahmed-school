import type { Prisma, Role } from '@prisma/client';
import type { Request } from 'express';
import type { z } from 'zod';
import { prisma } from '../../config/prisma';
import { audit, diff } from '../../utils/audit';
import { badRequest, conflict, notFound } from '../../utils/errors';
import { orderBy, paged, skipTake } from '../../utils/pagination';
import { hashPassword } from '../../utils/password';
import { publicUserSelect } from '../auth/service';
import type * as s from './schema';

export async function list(q: z.infer<typeof s.listUsersQuery>) {
  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    // Teachers are managed on the Teachers page.
    role: q.role ?? { in: ['SUPER_ADMIN', 'ADMIN'] },
    isActive: q.isActive,
    ...(q.search && {
      OR: [
        { firstName: { contains: q.search } },
        { lastName: { contains: q.search } },
        { email: { contains: q.search } },
      ],
    }),
  };
  const [data, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: publicUserSelect,
      orderBy: orderBy(
        q,
        ['firstName', 'lastName', 'email', 'createdAt', 'lastLoginAt', 'role'] as const,
        'createdAt',
      ),
      ...skipTake(q),
    }),
    prisma.user.count({ where }),
  ]);
  return paged(data, total, q);
}

export async function get(id: number) {
  const user = await prisma.user.findFirst({
    where: { id, deletedAt: null, role: { not: 'TEACHER' } },
    select: publicUserSelect,
  });
  if (!user) throw notFound('User');
  return user;
}

export async function create(data: z.infer<typeof s.createUserBody>, req: Request) {
  const exists = await prisma.user.findUnique({ where: { email: data.email } });
  if (exists) throw conflict('A user with this email already exists');
  const { password, ...rest } = data;
  const user = await prisma.user.create({
    data: { ...rest, passwordHash: await hashPassword(password) },
    select: publicUserSelect,
  });
  await audit(req, { action: 'CREATE', entity: 'User', entityId: user.id, newValues: user });
  return user;
}

/** Guards against leaving the school without an active super admin. */
async function assertAnotherSuperAdmin(excludeId: number) {
  const others = await prisma.user.count({
    where: { role: 'SUPER_ADMIN', isActive: true, deletedAt: null, id: { not: excludeId } },
  });
  if (others === 0) throw badRequest('There must always be at least one active super admin');
}

export async function update(id: number, data: z.infer<typeof s.updateUserBody>, req: Request) {
  const before = await get(id);
  if (data.role && data.role !== before.role) {
    if (id === req.user?.id) throw badRequest('You cannot change your own role');
    if (before.role === 'SUPER_ADMIN') await assertAnotherSuperAdmin(id);
  }
  if (data.email && data.email !== before.email) {
    const taken = await prisma.user.findUnique({ where: { email: data.email } });
    if (taken) throw conflict('A user with this email already exists');
  }
  const after = await prisma.user.update({ where: { id }, data, select: publicUserSelect });
  await audit(req, { action: 'UPDATE', entity: 'User', entityId: id, ...diff(before, after) });
  return after;
}

export async function setStatus(id: number, isActive: boolean, req: Request) {
  const before = await get(id);
  if (!isActive) {
    if (id === req.user?.id) throw badRequest('You cannot deactivate your own account');
    if (before.role === 'SUPER_ADMIN') await assertAnotherSuperAdmin(id);
  }
  const after = await prisma.user.update({ where: { id }, data: { isActive }, select: publicUserSelect });
  if (!isActive)
    await prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  await audit(req, {
    action: 'STATUS_CHANGE',
    entity: 'User',
    entityId: id,
    oldValues: { isActive: before.isActive },
    newValues: { isActive },
  });
  return after;
}

export async function resetPassword(id: number, newPassword: string, req: Request) {
  await get(id);
  await prisma.user.update({
    where: { id },
    data: {
      passwordHash: await hashPassword(newPassword),
      passwordChangedAt: new Date(),
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });
  await prisma.refreshToken.updateMany({
    where: { userId: id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await audit(req, { action: 'PASSWORD_RESET', entity: 'User', entityId: id, newValues: { byAdmin: true } });
  return { reset: true };
}

export async function remove(id: number, hard: boolean, req: Request) {
  const before = await get(id);
  if (id === req.user?.id) throw badRequest('You cannot delete your own account');
  if (before.role === 'SUPER_ADMIN') await assertAnotherSuperAdmin(id);
  if (hard) {
    await prisma.user.delete({ where: { id } });
  } else {
    // Free up the email so it can be reused by a new account.
    await prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false, email: `deleted-${id}-${Date.now()}@deleted.local` },
    });
    await prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  await audit(req, {
    action: 'DELETE',
    entity: 'User',
    entityId: id,
    oldValues: before,
    newValues: { hard },
  });
  return { deleted: true };
}

export type { Role };
