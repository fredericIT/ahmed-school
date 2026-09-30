import { z } from 'zod';
import { paginationQuery } from '../../utils/pagination';
import { passwordSchema } from '../../utils/password';
import { msg, t } from '../../i18n';

/**
 * Teaching posts. The code goes into the registration number:
 * {2-digit year}{post code}{3-digit sequence}, e.g. 26TR001 = first teacher registered in 2026.
 */
export const POSTS = {
  get TR() {
    return t('Teacher');
  },
  get HT() {
    return t('Head teacher');
  },
  get DOS() {
    return t('Director of studies');
  },
  get TA() {
    return t('Teaching assistant');
  },
} as const;
export type PostCode = keyof typeof POSTS;
const postCode = z.enum(Object.keys(POSTS) as [PostCode, ...PostCode[]]);

/** Teachers receive their registration number and activation link on Gmail. */
export const gmail = z
  .string()
  .trim()
  .toLowerCase()
  .email(msg('Enter a valid email address'))
  .refine((e) => e.endsWith('@gmail.com'), msg('Use a Gmail address (…@gmail.com)'));

const assignment = z.object({ courseId: z.number().int().positive(), classId: z.number().int().positive() });
export const assignmentsSchema = z
  .array(assignment)
  .max(60)
  // Drop duplicate course/class pairs.
  .transform((a) => [...new Map(a.map((x) => [`${x.courseId}:${x.classId}`, x])).values()]);

export const createTeacherBody = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: gmail,
  phone: z.string().trim().max(30).nullable().optional(),
  post: postCode.default('TR'),
  assignments: assignmentsSchema.default([]),
});

/** The registration number and post never change after creation (the number is the login id). */
export const updateTeacherBody = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  email: gmail.optional(),
  phone: z.string().trim().max(30).nullable().optional(),
});

export const assignmentsBody = z.object({ assignments: assignmentsSchema });
export const statusBody = z.object({ isActive: z.boolean() });
export const setPasswordBody = z
  .object({ newPassword: passwordSchema, confirmPassword: z.string() })
  .refine((v) => v.newPassword === v.confirmPassword, {
    get message() {
      return t('Passwords do not match');
    },
    path: ['confirmPassword'],
  });

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');
export const listTeachersQuery = paginationQuery.extend({
  isActive: bool.optional(),
  activated: bool.optional(),
  post: postCode.optional(),
  courseId: z.coerce.number().int().positive().optional(),
  classId: z.coerce.number().int().positive().optional(),
});
export const deleteQuery = z.object({ hard: bool.optional() });
