import { z } from 'zod';
import { paginationQuery } from '../../utils/pagination';
import { ISO_DATE } from '../../utils/dates';
import { msg } from '../../i18n';

const isoDate = z.string().regex(ISO_DATE, 'Use YYYY-MM-DD');
const text = (max: number) => z.string().trim().max(max).nullable().optional();
const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9 ()-]{7,20}$/, msg('Invalid phone number'));
const optionalEmail = z
  .union([z.string().trim().email().max(191), z.literal('')])
  .nullable()
  .optional()
  .transform((v) => v || null);

export const guardianFields = z.object({
  fullName: z.string().trim().min(2).max(150),
  relationship: z.string().trim().min(2).max(40),
  phone,
  altPhone: phone
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  email: optionalEmail,
  occupation: text(100),
  address: text(255),
  nationalId: z
    .string()
    .trim()
    .regex(/^\d{16}$/, msg('Rwandan national ID has 16 digits'))
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  isEmergencyContact: z.boolean().default(false),
  canPickUp: z.boolean().default(true),
});

/** Either links an existing guardian (e.g. for siblings) or creates a new one. */
export const guardianInput = z.union([
  z.object({ existingId: z.number().int().positive(), isPrimary: z.boolean().default(false) }),
  guardianFields.extend({ isPrimary: z.boolean().default(false) }),
]);

const childFields = {
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  gender: z.enum(['MALE', 'FEMALE']),
  dateOfBirth: isoDate,
  nationality: text(60),
  address: text(255),
  previousSchool: text(150),
  admissionDate: isoDate.optional(),
  // Medical
  bloodGroup: z
    .enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'])
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  allergies: text(2000),
  medicalNotes: text(2000),
  specialNeeds: text(2000),
};

export const createStudentBody = z.object({
  ...childFields,
  currentClassId: z.number().int().positive(),
  guardians: z
    .array(guardianInput)
    .min(1, msg('At least one guardian is required'))
    .max(6)
    .refine((g) => g.filter((x) => x.isPrimary).length <= 1, msg('Only one guardian can be primary')),
});

export const updateStudentBody = z
  .object({
    ...childFields,
    currentClassId: z.number().int().positive(),
  })
  .partial();

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

export const listStudentsQuery = paginationQuery.extend({
  classId: z.coerce.number().int().positive().optional(),
  level: z.enum(['NURSERY', 'PRIMARY']).optional(),
  gender: z.enum(['MALE', 'FEMALE']).optional(),
  status: z.enum(['ACTIVE', 'TRANSFERRED', 'GRADUATED', 'WITHDRAWN', 'ALL']).default('ACTIVE'),
  format: z.enum(['json', 'xlsx', 'pdf']).default('json'),
  includeDeleted: bool.optional(),
});

export const statusBody = z.object({
  status: z.enum(['ACTIVE', 'TRANSFERRED', 'GRADUATED', 'WITHDRAWN']),
  reason: z.string().trim().max(255).optional(),
});

export const promoteBody = z.object({
  fromClassId: z.number().int().positive(),
  /** Omit to use the class of the next grade with the same section (or graduate from P2). */
  toClassId: z.number().int().positive().nullable().optional(),
  academicYearId: z.number().int().positive(),
  /** Students to hold back (repeat the year). */
  excludeStudentIds: z.array(z.number().int().positive()).default([]),
});

export const deleteQuery = z.object({ hard: bool.optional() });

export const guardianParams = z.object({
  id: z.coerce.number().int().positive(),
  guardianId: z.coerce.number().int().positive(),
});
export const linkGuardianBody = guardianInput;
export const updateLinkBody = z.object({ isPrimary: z.boolean() });
export const updateGuardianBody = guardianFields.partial();
export const guardianSearchQuery = z.object({ search: z.string().trim().min(2).max(100) });

export const ageQuery = z.object({ dateOfBirth: isoDate });
export const historyQuery = z.object({ from: isoDate.optional(), to: isoDate.optional() });
export const importQuery = z.object({ dryRun: bool.optional() });
