import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { ISO_DATE, addDays, toDateOnly } from '../../utils/dates';
import { notFound } from '../../utils/errors';
import { paged, paginationQuery, skipTake } from '../../utils/pagination';
import { ApiRouter, idParams, type Ctx } from '../../utils/router';

// Small read-only module: schema, controller and service live together.
const actions = [
  'CREATE',
  'UPDATE',
  'DELETE',
  'RESTORE',
  'LOGIN',
  'LOGOUT',
  'LOGIN_FAILED',
  'PASSWORD_CHANGE',
  'PASSWORD_RESET',
  'STATUS_CHANGE',
  'PROMOTE',
  'IMPORT',
  'STOCK_MOVEMENT',
  'ISSUE',
  'RETURN',
] as const;

const listQuery = paginationQuery.extend({
  action: z.enum(actions).optional(),
  entity: z.string().trim().max(60).optional(),
  entityId: z.string().trim().max(40).optional(),
  userId: z.coerce.number().int().positive().optional(),
  from: z.string().regex(ISO_DATE).optional(),
  to: z.string().regex(ISO_DATE).optional(),
});

const userSelect = { select: { id: true, firstName: true, lastName: true, email: true, role: true } };

async function list({ query: q }: Ctx<{ query: typeof listQuery }>) {
  const where: Prisma.AuditLogWhereInput = {
    action: q.action,
    entity: q.entity,
    entityId: q.entityId,
    userId: q.userId,
    createdAt:
      q.from || q.to
        ? {
            gte: q.from ? toDateOnly(q.from) : undefined,
            lt: q.to ? toDateOnly(addDays(q.to, 1)) : undefined,
          }
        : undefined,
    ...(q.search && {
      OR: [
        { entity: { contains: q.search } },
        { entityId: { contains: q.search } },
        { ip: { contains: q.search } },
      ],
    }),
  };
  const [data, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      include: { user: userSelect },
      orderBy: { createdAt: q.sortOrder },
      ...skipTake(q),
    }),
    prisma.auditLog.count({ where }),
  ]);
  return paged(data, total, q);
}

async function get({ params }: Ctx<{ params: typeof idParams }>) {
  const log = await prisma.auditLog.findUnique({ where: { id: params.id }, include: { user: userSelect } });
  if (!log) throw notFound('Audit log');
  return log;
}

async function filters() {
  const [entities, users] = await Promise.all([
    prisma.auditLog.findMany({ distinct: ['entity'], select: { entity: true }, orderBy: { entity: 'asc' } }),
    prisma.user.findMany({
      select: { id: true, firstName: true, lastName: true },
      orderBy: { firstName: 'asc' },
    }),
  ]);
  return { entities: entities.map((r) => r.entity), actions, users };
}

const SA = ['SUPER_ADMIN' as const];
const r = new ApiRouter('/audit-logs', 'Audit logs');
r.get('/', { summary: 'Search the audit trail', roles: SA, schemas: { query: listQuery } }, list);
r.get('/filters', { summary: 'Distinct entities, actions and users for filters', roles: SA }, filters);
r.get(
  '/:id',
  { summary: 'Audit entry with before/after values', roles: SA, schemas: { params: idParams } },
  get,
);

export default r;
