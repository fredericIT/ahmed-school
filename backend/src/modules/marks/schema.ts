import { z } from 'zod';
import { ISO_DATE } from '../../utils/dates';

export const ASSESSMENT_TYPES = ['CLASSWORK', 'HOMEWORK', 'QUIZ', 'TEST', 'PROJECT', 'EXAM'] as const;

const id = z.coerce.number().int().positive();
const format = z.enum(['json', 'xlsx', 'pdf']).optional();

export const assessmentsQuery = z.object({ termId: id, classId: id, courseId: id });

export const assessmentBody = z.object({
  termId: id,
  classId: id,
  courseId: id,
  title: z.string().trim().min(2).max(120),
  type: z.enum(ASSESSMENT_TYPES),
  date: z.string().regex(ISO_DATE, 'Use YYYY-MM-DD'),
  maxScore: z.coerce.number().positive().max(1000),
  description: z.string().trim().max(255).nullable().optional(),
});
// The class, course and term of an assessment are fixed once created.
export const assessmentUpdateBody = assessmentBody
  .omit({ termId: true, classId: true, courseId: true })
  .partial();

export const marksBody = z.object({
  marks: z
    .array(
      z.object({
        studentId: id,
        /** Null with `absent: false` clears the mark. */
        score: z.coerce.number().min(0).max(1000).nullable(),
        absent: z.boolean().default(false),
        remark: z.string().trim().max(255).nullable().optional(),
      }),
    )
    .max(200),
});

export const courseResultsQuery = z.object({ termId: id, classId: id, courseId: id, format });
export const classResultsQuery = z.object({ termId: id, classId: id, format });
export const reportCardsQuery = z.object({ termId: id, classId: id, studentId: id.optional() });

export const overviewQuery = z.object({ termId: id.optional() });
