import type { CookieOptions, Response } from 'express';
import { env } from '../../config/env';
import { ACCESS_COOKIE, REFRESH_COOKIE } from '../../middlewares/auth';
import { toPublicUrl } from '../../middlewares/upload';
import { badRequest } from '../../utils/errors';
import type { Ctx } from '../../utils/router';
import * as schema from './schema';
import * as service from './service';
import { t } from '../../i18n';

const base: CookieOptions = { httpOnly: true, secure: env.COOKIE_SECURE, sameSite: 'lax', path: '/' };

function setAuthCookies(res: Response, tokens: service.Tokens) {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, { ...base, maxAge: env.ACCESS_TOKEN_TTL_MIN * 60_000 });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...base,
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 86_400_000,
  });
}

function clearAuthCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, base);
  res.clearCookie(REFRESH_COOKIE, base);
}

const refreshCookie = (cookies: unknown) => (cookies as Record<string, string | undefined>)[REFRESH_COOKIE];

export async function login({ body, req, res }: Ctx<{ body: typeof schema.loginBody }>) {
  const { user, tokens } = await service.login(body.identifier, body.password, req);
  setAuthCookies(res, tokens);
  return { user };
}

export async function refresh({ req, res }: Ctx<object>) {
  try {
    const tokens = await service.refresh(refreshCookie(req.cookies), req);
    setAuthCookies(res, tokens);
    return { refreshed: true };
  } catch (err) {
    clearAuthCookies(res);
    throw err;
  }
}

export async function logout({ req, res }: Ctx<object>) {
  await service.logout(refreshCookie(req.cookies), req);
  clearAuthCookies(res);
  return { loggedOut: true };
}

export const me = ({ user }: Ctx<object>) => service.me(user.id);

export async function changePassword({
  body,
  user,
  req,
  res,
}: Ctx<{ body: typeof schema.changePasswordBody }>) {
  const tokens = await service.changePassword(user.id, body.currentPassword, body.newPassword, req);
  setAuthCookies(res, tokens);
  return { changed: true };
}

export async function forgotPassword({ body, req }: Ctx<{ body: typeof schema.forgotPasswordBody }>) {
  await service.forgotPassword(body.email, req);
  return { message: t('If an account exists for this email, a reset link has been sent.') };
}

export async function resetPassword({ body, req }: Ctx<{ body: typeof schema.resetPasswordBody }>) {
  await service.resetPassword(body.token, body.newPassword, req);
  return { message: t('Password has been reset. You can now sign in.') };
}

export const updateProfile = ({ body, user, req }: Ctx<{ body: typeof schema.updateProfileBody }>) =>
  service.updateProfile(user.id, body, req);

export async function uploadAvatar({ user, req }: Ctx<object>) {
  if (!req.file) throw badRequest('No file uploaded');
  return service.setAvatar(user.id, toPublicUrl('avatars', req.file), req);
}

export const updatePreferences = ({ body, user, req }: Ctx<{ body: typeof schema.preferencesBody }>) =>
  service.updatePreferences(user.id, body.dashboardWidgets, req);

export const activationInfo = ({ query }: Ctx<{ query: typeof schema.activationQuery }>) =>
  service.activationInfo(query.token);
export async function activate({ body, req }: Ctx<{ body: typeof schema.activateBody }>) {
  await service.activate(body, req);
  return { message: t('Your account is active. Sign in with your registration number and new password.') };
}
