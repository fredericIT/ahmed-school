import { z } from 'zod';
import { ISO_DATE } from '../../utils/dates';
import { msg, t } from '../../i18n';

export const isoDate = z.string().regex(ISO_DATE, 'Use YYYY-MM-DD');

const endAfterStart = {
  get message() {
    return t('End date must be after start date');
  },
  path: ['endDate'],
};

export const yearBody = z
  .object({
    name: z
      .string()
      .trim()
      .regex(/^\d{4}[-–]\d{4}$/, msg('Use a name like 2026-2027')),
    startDate: isoDate,
    endDate: isoDate,
    isCurrent: z.boolean().optional(),
  })
  .refine((v) => v.startDate < v.endDate, endAfterStart);
export const yearUpdateBody = z.object({
  name: z
    .string()
    .trim()
    .regex(/^\d{4}[-–]\d{4}$/)
    .optional(),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
});

export const termBody = z
  .object({
    academicYearId: z.number().int().positive(),
    name: z.string().trim().min(1).max(30),
    startDate: isoDate,
    endDate: isoDate,
    isCurrent: z.boolean().optional(),
  })
  .refine((v) => v.startDate < v.endDate, endAfterStart);
export const termUpdateBody = z.object({
  name: z.string().trim().min(1).max(30).optional(),
  startDate: isoDate.optional(),
  endDate: isoDate.optional(),
});
export const termsQuery = z.object({ academicYearId: z.coerce.number().int().positive().optional() });

export const holidayBody = z.object({ name: z.string().trim().min(1).max(120), date: isoDate });
export const holidaysQuery = z.object({ year: z.coerce.number().int().min(2000).max(2100).optional() });
