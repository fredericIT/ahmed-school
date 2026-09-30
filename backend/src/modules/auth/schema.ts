import { z } from 'zod';
import { passwordSchema } from '../../utils/password';
import { t } from '../../i18n';

/** Staff sign in with their email; teachers with their registration number (e.g. 26TR001). */
export const loginBody = z
  .object({
    identifier: z.string().trim().min(3).max(191).optional(),
    email: z.string().trim().max(191).optional(), // kept for older clients
    password: z.string().min(1).max(100),
  })
  .refine((v) => v.identifier || v.email, {
    get message() {
      return t('Enter your email or registration number');
    },
    path: ['identifier'],
  })
  .transform((v) => ({ identifier: (v.identifier ?? v.email ?? '').trim(), password: v.password }));

export const changePasswordBody = z
  .object({ currentPassword: z.string().min(1), newPassword: passwordSchema })
  .refine((v) => v.currentPassword !== v.newPassword, {
    get message() {
      return t('New password must differ from the current one');
    },
    path: ['newPassword'],
  });

export const forgotPasswordBody = z.object({ email: z.string().trim().toLowerCase().email() });

export const resetPasswordBody = z.object({
  token: z.string().min(20).max(200),
  newPassword: passwordSchema,
});

export const updateProfileBody = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
});

/** Keys of the dashboard widgets a user can choose to track (mirrors the frontend registry). */
export const DASHBOARD_WIDGETS = [
  'quickActions',
  'kpi.students',
  'kpi.attendance',
  'kpi.activities',
  'kpi.library',
  'alerts',
  'chart.attendanceTrend',
  'chart.gender',
  'chart.studentsPerClass',
  'chart.stock',
  'chart.loans',
  'list.absentees',
  'list.upcoming',
  'list.registrations',
  'list.lowStock',
  'list.overdue',
] as const;

export const preferencesBody = z.object({
  /** null resets to the default (all widgets). */
  dashboardWidgets: z
    .array(z.enum(DASHBOARD_WIDGETS))
    .max(DASHBOARD_WIDGETS.length)
    .transform((a) => [...new Set(a)])
    .nullable(),
});

export const activationQuery = z.object({ token: z.string().min(20).max(200) });

export const activateBody = z
  .object({
    token: z.string().min(20).max(200),
    regNumber: z.string().trim().toUpperCase().min(4).max(30),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    get message() {
      return t('Passwords do not match');
    },
    path: ['confirmPassword'],
  });
