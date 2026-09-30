import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { notFound } from '../../utils/errors';
import { paged, paginationQuery, skipTake } from '../../utils/pagination';
import { ApiRouter, idParams, type Ctx } from '../../utils/router';
import { translateStored } from '../../i18n';

// Small module: schema, controller and service live together.
const listQuery = paginationQuery.extend({
  unread: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

async function list({ query, user }: Ctx<{ query: typeof listQuery }>) {
  const where = { userId: user.id, ...(query.unread && { isRead: false }) };
  const [data, total, unread] = await Promise.all([
    prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, ...skipTake(query) }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId: user.id, isRead: false } }),
  ]);
  // Stored in English; each reader sees them in their language.
  const translated = data.map((n) => ({
    ...n,
    title: translateStored(n.title),
    message: translateStored(n.message),
  }));
  const p = paged(translated, total, query);
  return Object.assign(p, { meta: { ...p.meta, unread } });
}

async function unreadCount({ user }: Ctx<object>) {
  return { unread: await prisma.notification.count({ where: { userId: user.id, isRead: false } }) };
}

async function markRead({ params, user }: Ctx<{ params: typeof idParams }>) {
  const res = await prisma.notification.updateMany({
    where: { id: params.id, userId: user.id },
    data: { isRead: true },
  });
  if (!res.count) throw notFound('Notification');
  return { read: true };
}

async function markAllRead({ user }: Ctx<object>) {
  const res = await prisma.notification.updateMany({
    where: { userId: user.id, isRead: false },
    data: { isRead: true },
  });
  return { updated: res.count };
}

async function remove({ params, user }: Ctx<{ params: typeof idParams }>) {
  const res = await prisma.notification.deleteMany({ where: { id: params.id, userId: user.id } });
  if (!res.count) throw notFound('Notification');
  return { deleted: true };
}

const r = new ApiRouter('/notifications', 'Notifications');
r.get('/', { teachers: true, summary: 'My notifications', schemas: { query: listQuery } }, list);
r.get('/unread-count', { teachers: true, summary: 'Unread notification count' }, unreadCount);
r.patch(
  '/:id/read',
  { teachers: true, summary: 'Mark one as read', schemas: { params: idParams } },
  markRead,
);
r.post('/read-all', { teachers: true, summary: 'Mark all as read' }, markAllRead);
r.delete(
  '/:id',
  { teachers: true, summary: 'Dismiss a notification', schemas: { params: idParams } },
  remove,
);

export default r;
