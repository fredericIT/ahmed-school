'use client';
import { createContext, Fragment, useCallback, useContext, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { LOCALE_COOKIE, setCurrentLocale, translate, type Locale } from './locale';

export { LOCALES, msg, plural, translate as t, type Locale } from './locale';

interface I18nValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
}

const I18nContext = createContext<I18nValue>({ locale: 'en', setLocale: () => undefined });

/**
 * Holds the active language. Components translate with the plain `t()` function; switching language
 * re-renders the whole app (keyed on the locale), so every text, date and number follows.
 */
export function I18nProvider({ initialLocale, children }: { initialLocale: Locale; children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const queryClient = useQueryClient();
  setCurrentLocale(locale);

  const setLocale = useCallback(
    (l: Locale) => {
      setCurrentLocale(l);
      setLocaleState(l);
      // A cookie, so the server renders the right language and the API answers in it.
      document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
      document.documentElement.lang = l;
      // Texts from the server (notifications, messages) come back in the new language.
      void queryClient.invalidateQueries();
    },
    [queryClient],
  );
  return (
    <I18nContext.Provider value={{ locale, setLocale }}>
      <Fragment key={locale}>{children}</Fragment>
    </I18nContext.Provider>
  );
}

export const useI18n = () => useContext(I18nContext);

/**
 * Translates a sentence that contains formatted parts, keeping it whole for translators:
 * `tRich('Welcome, {name}!', { name: <strong>{first}</strong> })`.
 */
export function tRich(text: string, parts: Record<string, ReactNode>): ReactNode {
  const pieces = translate(text).split(/\{(\w+)\}/);
  return pieces.map((piece, i) =>
    i % 2 === 0 ? piece : <Fragment key={i}>{piece in parts ? parts[piece] : `{${piece}}`}</Fragment>,
  );
}
