import { z } from 'zod';
import { ISO_DATE } from '../../utils/dates';
import { msg } from '../../i18n';

const isoDate = z.string().regex(ISO_DATE, 'Use YYYY-MM-DD');
const status = z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED', 'SICK']);

export const sheetQuery = z.object({ classId: z.coerce.number().int().positive(), date: isoDate });

export const saveSheetBody = z.object({
  classId: z.number().int().positive(),
  date: isoDate,
  records: z
    .array(
      z.object({
        studentId: z.number().int().positive(),
        status,
        arrivalTime: z
          .string()
          .regex(/^([01]\d|2[0-3]):[0-5]\d$/, msg('Use HH:mm'))
          .nullable()
          .optional()
          .or(z.literal('').transform(() => null)),
        pickedUpBy: z.string().trim().max(150).nullable().optional(),
        remark: z.string().trim().max(255).nullable().optional(),
      }),
    )
    .min(1)
    .max(300),
});

export const monthlyQuery = z.object({
  classId: z.coerce.number().int().positive(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM'),
});

export const historyQuery = z.object({ from: isoDate.optional(), to: isoDate.optional() });

export const reportQuery = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  termId: z.coerce.number().int().positive().optional(),
  classId: z.coerce.number().int().positive().optional(),
  threshold: z.coerce.number().min(1).max(100).optional(),
  format: z.enum(['json', 'xlsx', 'pdf']).default('json'),
});
