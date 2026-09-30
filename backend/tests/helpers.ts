import request from 'supertest';
import bcrypt from 'bcryptjs';
import type { Grade } from '@prisma/client';
import { createApp } from '../src/app';
import { prisma } from '../src/config/prisma';
import { invalidateSettings } from '../src/utils/settings';

export const app = createApp();
export { prisma };

export const SUPER = { email: 'super@test.rw', password: 'Super@1234' };
export const ADMIN = { email: 'admin@test.rw', password: 'Admin@1234' };

export async function resetDb(): Promise<void> {
  const tables = await prisma.$queryRaw<{ TABLE_NAME: string }[]>`
    SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
  for (const { TABLE_NAME } of tables) await prisma.$executeRawUnsafe(`TRUNCATE TABLE \`${TABLE_NAME}\``);
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');
  invalidateSettings();
}

/** Minimal fixture: settings, two users, a current year/term covering today, and two classes. */
export async function seedBase(opts: { allowWeekendAttendance?: boolean } = {}) {
  await prisma.schoolSettings.create({
    data: {
      name: 'Test School',
      allowWeekendAttendance: opts.allowWeekendAttendance ?? true,
      maxBooksPerStudent: 2,
      loanPeriodDays: 7,
    },
  });
  const [superAdmin, admin] = await Promise.all([
    prisma.user.create({
      data: {
        firstName: 'Super',
        lastName: 'Admin',
        email: SUPER.email,
        role: 'SUPER_ADMIN',
        passwordHash: await bcrypt.hash(SUPER.password, 4),
      },
    }),
    prisma.user.create({
      data: {
        firstName: 'Plain',
        lastName: 'Admin',
        email: ADMIN.email,
        role: 'ADMIN',
        passwordHash: await bcrypt.hash(ADMIN.password, 4),
      },
    }),
  ]);
  const year = await prisma.academicYear.create({
    data: {
      name: '2020-2040',
      startDate: new Date('2020-01-01'),
      endDate: new Date('2040-12-31'),
      isCurrent: true,
    },
  });
  const term = await prisma.term.create({
    data: {
      academicYearId: year.id,
      name: 'Term 1',
      startDate: new Date('2020-01-01'),
      endDate: new Date('2040-12-31'),
      isCurrent: true,
    },
  });
  const mk = (name: string, grade: Grade, capacity: number, section: string | null) =>
    prisma.class.create({
      data: { name, grade, level: grade.startsWith('P') ? 'PRIMARY' : 'NURSERY', capacity, section },
    });
  const top = await mk('Top Class', 'TOP', 30, null);
  const p1 = await mk('P1 A', 'P1', 30, 'A');
  return { superAdmin, admin, year, term, top, p1 };
}

export async function login(creds: { email: string; password: string }) {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').send(creds);
  if (res.status !== 200) throw new Error(`Login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return agent;
}

export function studentPayload(classId: number, overrides: Record<string, unknown> = {}) {
  return {
    firstName: 'Keza',
    lastName: 'Uwase',
    gender: 'FEMALE',
    dateOfBirth: '2020-03-14',
    currentClassId: classId,
    guardians: [
      { fullName: 'Jeanne Mukamana', relationship: 'Mother', phone: '+250788123456', isPrimary: true },
    ],
    ...overrides,
  };
}

export function todayKigali(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Kigali' }).format(new Date());
}
