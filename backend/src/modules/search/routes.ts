import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { ApiRouter, type Ctx } from '../../utils/router';

const searchQuery = z.object({ q: z.string().trim().min(2).max(100) });

/** Global search for the top bar: students, guardians, books, inventory items and activities. */
async function search({ query }: Ctx<{ query: typeof searchQuery }>) {
  const q = query.q;
  const [students, books, items, activities] = await Promise.all([
    prisma.student.findMany({
      where: {
        deletedAt: null,
        OR: [
          { firstName: { contains: q } },
          { lastName: { contains: q } },
          { admissionNumber: { contains: q } },
          {
            guardians: {
              some: { guardian: { OR: [{ fullName: { contains: q } }, { phone: { contains: q } }] } },
            },
          },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        admissionNumber: true,
        photo: true,
        status: true,
        currentClass: { select: { name: true } },
      },
      take: 6,
    }),
    prisma.book.findMany({
      where: {
        deletedAt: null,
        OR: [{ title: { contains: q } }, { author: { contains: q } }, { isbn: { contains: q } }],
      },
      select: { id: true, title: true, author: true, coverImage: true, availableCopies: true },
      take: 5,
    }),
    prisma.inventoryItem.findMany({
      where: { deletedAt: null, OR: [{ name: { contains: q } }, { sku: { contains: q } }] },
      select: { id: true, name: true, sku: true, quantity: true, unit: true },
      take: 5,
    }),
    prisma.activity.findMany({
      where: { deletedAt: null, title: { contains: q } },
      select: { id: true, title: true, date: true, category: true },
      orderBy: { date: 'desc' },
      take: 5,
    }),
  ]);
  return { students, books, items, activities };
}

const r = new ApiRouter('/search', 'Search');
r.get('/', { summary: 'Global search across modules', schemas: { query: searchQuery } }, search);

export default r;
