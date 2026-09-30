'use client';
import { useState } from 'react';
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui/misc';
import { I18nProvider } from '@/lib/i18n';
import type { Locale } from '@/lib/locale';
import { ApiError } from '@/lib/api';
// Translated form-validation messages for every form.
import '@/lib/validation';

export function Providers({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
          },
        },
        mutationCache: new MutationCache(),
      }),
  );
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={client}>
        <I18nProvider initialLocale={locale}>
          <TooltipProvider>
            {children}
            <Toaster richColors closeButton position="top-right" toastOptions={{ className: 'rounded-xl font-sans' }} />
          </TooltipProvider>
        </I18nProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
