import { z } from 'zod';
import { msg } from '../../i18n';

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

export const updateSettingsBody = z.object({
  name: z.string().trim().min(2).max(150).optional(),
  motto: optionalText(255),
  address: optionalText(255),
  phone: optionalText(30),
  email: z
    .string()
    .trim()
    .email()
    .max(191)
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  website: optionalText(191),
  currency: z.string().trim().min(2).max(10).optional(),
  timezone: z
    .string()
    .trim()
    .refine((tz) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, msg('Unknown timezone'))
    .optional(),
  locale: z.enum(['en', 'fr', 'rw']).optional(),
  admissionPrefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,10}$/)
    .optional(),
  allowWeekendAttendance: z.boolean().optional(),
  chronicAbsenceThreshold: z.number().int().min(1).max(100).optional(),
  loanPeriodDays: z.number().int().min(1).max(90).optional(),
  maxBooksPerStudent: z.number().int().min(1).max(20).optional(),
  overdueFinePerDay: z.number().int().min(0).max(100_000).optional(),
  lostBookFine: z.number().int().min(0).max(1_000_000).optional(),
});
