const SENSITIVE_KEYS = /password|token|secret/i;

/** Removes HTML tags and trims strings recursively. Password-like keys are left untouched. */
export function sanitizeInput(value: unknown, key = ''): unknown {
  if (typeof value === 'string') {
    if (SENSITIVE_KEYS.test(key)) return value;
    return value.replace(/<[^>]*>/g, '').trim();
  }
  if (Array.isArray(value)) return value.map((v) => sanitizeInput(v, key));
  const proto = value && typeof value === 'object' ? Object.getPrototypeOf(value) : undefined;
  if (value && (proto === Object.prototype || proto === null)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = sanitizeInput(v, k);
    return out;
  }
  return value;
}

/** Strips secrets before objects are written to logs or the audit trail. */
export function stripSensitive<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripSensitive) as T;
  if (value instanceof Date || value === null || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (/passwordHash|password|tokenHash|token/i.test(k)) continue;
    out[k] = stripSensitive(v);
  }
  return out as T;
}
