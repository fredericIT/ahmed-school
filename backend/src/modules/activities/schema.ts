import { z } from 'zod';
import { ISO_DATE } from '../../utils/dates';
import { paginationQuery } from '../../utils/pagination';
import { msg, t } from '../../i18n';

const isoDate = z.string().regex(ISO_DATE, 'Use YYYY-MM-DD');
const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, msg('Use HH:mm'))
  .nullable()
  .optional()
  .or(z.literal('').transform(() => null));
const money = z.number().min(0).max(1_000_000_000).nullable().optional();
export const category = z.enum([
  'SPORTS',
  'TRIP',
  'CELEBRATION',
  'CULTURAL',
  'ACADEMIC',
  'HEALTH',
  'PARENT_MEETING',
  'OTHER',
]);
export const status = z.enum(['PLANNED', 'ONGOING', 'COMPLETED', 'CANCELLED']);

const base = z.object({
  title: z.string().trim().min(2).max(150),
  description: z.string().trim().max(5000).nullable().optional(),
  category,
  date: isoDate,
  startTime: time,
  endTime: time,
  location: z.string().trim().max(150).nullable().optional(),
  organizer: z.string().trim().max(150).nullable().optional(),
  status: status.optional(),
  budget: money,
  actualCost: money,
  outcome: z.string().trim().max(5000).nullable().optional(),
  termId: z.number().int().positive().nullable().optional(),
  classIds: z.array(z.number().int().positive()).max(50).optional(),
  studentIds: z.array(z.number().int().positive()).max(500).optional(),
});

const timesOrdered = (v: { startTime?: string | null; endTime?: string | null }) =>
  !v.startTime || !v.endTime || v.startTime < v.endTime;

export const createBody = base.refine(timesOrdered, {
  get message() {
    return t('End time must be after start time');
  },
  path: ['endTime'],
});
export const updateBody = base.partial().refine(timesOrdered, {
  get message() {
    return t('End time must be after start time');
  },
  path: ['endTime'],
});

export const completeBody = z.object({
  outcome: z.string().trim().min(2).max(5000),
  actualCost: money,
});
export const statusBody = z.object({ status });

export const listQuery = paginationQuery.extend({
  category: category.optional(),
  status: status.optional(),
  termId: z.coerce.number().int().positive().optional(),
  classId: z.coerce.number().int().positive().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  format: z.enum(['json', 'xlsx', 'pdf']).default('json'),
});
export const calendarQuery = z.object({ from: isoDate, to: isoDate });
export const photoParams = z.object({
  id: z.coerce.number().int().positive(),
  photoId: z.coerce.number().int().positive(),
});
export const captionBody = z.object({ caption: z.string().trim().max(255).nullable() });
export const photoUploadBody = z.object({ caption: z.string().trim().max(255).optional() });
export const deleteQuery = z.object({
  hard: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});
