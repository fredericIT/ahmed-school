import { z } from 'zod';

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(20),
  search: z.string().trim().max(100).optional(),
  sortBy: z.string().max(40).optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
export type PaginationQuery = z.infer<typeof paginationQuery>;

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export class Paged<T> {
  constructor(
    public data: T[],
    public meta: PageMeta,
  ) {}
}

export function paged<T>(data: T[], total: number, q: { page: number; pageSize: number }): Paged<T> {
  return new Paged(data, {
    page: q.page,
    pageSize: q.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
  });
}

export function skipTake(q: { page: number; pageSize: number }) {
  return { skip: (q.page - 1) * q.pageSize, take: q.pageSize };
}

/** Builds a Prisma orderBy from an allow-list, falling back to a default field. */
export function orderBy<F extends string>(
  q: { sortBy?: string; sortOrder: 'asc' | 'desc' },
  allowed: readonly F[],
  fallback: F,
): Record<F, 'asc' | 'desc'> {
  const field = (allowed as readonly string[]).includes(q.sortBy ?? '') ? (q.sortBy as F) : fallback;
  return { [field]: q.sortOrder } as Record<F, 'asc' | 'desc'>;
}
