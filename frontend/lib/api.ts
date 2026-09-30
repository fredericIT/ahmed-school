/**
 * Thin fetch wrapper for the Express API.
 * - Requests go to /api/v1 on this origin (Next rewrites them to the backend), so httpOnly cookies just work.
 * - On 401 it transparently refreshes the session once (single-flight) and retries the request.
 * - Every request names the active language, so the API answers (messages, PDFs, exports) in it.
 */
import { currentLocale, translate as t } from './locale';

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  unread?: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: {
      fieldErrors?: Record<string, string[]>;
      formErrors?: string[];
    } & Record<string, unknown>,
  ) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

const BASE = '/api/v1';

export function buildQuery(query?: Query): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    params.set(k, String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

let refreshing: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  if (!refreshing) {
    refreshing = fetch(`${BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        // Let concurrent callers reuse the result, then allow future refreshes.
        setTimeout(() => (refreshing = null), 0);
      });
  }
  return refreshing;
}

function onSessionExpired() {
  if (typeof window === 'undefined') return;
  const path = window.location.pathname;
  if (path.startsWith('/login') || path.startsWith('/forgot-password') || path.startsWith('/reset-password')) return;
  window.location.href = `/login?next=${encodeURIComponent(path + window.location.search)}&expired=1`;
}

interface RequestOptions {
  query?: Query;
  body?: unknown;
  form?: FormData;
  signal?: AbortSignal;
}

async function raw(method: string, path: string, opts: RequestOptions = {}, retry = true): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json', 'Accept-Language': currentLocale() };
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(`${BASE}${path}${buildQuery(opts.query)}`, {
    method,
    headers,
    body,
    credentials: 'include',
    signal: opts.signal,
  });
  const isAuthRoute =
    path.startsWith('/auth/login') || path.startsWith('/auth/refresh') || path.startsWith('/auth/logout');
  if (res.status === 401 && retry && !isAuthRoute) {
    if (await refreshSession()) return raw(method, path, opts, false);
    onSessionExpired();
  }
  return res;
}

async function parse<T>(res: Response): Promise<{ data: T; meta?: PageMeta }> {
  let json: {
    success: boolean;
    data?: T;
    meta?: PageMeta;
    error?: { code: string; message: string; details?: ApiError['details'] };
  };
  try {
    json = await res.json();
  } catch {
    throw new ApiError(
      res.status,
      'BAD_RESPONSE',
      res.ok ? t('Unexpected server response') : t('Request failed ({status})', { status: res.status }),
    );
  }
  if (!res.ok || !json.success) {
    const e = json.error ?? {
      code: 'ERROR',
      message: t('Request failed ({status})', { status: res.status }),
    };
    throw new ApiError(res.status, e.code, e.message, e.details);
  }
  return { data: json.data as T, meta: json.meta };
}

async function call<T>(method: string, path: string, opts?: RequestOptions): Promise<T> {
  return (await parse<T>(await raw(method, path, opts))).data;
}

export const api = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) => call<T>('GET', path, { query, signal }),
  list: async <T>(path: string, query?: Query, signal?: AbortSignal): Promise<Paginated<T>> => {
    const { data, meta } = await parse<T[]>(await raw('GET', path, { query, signal }));
    return { data, meta: meta as PageMeta };
  },
  post: <T>(path: string, body?: unknown, query?: Query) => call<T>('POST', path, { body, query }),
  patch: <T>(path: string, body?: unknown) => call<T>('PATCH', path, { body }),
  put: <T>(path: string, body?: unknown) => call<T>('PUT', path, { body }),
  delete: <T>(path: string, query?: Query) => call<T>('DELETE', path, { query }),
  upload: <T>(path: string, form: FormData, query?: Query) => call<T>('POST', path, { form, query }),

  /** Downloads a file endpoint (PDF/Excel) and triggers a browser save. */
  async download(path: string, query?: Query, fallbackName = 'download'): Promise<void> {
    const res = await raw('GET', path, { query });
    if (!res.ok) await parse(res);
    const blob = await res.blob();
    const disposition = res.headers.get('content-disposition') ?? '';
    const name = /filename="?([^"]+)"?/.exec(disposition)?.[1] ?? fallbackName;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  },

  /** Opens a PDF in a new tab (for printing ID cards, forms, labels). */
  async openPdf(path: string, query?: Query): Promise<void> {
    const win = window.open('', '_blank');
    const res = await raw('GET', path, { query });
    if (!res.ok) {
      win?.close();
      await parse(res);
    }
    const url = URL.createObjectURL(await res.blob());
    if (win) win.location.href = url;
    else window.location.href = url;
  },
};

/** Extracts a user-friendly message from any thrown value. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const fields = err.details?.fieldErrors;
    if (err.code === 'VALIDATION_ERROR' && fields) {
      const first = Object.entries(fields)[0];
      if (first) return t(first[1][0]);
    }
    return t(err.message);
  }
  if (err instanceof Error) return t(err.message);
  return t('Something went wrong');
}
