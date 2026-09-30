import rateLimit from 'express-rate-limit';
import { env } from '../../config/env';
import { uploadImage } from '../../middlewares/upload';
import { ApiRouter } from '../../utils/router';
import * as c from './controller';
import * as s from './schema';
import { t } from '../../i18n';

const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: env.LOGIN_RATE_LIMIT,
  // Only failed attempts count, so people signing in normally are never locked out.
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMITED',
      get message() {
        return t('Too many login attempts, please try again later');
      },
    },
  },
});

const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: env.isTest ? 10_000 : 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
});

const r = new ApiRouter('/auth', 'Auth');
r.post(
  '/login',
  {
    summary: 'Sign in (sets httpOnly cookies)',
    public: true,
    pre: [loginLimiter],
    schemas: { body: s.loginBody },
  },
  c.login,
);
r.post('/refresh', { summary: 'Rotate refresh token and issue a new access token', public: true }, c.refresh);
r.post('/logout', { summary: 'Sign out and revoke refresh token', public: true }, c.logout);
r.get('/me', { summary: 'Current user profile', teachers: true }, c.me);
r.post(
  '/change-password',
  { summary: 'Change own password', schemas: { body: s.changePasswordBody } },
  c.changePassword,
);
r.post(
  '/forgot-password',
  {
    summary: 'Request a password reset link',
    public: true,
    pre: [sensitiveLimiter],
    schemas: { body: s.forgotPasswordBody },
  },
  c.forgotPassword,
);
r.post(
  '/reset-password',
  {
    summary: 'Reset password with a token',
    public: true,
    pre: [sensitiveLimiter],
    schemas: { body: s.resetPasswordBody },
  },
  c.resetPassword,
);
r.patch(
  '/profile',
  { summary: 'Update own profile', teachers: true, schemas: { body: s.updateProfileBody } },
  c.updateProfile,
);
r.post(
  '/avatar',
  {
    summary: 'Upload own avatar',
    teachers: true,
    pre: [uploadImage('avatars')],
    multipart: { file: 'file' },
  },
  c.uploadAvatar,
);

r.put(
  '/preferences',
  { summary: 'Save my dashboard preferences (which widgets to track)', schemas: { body: s.preferencesBody } },
  c.updatePreferences,
);

r.get(
  '/activation',
  {
    summary: 'Check a teacher activation link',
    public: true,
    pre: [sensitiveLimiter],
    schemas: { query: s.activationQuery },
  },
  c.activationInfo,
);
r.post(
  '/activate',
  {
    summary: 'Activate a teacher account: confirm the emailed registration number and choose a password',
    public: true,
    pre: [sensitiveLimiter],
    schemas: { body: s.activateBody },
  },
  c.activate,
);

export default r;
