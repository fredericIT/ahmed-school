import fr from '@/messages/fr.json';
import rw from '@/messages/rw.json';
import { hasLocaleData, KINYARWANDA_NUMBERS } from './intl-fallback';

/**
 * Translations are keyed by the English text itself: `translate('Register student')`,
 * `translate('{count} pupils', { count })`. `messages/fr.json` and `messages/rw.json` map each English string
 * to its translation; English needs no file. `npm run i18n:check` fails when a string on screen is not wrapped
 * for translation or has no French or Kinyarwanda entry. A key may start with a context, `'Attendance code: sick|S'`,
 * when the same short English word needs different translations; only the part after `|` shows in English. React components use `useT()` from `lib/i18n`.
 */
export type Locale = 'en' | 'fr' | 'rw';
export type Params = Record<string, string | number | null | undefined>;

export const LOCALES: { code: Locale; label: string }[] = [
  { code: 'en', label: 'English' }, // i18n-ignore: each language is named in itself
  { code: 'fr', label: 'Français' }, // i18n-ignore
  { code: 'rw', label: 'Kinyarwanda' }, // i18n-ignore
];
/** BCP 47 tags used for dates and numbers. */
export const INTL_LOCALE: Record<Locale, string> = { en: 'en-GB', fr: 'fr-FR', rw: 'rw-RW' }; // i18n-ignore
export const LOCALE_COOKIE = 'locale';

const DICTS: Record<Locale, Record<string, string>> = { en: {}, fr, rw };

export function isLocale(v: unknown): v is Locale {
  return v === 'en' || v === 'fr' || v === 'rw';
}

// The active locale, readable outside React (API client, formatters, toasts). Set by I18nProvider.
let current: Locale = 'en';
export const currentLocale = () => current;
export const setCurrentLocale = (l: Locale) => {
  current = l;
};
export const intlLocale = () => INTL_LOCALE[current];

function interpolate(text: string, params?: Params): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, name: string) => {
    const v = params[name];
    if (v === undefined || v === null) return m;
    if (typeof v !== 'number') return v;
    const l = intlLocale();
    return v.toLocaleString(l.startsWith('rw') && !hasLocaleData(l) ? KINYARWANDA_NUMBERS : l);
  });
}

/** English shown for a key; `'context|text'` keys disambiguate short words and show only the text part. */
const english = (key: string) => key.slice(key.indexOf('|') + 1);

/** Translates an English string into the active language; unknown strings stay in English. */
export function translate(text: string, params?: Params): string {
  return interpolate(DICTS[current][text] ?? english(text), params);
}

/** Translates into a given language; for server code, which has no active language. */
export function translateIn(locale: Locale, text: string): string {
  return DICTS[locale][text] ?? english(text);
}

/** Marks a string for translation where it is defined (constants, option lists); translate it where shown. */
export const msg = <T extends string>(text: T): T => text;

/**
 * Picks the singular or plural sentence by the active language's rules (French treats 0 as singular):
 * `plural(n, '{count} photo added', '{count} photos added')`. `{count}` is filled in.
 */
export function plural(count: number, one: string, other: string, params?: Params): string {
  const form = new Intl.PluralRules(intlLocale()).select(count) === 'one' ? one : other;
  return translate(form, { count, ...params });
}
