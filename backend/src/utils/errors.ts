import { t } from '../i18n';

/** Errors shown to people carry text in the request's language; `t()` leaves already-built text unchanged. */
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'AppError'; // i18n-ignore: class name
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'BAD_REQUEST', t(message), details);
export const unauthorized = (message = t('Authentication required')) =>
  new AppError(401, 'UNAUTHORIZED', t(message));
export const forbidden = (message = t('You do not have permission to perform this action')) =>
  new AppError(403, 'FORBIDDEN', t(message));
/** `notFound('Student')` → "Student not found"; each entity name is translated on its own. */
export const notFound = (entity = t('Record')) =>
  new AppError(404, 'NOT_FOUND', t('{entity} not found', { entity: t(entity) }));
export const conflict = (message: string, details?: unknown) =>
  new AppError(409, 'CONFLICT', t(message), details);
