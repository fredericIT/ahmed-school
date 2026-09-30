import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { hasLocaleData, kinyarwandaDates, KINYARWANDA_NUMBERS, type DateFormatter } from './intl-fallback';
import { intlLocale } from './locale';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function initials(first?: string | null, last?: string | null): string {
  return `${first?.[0] ?? ''}${last?.[0] ?? ''}`.toUpperCase() || '?';
}

export function fullName(p?: { firstName: string; lastName: string } | null): string {
  return p ? `${p.firstName} ${p.lastName}` : '';
}

/** Calendar dates from the API arrive as ISO strings at UTC midnight. */
export function dateOnly(value?: string | null): string {
  return value ? value.slice(0, 10) : '';
}

// Formatters follow the active language ("29 Sept 2026", "29 sept. 2026", "29 Nzeri 2026").
const formatters = new Map<string, DateFormatter | Intl.NumberFormat>();
function cached<T extends DateFormatter | Intl.NumberFormat>(key: string, make: (locale: string) => T): T {
  const locale = intlLocale();
  const id = `${locale}|${key}`;
  if (!formatters.has(id)) formatters.set(id, make(locale));
  return formatters.get(id) as T;
}

/** Formats a date with the active language. `timeZone` defaults to UTC for calendar dates. */
export function dateFormat(options: Intl.DateTimeFormatOptions): DateFormatter {
  return cached(`d${JSON.stringify(options)}`, (l) => {
    const full = { timeZone: 'UTC', ...options };
    return l.startsWith('rw') && !hasLocaleData(l) ? kinyarwandaDates(full) : new Intl.DateTimeFormat(l, full);
  });
}

/** A number formatter for the active language. */
function numberFormat(key: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  return cached(
    `n${key}`,
    (l) => new Intl.NumberFormat(l.startsWith('rw') && !hasLocaleData(l) ? KINYARWANDA_NUMBERS : l, options),
  );
}

export function formatDate(value?: string | null): string {
  if (!value) return '—';
  return dateFormat({ day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(value.length === 10 ? `${value}T00:00:00Z` : value),
  );
}

export function formatDateTime(value?: string | null): string {
  return value
    ? dateFormat({
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Africa/Kigali',
      }).format(new Date(value))
    : '—';
}

export function formatMoney(value: number | string | null | undefined, currency = 'RWF'): string {
  if (value === null || value === undefined || value === '') return '—';
  return `${formatNumber(Number(value))} ${currency}`;
}

export function formatNumber(value: number | null | undefined, maximumFractionDigits = 0): string {
  return value === null || value === undefined
    ? '—'
    : numberFormat(String(maximumFractionDigits), { maximumFractionDigits }).format(value);
}

export function ageFrom(dob?: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  const now = new Date();
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age--;
  return age;
}

/** en-CA formats dates as YYYY-MM-DD: a machine format, not text for people. */
const ISO_LOCALE = 'en-CA'; // i18n-ignore

export function todayKigali(): string {
  return new Intl.DateTimeFormat(ISO_LOCALE, { timeZone: 'Africa/Kigali' }).format(new Date());
}

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Short weekday names in the active language, Monday first ("Mon", "lun.", "Mbe."). */
export function weekdayNames(): string[] {
  const fmt = dateFormat({ weekday: 'short' });
  // 1 Jan 2024 was a Monday.
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(Date.UTC(2024, 0, 1 + i))));
}

/** A percentage (0–100) in the active language: "72.5%", "72,5 %". */
export function formatPercent(value: number | null | undefined, maximumFractionDigits = 0): string {
  return value === null || value === undefined
    ? '—'
    : numberFormat(`p${maximumFractionDigits}`, { style: 'percent', maximumFractionDigits }).format(value / 100);
}
