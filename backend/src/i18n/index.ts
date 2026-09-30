import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';
import { getSettings } from '../utils/settings';
import fr from './fr.json';
import rw from './rw.json';

/**
 * Server-side translations, keyed by the English text: `t('Student not found')`,
 * `t('Only {count} copies available', { count })`. `fr.json` and `rw.json` map each English string to its
 * translation; `npm run i18n:check` fails when a translation is missing.
 *
 * The language of each request is kept in async-local storage, so any code a request runs (services, PDF and
 * Excel builders, emails) can call `t()` without passing the request around. It comes from `?lang=`, the
 * `locale` cookie the web app sets, the `Accept-Language` header, else the school's default language.
 */
export type Lang = 'en' | 'fr' | 'rw';
export type Params = Record<string, string | number | null | undefined>;

const DICTS: Record<Lang, Record<string, string>> = { en: {}, fr, rw };
const INTL: Record<Lang, string> = { en: 'en-GB', fr: 'fr-FR', rw: 'rw-RW' }; // i18n-ignore
const store = new AsyncLocalStorage<{ lang: Lang }>();

export const isLang = (v: unknown): v is Lang => v === 'en' || v === 'fr' || v === 'rw';

/** The language of the current request ('en' outside a request, e.g. in scheduled jobs). */
export const currentLang = (): Lang => store.getStore()?.lang ?? 'en';
/** BCP 47 tag for dates and numbers in the current language. */
export const intlLocale = (): string => INTL[currentLang()];

/** Runs `fn` in the given language (e.g. an email to a user whose language is known). */
export const withLang = <T>(lang: Lang, fn: () => T): T => store.run({ lang }, fn);

/** English shown for a key; `'context|text'` keys disambiguate short words and show only the text part. */
const english = (key: string) => key.slice(key.indexOf('|') + 1);

function interpolate(text: string, params?: Params): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, name: string) => {
    const v = params[name];
    return v === undefined || v === null
      ? m
      : typeof v === 'number'
        ? v.toLocaleString(intlLocale())
        : String(v);
  });
}

/** Translates an English string into the current request's language; unknown strings stay in English. */
export function t(text: string, params?: Params): string {
  return interpolate(DICTS[currentLang()][text] ?? english(text), params);
}

/** Marks a string for translation where it is defined (Zod messages, constants); it is translated where shown. */
export const msg = <T extends string>(text: T): T => text;

/** Singular or plural sentence by the language's rules; `{count}` is filled in. */
export function plural(count: number, one: string, other: string, params?: Params): string {
  const form = new Intl.PluralRules(intlLocale()).select(count) === 'one' ? one : other;
  return t(form, { count, ...params });
}

/**
 * English text to store (notifications): always English whatever the request's language, translated for each
 * reader by `translateStored()`. The template must be in the dictionaries like any other key.
 */
export function storedText(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, name: string) => {
    const v = params[name];
    return v === undefined || v === null ? m : String(v);
  });
}

/** `storedText` with the singular or plural English template. */
export function storedPlural(count: number, one: string, other: string, params?: Params): string {
  return storedText(count === 1 ? one : other, { count, ...params });
}

// Templates with {placeholders}, compiled to regular expressions for translating stored English sentences.
const templates = Object.keys(fr)
  .filter((k) => /\{\w+\}/.test(k))
  .map((k) => {
    const names: string[] = [];
    const source = k
      .split(/(\{\w+\})/)
      .map((part) => {
        const m = /^\{(\w+)\}$/.exec(part);
        if (!m) return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        names.push(m[1]);
        return '(.+?)';
      })
      .join('');
    return { key: k, names, re: new RegExp(`^${source}$`) };
  });

/**
 * Translates an English sentence that was stored earlier (notification texts): an exact entry, or a template
 * such as `"{name}" is low on stock ({quantity} left)` whose values are put back in.
 */
export function translateStored(text: string): string {
  const dict = DICTS[currentLang()];
  if (currentLang() === 'en' || dict[text]) return t(text);
  for (const { key, names, re } of templates) {
    const m = re.exec(text);
    // Values that are words themselves (a unit such as "pcs") are translated too.
    if (m)
      return interpolate(dict[key], Object.fromEntries(names.map((n, i) => [n, dict[m[i + 1]] ?? m[i + 1]])));
  }
  return text;
}

/** `?lang=`, then the language chosen in the app (cookie), then the one the app sends in `Accept-Language`. */
function requestedLang(req: Request): Lang | undefined {
  const query = req.query.lang;
  if (isLang(query)) return query;
  const cookie = (req.cookies as Record<string, string> | undefined)?.locale;
  if (isLang(cookie)) return cookie;
  const header = req.headers['accept-language']?.split(',')[0]?.trim().slice(0, 2).toLowerCase();
  return isLang(header) ? header : undefined;
}

/** Express middleware: runs the rest of the request in its language. */
export function languageMiddleware(req: Request, _res: Response, next: NextFunction): void {
  const lang = requestedLang(req);
  if (lang) return store.run({ lang }, next);
  getSettings()
    .then((s) => store.run({ lang: isLang(s.locale) ? s.locale : 'en' }, next))
    .catch(() => store.run({ lang: 'en' }, next));
}

// Numbers and dates for PDFs, Excel titles and messages, in the current language.
export function formatNumber(n: number, maximumFractionDigits = 0): string {
  return new Intl.NumberFormat(intlLocale(), { maximumFractionDigits }).format(n);
}

export function formatMoney(n: number, currency: string): string {
  return `${formatNumber(n)} ${currency}`;
}

/** A percentage given as 0–100: "72.5%", "72,5 %". */
export function formatPercent(n: number, maximumFractionDigits = 1): string {
  return new Intl.NumberFormat(intlLocale(), { style: 'percent', maximumFractionDigits }).format(n / 100);
}

/** A calendar date ('YYYY-MM-DD' or a Date at UTC midnight) for people: "29 Sept 2026", "29 sept. 2026". */
export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '';
  const d = typeof value === 'string' ? new Date(`${value.slice(0, 10)}T00:00:00Z`) : value;
  return new Intl.DateTimeFormat(intlLocale(), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}

/** A moment in time in the school's timezone. */
export function formatDateTime(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(intlLocale(), { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(
    value,
  );
}

/** "From 1 Sept 2026 to 30 Sept 2026", "From …", "Until …", or '' when there is no range. */
export function periodLabel(from?: string, to?: string): string {
  if (from && to) return t('From {from} to {to}', { from: formatDate(from), to: formatDate(to) });
  if (from) return t('From {from}', { from: formatDate(from) });
  if (to) return t('Until {to}', { to: formatDate(to) });
  return '';
}
