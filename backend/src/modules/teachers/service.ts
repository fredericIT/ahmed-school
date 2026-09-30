import crypto from 'crypto';
import type { Request } from 'express';
import { Prisma } from '@prisma/client';
import type { z } from 'zod';
import { env } from '../../config/env';
import { prisma, type Tx } from '../../config/prisma';
import { logger } from '../../config/logger';
import { audit, diff } from '../../utils/audit';
import { todayIn } from '../../utils/dates';
import { badRequest, conflict, notFound } from '../../utils/errors';
import { sendMail } from '../../utils/mailer';
import { orderBy, paged, skipTake } from '../../utils/pagination';
import { hashPassword } from '../../utils/password';
import { getSettings } from '../../utils/settings';
import { activationLink, ACTIVATION_HOURS, createActivationToken } from '../auth/service';
import { POSTS, type PostCode } from './schema';
import { isLang, t, withLang } from '../../i18n';
import type * as s from './schema';

const teacherSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  role: true,
  regNumber: true,
  post: true,
  isActive: true,
  avatar: true,
  activatedAt: true,
  lastLoginAt: true,
  createdAt: true,
  teachingAssignments: {
    select: {
      id: true,
      course: { select: { id: true, name: true, code: true } },
      class: { select: { id: true, name: true } },
    },
    orderBy: [{ classId: 'asc' }, { courseId: 'asc' }],
  },
} satisfies Prisma.UserSelect;

type TeacherRow = Prisma.UserGetPayload<{ select: typeof teacherSelect }>;

function present(teacher: TeacherRow) {
  const { teachingAssignments, ...rest } = teacher;
  return {
    ...rest,
    postLabel: POSTS[(teacher.post ?? 'TR') as PostCode] ?? teacher.post,
    status: !teacher.isActive ? 'INACTIVE' : teacher.activatedAt ? 'ACTIVE' : 'PENDING',
    assignments: teachingAssignments,
  };
}

// ─── Registration numbers ───

/** Next number for a post in the current school year, e.g. 26TR001, 26TR002… */
export async function nextRegNumber(tx: Tx, post: PostCode): Promise<string> {
  const { timezone } = await getSettings();
  const prefix = `${todayIn(timezone).slice(2, 4)}${post}`;
  const existing = await tx.user.findMany({
    where: { regNumber: { startsWith: prefix } },
    select: { regNumber: true },
  });
  // Only numbers that are exactly prefix + digits count (so "26TR" never matches "26TRA…").
  const seqs = existing
    .map((u) => u.regNumber?.slice(prefix.length) ?? '')
    .filter((rest) => /^\d+$/.test(rest))
    .map(Number);
  const next = (seqs.length ? Math.max(...seqs) : 0) + 1;
  return `${prefix}${String(next).padStart(3, '0')}`;
}

async function validateAssignments(tx: Tx, assignments: { courseId: number; classId: number }[]) {
  if (!assignments.length) return;
  const courseIds = [...new Set(assignments.map((a) => a.courseId))];
  const classIds = [...new Set(assignments.map((a) => a.classId))];
  const [courses, classes] = await Promise.all([
    tx.course.count({ where: { id: { in: courseIds }, deletedAt: null } }),
    tx.class.count({ where: { id: { in: classIds }, deletedAt: null } }),
  ]);
  if (courses !== courseIds.length) throw badRequest('Some selected courses do not exist');
  if (classes !== classIds.length) throw badRequest('Some selected classes do not exist');
}

// ─── Email ───

async function sendActivationEmail(teacherId: number) {
  const teacher = await prisma.user.findUniqueOrThrow({ where: { id: teacherId }, select: teacherSelect });
  const settings = await getSettings();
  const token = await createActivationToken(teacherId);
  const link = activationLink(token);
  const courses = teacher.teachingAssignments.map((a) => `  • ${a.course.name} — ${a.class.name}`).join('\n');
  // The teacher is not the one making the request: write in the school's default language.
  const [subject, body] = withLang(isLang(settings.locale) ? settings.locale : 'en', () => [
    t('Your {school} account — registration number {regNumber}', {
      school: settings.name,
      regNumber: teacher.regNumber,
    }),
    [
      t('Hello {name},', { name: teacher.firstName }),
      '',
      t('An account has been created for you at {school} as {post}.', {
        school: settings.name,
        post: POSTS[(teacher.post ?? 'TR') as PostCode],
      }),
      '',
      t('Your registration number is: {regNumber}', { regNumber: teacher.regNumber }),
      t('You will use this registration number to sign in.'),
      '',
      t('To activate your account, open the link below (valid for {hours} hours),', {
        hours: ACTIVATION_HOURS,
      }),
      t('enter your registration number and choose your password:'),
      link,
      ...(courses ? ['', t('Courses assigned to you:'), courses] : []),
      '',
      t('If you have any questions, contact the school administration.'),
    ].join('\n'),
  ]);
  await sendMail(teacher.email, subject, body);
  logger.info({ teacherId, regNumber: teacher.regNumber }, 'Activation email sent');
  // Without SMTP the email is only printed to the server console, so hand the link to the administrator.
  return { emailSent: !!env.SMTP_HOST, sentTo: teacher.email, link: env.SMTP_HOST ? undefined : link };
}

// ─── Queries ───

export async function list(q: z.infer<typeof s.listTeachersQuery>) {
  const where: Prisma.UserWhereInput = {
    role: 'TEACHER',
    deletedAt: null,
    isActive: q.isActive,
    post: q.post,
    ...(q.activated !== undefined && { activatedAt: q.activated ? { not: null } : null }),
    ...((q.courseId || q.classId) && {
      teachingAssignments: { some: { courseId: q.courseId, classId: q.classId } },
    }),
    ...(q.search && {
      OR: [
        { firstName: { contains: q.search } },
        { lastName: { contains: q.search } },
        { email: { contains: q.search } },
        { regNumber: { contains: q.search } },
      ],
    }),
  };
  const [rows, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: teacherSelect,
      orderBy: orderBy(
        q,
        ['firstName', 'lastName', 'regNumber', 'createdAt', 'lastLoginAt'] as const,
        'regNumber',
      ),
      ...skipTake(q),
    }),
    prisma.user.count({ where }),
  ]);
  return paged(rows.map(present), total, q);
}

async function getRow(id: number) {
  const teacher = await prisma.user.findFirst({
    where: { id, role: 'TEACHER', deletedAt: null },
    select: teacherSelect,
  });
  if (!teacher) throw notFound('Teacher');
  return teacher;
}

export const get = async (id: number) => present(await getRow(id));

// ─── Mutations ───

export async function create(data: z.infer<typeof s.createTeacherBody>, req: Request) {
  if (await prisma.user.findUnique({ where: { email: data.email } }))
    throw conflict('An account with this email already exists');
  let id: number | null = null;
  // Registration numbers are sequential; retry if two admins add a teacher at the same moment.
  for (let attempt = 0; id === null; attempt++) {
    try {
      id = await prisma.$transaction(async (tx) => {
        await validateAssignments(tx, data.assignments);
        const regNumber = await nextRegNumber(tx, data.post);
        const created = await tx.user.create({
          data: {
            firstName: data.firstName,
            lastName: data.lastName,
            email: data.email,
            phone: data.phone ?? null,
            role: 'TEACHER',
            post: data.post,
            regNumber,
            // Unusable until the teacher activates the account and chooses a password.
            passwordHash: await hashPassword(crypto.randomBytes(32).toString('hex')),
          },
        });
        if (data.assignments.length)
          await tx.teacherAssignment.createMany({
            data: data.assignments.map((a) => ({ ...a, teacherId: created.id })),
          });
        await audit(
          req,
          {
            action: 'CREATE',
            entity: 'Teacher',
            entityId: created.id,
            newValues: { regNumber, email: data.email, post: data.post, assignments: data.assignments },
          },
          tx,
        );
        return created.id;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002' && attempt < 3)
        continue;
      throw err;
    }
  }
  const activation = await sendActivationEmail(id);
  return { teacher: await get(id), activation };
}

export async function update(id: number, data: z.infer<typeof s.updateTeacherBody>, req: Request) {
  const before = await getRow(id);
  if (
    data.email &&
    data.email !== before.email &&
    (await prisma.user.findUnique({ where: { email: data.email } }))
  )
    throw conflict('An account with this email already exists');
  const after = await prisma.user.update({ where: { id }, data, select: teacherSelect });
  const { teachingAssignments: _a, ...b } = before;
  const { teachingAssignments: _b, ...a } = after;
  await audit(req, { action: 'UPDATE', entity: 'Teacher', entityId: id, ...diff(b, a) });
  return present(after);
}

export async function setAssignments(
  id: number,
  assignments: { courseId: number; classId: number }[],
  req: Request,
) {
  const before = await getRow(id);
  await prisma.$transaction(async (tx) => {
    await validateAssignments(tx, assignments);
    await tx.teacherAssignment.deleteMany({ where: { teacherId: id } });
    if (assignments.length)
      await tx.teacherAssignment.createMany({ data: assignments.map((a) => ({ ...a, teacherId: id })) });
    await audit(
      req,
      {
        action: 'UPDATE',
        entity: 'Teacher',
        entityId: id,
        oldValues: {
          assignments: before.teachingAssignments.map((x) => `${x.course.code} / ${x.class.name}`),
        },
        newValues: { assignments },
      },
      tx,
    );
  });
  return get(id);
}

export async function setStatus(id: number, isActive: boolean, req: Request) {
  const before = await getRow(id);
  await prisma.user.update({ where: { id }, data: { isActive } });
  if (!isActive)
    await prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  await audit(req, {
    action: 'STATUS_CHANGE',
    entity: 'Teacher',
    entityId: id,
    oldValues: { isActive: before.isActive },
    newValues: { isActive },
  });
  return get(id);
}

/** Only administrators change a teacher's password. This also activates a pending account. */
export async function setPassword(id: number, newPassword: string, req: Request) {
  const teacher = await getRow(id);
  await prisma.$transaction([
    prisma.user.update({
      where: { id },
      data: {
        passwordHash: await hashPassword(newPassword),
        passwordChangedAt: new Date(),
        activatedAt: teacher.activatedAt ?? new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    }),
    // Pending activation links stop working once an administrator has set the password.
    prisma.passwordResetToken.updateMany({
      where: { userId: id, usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
  const settings = await getSettings();
  const [subject, body] = withLang(isLang(settings.locale) ? settings.locale : 'en', () => [
    t('Your {school} password was changed', { school: settings.name }),
    t(
      'Hello {name},\n\nThe school administration has set a new password for your account ({regNumber}).\nAsk them for it, then sign in with your registration number.\n\nIf you did not expect this, contact the school administration.',
      { name: teacher.firstName, regNumber: teacher.regNumber },
    ),
  ]);
  await sendMail(teacher.email, subject, body).catch((err) =>
    logger.error({ err }, 'Password-change email failed'),
  );
  await audit(req, {
    action: 'PASSWORD_RESET',
    entity: 'Teacher',
    entityId: id,
    newValues: { byAdmin: true },
  });
  return { reset: true };
}

export async function resendActivation(id: number, req: Request) {
  const teacher = await getRow(id);
  if (teacher.activatedAt)
    throw badRequest('This teacher has already activated the account. Set a new password instead.');
  if (!teacher.isActive) throw badRequest('Activate the teacher account first');
  const activation = await sendActivationEmail(id);
  await audit(req, {
    action: 'UPDATE',
    entity: 'Teacher',
    entityId: id,
    newValues: { activationResent: true },
  });
  return activation;
}

export async function remove(id: number, hard: boolean, req: Request) {
  const before = await getRow(id);
  if (hard) {
    await prisma.user.delete({ where: { id } });
  } else {
    await prisma.$transaction([
      prisma.teacherAssignment.deleteMany({ where: { teacherId: id } }),
      prisma.user.update({
        where: { id },
        // Free the email for reuse; the registration number is kept so it is never reissued.
        data: { deletedAt: new Date(), isActive: false, email: `deleted-${id}-${Date.now()}@deleted.local` },
      }),
      prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }
  await audit(req, {
    action: 'DELETE',
    entity: 'Teacher',
    entityId: id,
    oldValues: present(before),
    newValues: { hard },
  });
  return { deleted: true };
}

// ─── Teacher's own view ───

export async function myClasses(teacherId: number) {
  const teacher = await getRow(teacherId);
  const classIds = [...new Set(teacher.teachingAssignments.map((a) => a.class.id))];
  const classes = await prisma.class.findMany({
    where: { id: { in: classIds }, deletedAt: null },
    include: {
      students: {
        where: { status: 'ACTIVE', deletedAt: null },
        select: {
          id: true,
          admissionNumber: true,
          firstName: true,
          lastName: true,
          gender: true,
          photo: true,
          allergies: true,
        },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      },
    },
    orderBy: { id: 'asc' },
  });
  const { timezone } = await getSettings();
  const today = todayIn(timezone);
  const taken = await prisma.attendance.groupBy({
    by: ['classId'],
    where: { classId: { in: classIds }, date: new Date(`${today}T00:00:00Z`) },
    _count: true,
  });
  return {
    teacher: present(teacher),
    today,
    classes: classes.map((c) => ({
      id: c.id,
      name: c.name,
      level: c.level,
      room: c.room,
      classTeacherName: c.classTeacherName,
      courses: teacher.teachingAssignments.filter((a) => a.class.id === c.id).map((a) => a.course),
      students: c.students,
      attendanceTakenToday: (taken.find((x) => x.classId === c.id)?._count ?? 0) > 0,
    })),
  };
}
