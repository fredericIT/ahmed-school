import { z } from 'zod';
import { ISO_DATE } from '../../utils/dates';
import { paginationQuery } from '../../utils/pagination';
import { msg, t } from '../../i18n';

const isoDate = z.string().regex(ISO_DATE, 'Use YYYY-MM-DD');
const text = (max: number) => z.string().trim().max(max).nullable().optional();
const bool = z.enum(['true', 'false']).transform((v) => v === 'true');
const format = z.enum(['json', 'xlsx', 'pdf']).default('json');
export const copyCondition = z.enum(['NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED']);

export const categoryBody = z.object({ name: z.string().trim().min(2).max(100), description: text(255) });
export const categoryUpdateBody = categoryBody.partial();

export const bookBody = z.object({
  title: z.string().trim().min(1).max(200),
  author: text(150),
  isbn: z
    .string()
    .trim()
    .regex(/^[0-9Xx-]{10,17}$/, msg('Invalid ISBN'))
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  publisher: text(150),
  publishedYear: z.number().int().min(1800).max(2100).nullable().optional(),
  language: text(40),
  ageLevel: text(30),
  categoryId: z.number().int().positive(),
  shelfLocation: text(50),
  /** Number of physical copies to create with the book. */
  copies: z.number().int().min(0).max(200).default(1),
  copyCondition: copyCondition.default('NEW'),
});
export const bookUpdateBody = bookBody.omit({ copies: true, copyCondition: true }).partial();

export const bookListQuery = paginationQuery.extend({
  categoryId: z.coerce.number().int().positive().optional(),
  language: z.string().trim().max(40).optional(),
  ageLevel: z.string().trim().max(30).optional(),
  available: bool.optional(),
  format,
});

export const addCopiesBody = z.object({
  count: z.number().int().min(1).max(200),
  condition: copyCondition.default('NEW'),
});
export const copyUpdateBody = z.object({
  condition: copyCondition.optional(),
  status: z.enum(['AVAILABLE', 'LOST', 'DAMAGED']).optional(),
});
export const copySearchQuery = z.object({
  search: z.string().trim().max(100).optional(),
  available: bool.optional(),
  bookId: z.coerce.number().int().positive().optional(),
});
export const labelsQuery = z.object({
  copyIds: z
    .string()
    .regex(/^\d+(,\d+)*$/)
    .optional(),
});

export const issueBody = z
  .object({
    bookCopyId: z.number().int().positive().optional(),
    copyCode: z.string().trim().toUpperCase().max(20).optional(),
    studentId: z.number().int().positive().optional(),
    borrowerName: z.string().trim().min(2).max(150).optional(),
    dueDate: isoDate.optional(),
    remark: text(255),
  })
  .refine((v) => v.bookCopyId || v.copyCode, {
    get message() {
      return t('Select a copy');
    },
    path: ['bookCopyId'],
  })
  .refine((v) => !!v.studentId !== !!v.borrowerName, {
    get message() {
      return t('Choose either a student or a staff borrower name');
    },
    path: ['studentId'],
  });

export const returnBody = z.object({
  condition: copyCondition.default('GOOD'),
  /** Extra fine (e.g. for damage) on top of any automatic overdue fine. */
  damageFine: z.number().min(0).max(10_000_000).default(0),
  remark: text(255),
});
export const lostBody = z.object({ fine: z.number().min(0).max(10_000_000).optional(), remark: text(255) });
export const finePaidBody = z.object({ finePaid: z.boolean() });

export const loanListQuery = paginationQuery.extend({
  status: z.enum(['BORROWED', 'RETURNED', 'OVERDUE', 'LOST', 'ACTIVE']).optional(),
  studentId: z.coerce.number().int().positive().optional(),
  classId: z.coerce.number().int().positive().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  format,
});

export const reportQuery = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  format,
  limit: z.coerce.number().int().min(1).max(500).default(50),
});
export const deleteQuery = z.object({ hard: bool.optional() });
