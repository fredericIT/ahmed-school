import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { env } from '../config/env';

export interface AccessPayload {
  sub: number;
  role: Role;
  email: string;
  /** The user's `passwordChangedAt` (ms since epoch, 0 if never) when the token was issued. */
  pwd: number;
}

export function signAccessToken(payload: AccessPayload): string {
  return jwt.sign({ role: payload.role, email: payload.email, pwd: payload.pwd }, env.JWT_ACCESS_SECRET, {
    subject: String(payload.sub),
    expiresIn: `${env.ACCESS_TOKEN_TTL_MIN}m`,
  });
}

export function verifyAccessToken(token: string): AccessPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET);
    if (typeof decoded === 'string' || !decoded.sub) return null;
    return {
      sub: Number(decoded.sub),
      role: decoded.role as Role,
      email: String(decoded.email),
      pwd: typeof decoded.pwd === 'number' ? decoded.pwd : -1,
    };
  } catch {
    return null;
  }
}

/** Opaque random token; only its HMAC is stored in the database. */
export function randomToken(): string {
  return crypto.randomBytes(48).toString('base64url');
}

export function hashToken(token: string): string {
  return crypto.createHmac('sha256', env.JWT_REFRESH_SECRET).update(token).digest('hex');
}
