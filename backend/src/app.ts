import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import pinoHttp from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env';
import { logger } from './config/logger';
import { errorHandler, notFoundHandler } from './middlewares/error';
import { languageMiddleware } from './i18n';
import './i18n/zod';
import { apiRouter } from './modules';
import { buildOpenApi } from './utils/router';
import { uploadRoot } from './utils/files';

export function createApp() {
  const app = express();
  app.set('trust proxy', env.TRUST_PROXY);
  app.disable('x-powered-by');

  app.use(
    helmet({
      // Uploaded images are displayed by the frontend on another origin.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(cors({ origin: env.corsOrigins, credentials: true }));
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());
  app.use(languageMiddleware);
  if (!env.isTest)
    app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url?.startsWith('/uploads') ?? false } }));

  app.use(
    '/api',
    rateLimit({
      windowMs: 15 * 60_000,
      limit: env.isTest ? 100_000 : 3000,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
    }),
  );

  app.use(
    '/uploads',
    express.static(uploadRoot, {
      maxAge: '7d',
      index: false,
      setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
    }),
  );

  app.get('/api/health', (_req, res) =>
    res.json({ success: true, data: { status: 'ok', time: new Date().toISOString() } }),
  );
  app.use('/api/v1', apiRouter());

  const spec = buildOpenApi({ title: 'School Management System API', version: '1.0.0', serverUrl: '/' });
  app.get('/api/docs.json', (_req, res) => res.json(spec));
  app.use(
    '/api/docs',
    // Swagger UI needs inline scripts/styles, so relax CSP for the docs route only.
    helmet({ contentSecurityPolicy: false }),
    swaggerUi.serve,
    swaggerUi.setup(spec, {
      customSiteTitle: 'School API Docs',
      swaggerOptions: { withCredentials: true, persistAuthorization: true },
    }),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
