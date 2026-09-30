import { z } from 'zod';

export const classBody = z.object({
  name: z.string().trim().min(1).max(60),
  grade: z.enum(['BABY', 'MIDDLE', 'TOP', 'P1', 'P2']),
  section: z.string().trim().toUpperCase().max(5).nullable().optional(),
  capacity: z.number().int().min(1).max(200).default(30),
  classTeacherName: z.string().trim().max(120).nullable().optional(),
  room: z.string().trim().max(40).nullable().optional(),
});
export const classUpdateBody = classBody.partial();

export const listClassesQuery = z.object({
  level: z.enum(['NURSERY', 'PRIMARY']).optional(),
  grade: z.enum(['BABY', 'MIDDLE', 'TOP', 'P1', 'P2']).optional(),
});
