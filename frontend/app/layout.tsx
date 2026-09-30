import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import localFont from 'next/font/local';
import { Providers } from '@/components/providers';
import { isLocale, LOCALE_COOKIE, translateIn, type Locale } from '@/lib/locale';
import './globals.css';

/*
 * Premium typefaces by Indian Type Foundry (Fontshare), self-hosted under the ITF Free Font License
 * (app/fonts/LICENSE-ITF-FFL.txt): free for the school's own use, but the files must not be modified or redistributed.
 * Satoshi for text (tabular figures for tables), Cabinet Grotesk for headings and big numbers.
 */
const satoshi = localFont({
  src: './fonts/Satoshi-Variable.woff2',
  weight: '300 900',
  variable: '--font-sans',
  display: 'swap',
});
const cabinet = localFont({
  src: './fonts/CabinetGrotesk-Variable.woff2',
  weight: '100 900',
  variable: '--font-heading',
  display: 'swap',
});

/** The visitor's chosen language, else the school's default language (Settings), else English. */
async function requestLocale(): Promise<Locale> {
  const saved = cookies().get(LOCALE_COOKIE)?.value;
  if (isLocale(saved)) return saved;
  try {
    const res = await fetch(`${process.env.BACKEND_URL || 'http://localhost:4000'}/api/v1/settings/public`, {
      next: { revalidate: 60 },
    });
    const json = (await res.json()) as { data?: { locale?: string } };
    if (isLocale(json.data?.locale)) return json.data.locale;
  } catch {
    // API unreachable: fall back to English.
  }
  return 'en';
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await requestLocale();
  return {
    title: {
      default: `Little Stars · ${translateIn(locale, 'School Management')}`, // i18n-ignore: brand name
      template: '%s · Little Stars', // i18n-ignore: brand name
    },
    description: translateIn(
      locale,
      'School management system for nursery and lower primary: students, attendance, activities, inventory and library.',
    ),
    icons: { icon: '/favicon.svg' },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#4F6BED' },
    { media: '(prefers-color-scheme: dark)', color: '#0b1020' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await requestLocale();
  return (
    <html lang={locale} suppressHydrationWarning className={`${satoshi.variable} ${cabinet.variable}`}>
      <body>
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
