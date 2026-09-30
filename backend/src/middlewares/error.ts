import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { logger } from '../config/logger';
import { AppError } from '../utils/errors';
import { t } from '../i18n';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: t('Route {method} {path} not found', { method: req.method, path: req.path }),
    },
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res
      .status(err.statusCode)
      .json({ success: false, error: { code: err.code, message: t(err.message), details: err.details } });
    return;
  }
  if (err instanceof ZodError) {
    res.status(422).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: t('Validation failed'),
        details: err.flatten((i) => t(i.message)),
      },
    });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[] | string | undefined) ?? 'field';
      res.status(409).json({
        success: false,
        error: {
          code: 'CONFLICT',
          message: t('A record with this {field} already exists', {
            field: Array.isArray(target) ? target.join(', ') : target,
          }),
        },
      });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: t('Record not found') } });
      return;
    }
    if (err.code === 'P2003') {
      res.status(409).json({
        success: false,
        error: { code: 'CONFLICT', message: t('This record is linked to other records') },
      });
      return;
    }
  }
  if (err instanceof SyntaxError && 'body' in err) {
    res
      .status(400)
      .json({ success: false, error: { code: 'BAD_REQUEST', message: t('Malformed JSON body') } });
    return;
  }
  logger.error({ err, path: req.path }, 'Unhandled error');
  res
    .status(500)
    .json({ success: false, error: { code: 'INTERNAL_ERROR', message: t('Something went wrong') } });
}
