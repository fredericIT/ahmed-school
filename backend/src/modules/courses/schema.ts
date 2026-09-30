import { z } from 'zod';
import { msg } from '../../i18n';

export const courseBody = z.object({
  name: z.string().trim().min(2).max(100),
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{2,20}$/, msg('2–20 letters, digits or dashes')),
  description: z.string().trim().max(255).nullable().optional(),
  /** Null = taught at both nursery and primary level. */
  level: z.enum(['NURSERY', 'PRIMARY']).nullable().optional(),
});
export const courseUpdateBody = courseBody.partial();
export const listCoursesQuery = z.object({
  level: z.enum(['NURSERY', 'PRIMARY']).optional(),
  search: z.string().trim().max(100).optional(),
});
