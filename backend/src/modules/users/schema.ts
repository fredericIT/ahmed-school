import { z } from 'zod';
import { paginationQuery } from '../../utils/pagination';
import { passwordSchema } from '../../utils/password';

export const listUsersQuery = paginationQuery.extend({
  role: z.enum(['SUPER_ADMIN', 'ADMIN']).optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export const createUserBody = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().max(30).nullable().optional(),
  role: z.enum(['SUPER_ADMIN', 'ADMIN']).default('ADMIN'),
  password: passwordSchema,
});

export const updateUserBody = createUserBody.omit({ password: true }).partial();

export const statusBody = z.object({ isActive: z.boolean() });
export const resetPasswordBody = z.object({ newPassword: passwordSchema });
export const deleteQuery = z.object({
  hard: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});
