import type { Request } from 'express';
import { Prisma, type User } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { AppError, badRequest, forbidden, notFound, unauthorized } from '../../utils/errors';
import { hashPassword, verifyPassword } from '../../utils/password';
import { hashToken, randomToken, signAccessToken } from '../../utils/tokens';
import { audit } from '../../utils/audit';
import { sendMail } from '../../utils/mailer';
import { removeUpload } from '../../utils/files';
import { plural, t } from '../../i18n';

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_MINUTES = 15;

export const publicUserSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  role: true,
  isActive: true,
  avatar: true,
  lastLoginAt: true,
  dashboardWidgets: true,
  regNumber: true,
  post: true,
  activatedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

async function issueTokens(
  user: Pick<User, 'id' | 'role' | 'email' | 'passwordChangedAt'>,
  req: Request,
): Promise<Tokens> {
  const refreshToken = randomToken();
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
      ip: req.ip ?? null,
      userAgent: req.get('user-agent')?.slice(0, 255) ?? null,
    },
  });
  return {
    accessToken: signAccessToken({
      sub: user.id,
      role: user.role,
      email: user.email,
      pwd: user.passwordChangedAt?.getTime() ?? 0,
    }),
    refreshToken,
  };
}

export async function login(identifier: string, password: string, req: Request) {
  const byEmail = identifier.includes('@');
  const user = await prisma.user.findFirst({
    where: byEmail
      ? { email: identifier.toLowerCase(), deletedAt: null }
      : { regNumber: identifier.toUpperCase(), deletedAt: null },
  });
  const invalid = unauthorized('Invalid credentials. Check your email / registration number and password.');
  if (!user) throw invalid;
  if (user.role === 'TEACHER' && !user.activatedAt) {
    throw forbidden(
      'Your account is not activated yet. Use the activation link sent to your Gmail to set your password.',
    );
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
    throw new AppError(
      423,
      'ACCOUNT_LOCKED',
      plural(
        minutes,
        'Too many failed attempts. Try again in {count} minute.',
        'Too many failed attempts. Try again in {count} minutes.',
      ),
    );
  }

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) {
    const attempts = user.failedLoginAttempts + 1;
    const lock = attempts >= MAX_FAILED_ATTEMPTS;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: lock ? 0 : attempts,
        lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
      },
    });
    await audit(req, {
      action: 'LOGIN_FAILED',
      entity: 'User',
      entityId: user.id,
      userId: user.id,
      newValues: { attempts, locked: lock },
    });
    if (lock)
      throw new AppError(
        423,
        'ACCOUNT_LOCKED',
        t('Too many failed attempts. Account locked for {minutes} minutes.', { minutes: LOCK_MINUTES }),
      );
    throw invalid;
  }
  if (!user.isActive) throw forbidden('Your account has been deactivated. Contact the super administrator.');

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    select: publicUserSelect,
  });
  await audit(req, { action: 'LOGIN', entity: 'User', entityId: user.id, userId: user.id });
  return { user: updated, tokens: await issueTokens(user, req) };
}

export async function refresh(token: string | undefined, req: Request): Promise<Tokens> {
  if (!token) throw unauthorized('No refresh token');
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!stored) throw unauthorized('Invalid refresh token');

  if (stored.revokedAt) {
    // A rotated token was presented again: likely theft. Kill every session of this user.
    await prisma.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw unauthorized('Refresh token reuse detected, please sign in again');
  }
  if (stored.expiresAt < new Date()) throw unauthorized('Session expired, please sign in again');
  if (!stored.user.isActive || stored.user.deletedAt) throw unauthorized('Account is inactive');

  const tokens = await issueTokens(stored.user, req);
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date(), replacedBy: hashToken(tokens.refreshToken) },
  });
  return tokens;
}

export async function logout(token: string | undefined, req: Request): Promise<void> {
  if (token) {
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashToken(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  if (req.user) await audit(req, { action: 'LOGOUT', entity: 'User', entityId: req.user.id });
}

export async function me(userId: number) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: publicUserSelect });
  if (!user) throw notFound('User');
  return user;
}

export async function changePassword(
  userId: number,
  current: string,
  next: string,
  req: Request,
): Promise<Tokens> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(current, user.passwordHash))) throw badRequest('Current password is incorrect');
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: await hashPassword(next), passwordChangedAt: new Date() },
  });
  // Sign out every other session, then give this one fresh tokens.
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  await audit(req, { action: 'PASSWORD_CHANGE', entity: 'User', entityId: userId });
  return issueTokens(updated, req);
}

export async function forgotPassword(email: string, req: Request): Promise<void> {
  const user = await prisma.user.findFirst({ where: { email, deletedAt: null, isActive: true } });
  // Always behave the same whether or not the account exists (no user enumeration).
  // Teachers cannot reset their own password: the school administration does it for them.
  if (!user || user.role === 'TEACHER') return;
  const token = randomToken();
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(token),
      purpose: 'PASSWORD_RESET',
      expiresAt: new Date(Date.now() + 60 * 60_000),
    },
  });
  const link = `${env.APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
  await sendMail(
    user.email,
    t('Reset your password'),
    t(
      'Hello {name},\n\nReset your password using this link (valid for 1 hour):\n{link}\n\nIf you did not request this, ignore this email.',
      { name: user.firstName, link },
    ),
  );
  await audit(req, {
    action: 'PASSWORD_RESET',
    entity: 'User',
    entityId: user.id,
    userId: user.id,
    newValues: { requested: true },
  });
}

export async function resetPassword(token: string, newPassword: string, req: Request): Promise<void> {
  const stored = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!stored || stored.purpose !== 'PASSWORD_RESET' || stored.usedAt || stored.expiresAt < new Date())
    throw badRequest('This reset link is invalid or has expired');
  await prisma.$transaction([
    prisma.user.update({
      where: { id: stored.userId },
      data: {
        passwordHash: await hashPassword(newPassword),
        passwordChangedAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    }),
    prisma.passwordResetToken.update({ where: { id: stored.id }, data: { usedAt: new Date() } }),
    prisma.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
  await audit(req, {
    action: 'PASSWORD_RESET',
    entity: 'User',
    entityId: stored.userId,
    userId: stored.userId,
    newValues: { completed: true },
  });
}

export async function updateProfile(
  userId: number,
  data: { firstName?: string; lastName?: string; phone?: string | null },
  req: Request,
) {
  const before = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: publicUserSelect });
  const after = await prisma.user.update({ where: { id: userId }, data, select: publicUserSelect });
  await audit(req, {
    action: 'UPDATE',
    entity: 'User',
    entityId: userId,
    oldValues: before,
    newValues: data,
  });
  return after;
}

export async function setAvatar(userId: number, url: string, req: Request) {
  const before = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { avatar: true } });
  const after = await prisma.user.update({
    where: { id: userId },
    data: { avatar: url },
    select: publicUserSelect,
  });
  removeUpload(before.avatar);
  await audit(req, {
    action: 'UPDATE',
    entity: 'User',
    entityId: userId,
    oldValues: before,
    newValues: { avatar: url },
  });
  return after;
}

export async function updatePreferences(userId: number, dashboardWidgets: string[] | null, req: Request) {
  const before = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { dashboardWidgets: true },
  });
  const after = await prisma.user.update({
    where: { id: userId },
    // Prisma needs DbNull to clear a JSON column back to "show everything".
    data: { dashboardWidgets: dashboardWidgets ?? Prisma.DbNull },
    select: publicUserSelect,
  });
  await audit(req, {
    action: 'UPDATE',
    entity: 'User',
    entityId: userId,
    oldValues: before,
    newValues: { dashboardWidgets },
  });
  return after;
}

// ─── Teacher account activation ───

export const ACTIVATION_HOURS = 72;

/** Creates a single-use activation token (older unused ones are voided). Returns the raw token. */
export async function createActivationToken(userId: number): Promise<string> {
  const token = randomToken();
  await prisma.$transaction([
    prisma.passwordResetToken.updateMany({
      where: { userId, purpose: 'ACTIVATION', usedAt: null },
      data: { usedAt: new Date() },
    }),
    prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        purpose: 'ACTIVATION',
        expiresAt: new Date(Date.now() + ACTIVATION_HOURS * 3_600_000),
      },
    }),
  ]);
  return token;
}

export function activationLink(token: string): string {
  return `${env.APP_URL}/activate?token=${encodeURIComponent(token)}`;
}

async function validActivation(token: string) {
  const stored = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (
    !stored ||
    stored.purpose !== 'ACTIVATION' ||
    stored.usedAt ||
    stored.expiresAt < new Date() ||
    stored.user.deletedAt
  )
    throw badRequest(
      'This activation link is invalid or has expired. Ask the school administration to send a new one.',
    );
  return stored;
}

/** Lets the activation page greet the teacher by first name. */
export async function activationInfo(token: string) {
  const { user } = await validActivation(token);
  return { firstName: user.firstName };
}

/** The teacher confirms the registration number from the email and chooses a password. */
export async function activate(
  data: { token: string; regNumber: string; password: string },
  req: Request,
): Promise<void> {
  const stored = await validActivation(data.token);
  if (stored.user.regNumber !== data.regNumber)
    throw badRequest('This registration number does not match the one sent to your email.');
  await prisma.$transaction([
    prisma.user.update({
      where: { id: stored.userId },
      data: {
        passwordHash: await hashPassword(data.password),
        passwordChangedAt: new Date(),
        activatedAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    }),
    prisma.passwordResetToken.update({ where: { id: stored.id }, data: { usedAt: new Date() } }),
  ]);
  await audit(req, {
    action: 'PASSWORD_CHANGE',
    entity: 'User',
    entityId: stored.userId,
    userId: stored.userId,
    newValues: { activated: true },
  });
}
