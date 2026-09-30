import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@prisma/client';
import { prisma } from '../config/prisma';
import { forbidden, unauthorized } from '../utils/errors';
import { verifyAccessToken } from '../utils/tokens';

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';

function extractToken(req: Request): string | undefined {
  const header = req.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7);
  const cookie = (req.cookies as Record<string, string | undefined>)[ACCESS_COOKIE];
  return cookie;
}

/** Verifies the access token and that the account is still active. */
export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = extractToken(req);
    if (!token) throw unauthorized();
    const payload = verifyAccessToken(token);
    if (!payload) throw unauthorized('Session expired, please sign in again');
    const user = await prisma.user.findFirst({
      where: { id: payload.sub, isActive: true, deletedAt: null },
      select: { id: true, role: true, email: true, passwordChangedAt: true },
    });
    if (!user) throw unauthorized('Account is inactive or no longer exists');
    // A token issued before the last password change belongs to a signed-out session.
    // Compared in milliseconds: JWT `iat` has one-second precision, too coarse for this.
    if (payload.pwd !== (user.passwordChangedAt?.getTime() ?? 0))
      throw unauthorized('Your password was changed, please sign in again');
    req.user = { id: user.id, role: user.role, email: user.email };
    next();
  } catch (err) {
    next(err);
  }
}

export function authorize(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(unauthorized());
    if (roles.length && !roles.includes(req.user.role)) return next(forbidden());
    next();
  };
}
