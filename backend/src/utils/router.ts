import { Router, type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import type { Role } from '@prisma/client';
import { z, type ZodTypeAny } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { authenticate, authorize } from '../middlewares/auth';
import type { AuthUser } from '../types/express';
import { Paged } from './pagination';
import { sanitizeInput } from './sanitize';
import { unauthorized } from './errors';

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
type Infer<T> = T extends ZodTypeAny ? z.infer<T> : undefined;

interface Schemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

export interface RouteOptions<S extends Schemas> {
  summary: string;
  description?: string;
  /** Omit for administrators only (super admin + admin). Teachers must be opted in explicitly. */
  roles?: Role[];
  /** Also allow teachers (on top of the administrator roles). */
  teachers?: boolean;
  /** Public endpoints skip authentication entirely. */
  public?: boolean;
  schemas?: S;
  /** Middlewares run after auth but before validation (e.g. multer). */
  pre?: RequestHandler[];
  status?: number;
  /** Documents a non-JSON response (file download) in OpenAPI. */
  produces?: string[];
  multipart?: Record<string, 'file' | 'files' | 'string'>;
}

export interface HandlerCtx<S extends Schemas> {
  req: Request;
  res: Response;
  body: Infer<S['body']>;
  query: Infer<S['query']>;
  params: Infer<S['params']>;
  user: AuthUser;
}

export type Ctx<S extends Schemas> = HandlerCtx<S>;
type Handler<S extends Schemas> = (ctx: HandlerCtx<S>) => Promise<unknown>;

// ─── OpenAPI registry ───
interface DocEntry {
  method: Method;
  path: string;
  tag: string;
  options: RouteOptions<Schemas>;
}
const registry: DocEntry[] = [];
export const getRegisteredRoutes = () => registry;

export const ADMIN_ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN'];

/** Secure by default: a route without `roles` is for administrators; teachers need `teachers: true`. */
function allowedRoles(opts: { roles?: Role[]; teachers?: boolean }): Role[] {
  const base = opts.roles?.length ? opts.roles : ADMIN_ROLES;
  return opts.teachers && !base.includes('TEACHER') ? [...base, 'TEACHER'] : base;
}

export const idParams = z.object({ id: z.coerce.number().int().positive() });

export class ApiRouter {
  readonly router = Router();

  constructor(
    public readonly basePath: string,
    public readonly tag: string,
  ) {}

  get<S extends Schemas>(path: string, opts: RouteOptions<S>, fn: Handler<S>) {
    return this.add('get', path, opts, fn);
  }
  post<S extends Schemas>(path: string, opts: RouteOptions<S>, fn: Handler<S>) {
    return this.add('post', path, opts, fn);
  }
  put<S extends Schemas>(path: string, opts: RouteOptions<S>, fn: Handler<S>) {
    return this.add('put', path, opts, fn);
  }
  patch<S extends Schemas>(path: string, opts: RouteOptions<S>, fn: Handler<S>) {
    return this.add('patch', path, opts, fn);
  }
  delete<S extends Schemas>(path: string, opts: RouteOptions<S>, fn: Handler<S>) {
    return this.add('delete', path, opts, fn);
  }

  private add<S extends Schemas>(method: Method, path: string, opts: RouteOptions<S>, fn: Handler<S>): this {
    registry.push({
      method,
      path: this.basePath + (path === '/' ? '' : path),
      tag: this.tag,
      options: opts as RouteOptions<Schemas>,
    });

    const chain: RequestHandler[] = [];
    if (!opts.public) {
      chain.push(authenticate);
      chain.push(authorize(...allowedRoles(opts)));
    }
    if (opts.pre) chain.push(...opts.pre);

    chain.push(async (req: Request, res: Response, next: NextFunction) => {
      try {
        const s = opts.schemas ?? ({} as S);
        const body = s.body ? s.body.parse(sanitizeInput(req.body ?? {})) : undefined;
        const query = s.query ? s.query.parse(sanitizeInput(req.query)) : undefined;
        const params = s.params ? s.params.parse(req.params) : undefined;
        if (!opts.public && !req.user) throw unauthorized();
        const result = await fn({
          req,
          res,
          body: body as Infer<S['body']>,
          query: query as Infer<S['query']>,
          params: params as Infer<S['params']>,
          user: req.user as AuthUser,
        });
        if (res.headersSent) return;
        res.status(opts.status ?? 200);
        if (result instanceof Paged) res.json({ success: true, data: result.data, meta: result.meta });
        else res.json({ success: true, data: result ?? null });
      } catch (err) {
        next(err);
      }
    });

    this.router[method](path, ...chain);
    return this;
  }
}

// ─── OpenAPI document generation ───
function toJsonSchema(schema: ZodTypeAny): Record<string, unknown> {
  // zodToJsonSchema's generics blow up the type checker on large schemas; its output is untyped JSON anyway.
  const convert = zodToJsonSchema as unknown as (s: ZodTypeAny, o: object) => Record<string, unknown>;
  const out = convert(schema, { target: 'openApi3', $refStrategy: 'none' });
  delete out.$schema;
  return out;
}

export function buildOpenApi(info: { title: string; version: string; serverUrl: string }) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const { method, path, tag, options } of registry) {
    const oaPath = '/api/v1' + path.replace(/:(\w+)/g, '{$1}');
    const parameters: unknown[] = [];
    const s = options.schemas ?? {};
    for (const [where, schema] of [
      ['path', s.params],
      ['query', s.query],
    ] as const) {
      if (!schema) continue;
      const js = toJsonSchema(schema) as { properties?: Record<string, unknown>; required?: string[] };
      for (const [name, prop] of Object.entries(js.properties ?? {})) {
        parameters.push({
          name,
          in: where,
          required: where === 'path' || (js.required ?? []).includes(name),
          schema: prop,
        });
      }
    }
    // Path params that aren't validated by a schema still need documenting.
    for (const m of path.matchAll(/:(\w+)/g)) {
      if (!parameters.some((p) => (p as { name: string }).name === m[1]))
        parameters.push({ name: m[1], in: 'path', required: true, schema: { type: 'string' } });
    }
    let requestBody: unknown;
    if (options.multipart) {
      const properties: Record<string, unknown> = {};
      for (const [k, t] of Object.entries(options.multipart))
        properties[k] =
          t === 'file'
            ? { type: 'string', format: 'binary' }
            : t === 'files'
              ? { type: 'array', items: { type: 'string', format: 'binary' } }
              : { type: 'string' };
      requestBody = { content: { 'multipart/form-data': { schema: { type: 'object', properties } } } };
    } else if (s.body) {
      requestBody = { required: true, content: { 'application/json': { schema: toJsonSchema(s.body) } } };
    }
    const roleNote = options.public ? 'Public' : `Roles: ${allowedRoles(options).join(', ')}`;
    paths[oaPath] ??= {};
    paths[oaPath][method] = {
      tags: [tag],
      summary: options.summary,
      description: [options.description, `**Access:** ${roleNote}`].filter(Boolean).join('\n\n'),
      security: options.public ? [] : [{ cookieAuth: [] }, { bearerAuth: [] }],
      parameters,
      ...(requestBody ? { requestBody } : {}),
      responses: {
        [String(options.status ?? 200)]: options.produces
          ? { description: 'File', content: Object.fromEntries(options.produces.map((p) => [p, {}])) }
          : {
              description: 'Success',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Success' } } },
            },
        '4XX': {
          description: 'Error',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
      },
    };
  }
  return {
    openapi: '3.0.3',
    info: {
      title: info.title,
      version: info.version,
      description:
        'School Management System REST API. Authenticate via POST /auth/login (sets httpOnly cookies) or send `Authorization: Bearer <accessToken>`.',
    },
    servers: [{ url: info.serverUrl }],
    components: {
      securitySchemes: {
        cookieAuth: { type: 'apiKey', in: 'cookie', name: 'access_token' },
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        Success: {
          type: 'object',
          properties: { success: { type: 'boolean', example: true }, data: {}, meta: { type: 'object' } },
        },
        Error: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: { code: { type: 'string' }, message: { type: 'string' }, details: {} },
            },
          },
        },
      },
    },
    paths,
  };
}
