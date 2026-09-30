'use client';
import Link from 'next/link';
import { Puppy } from '@/components/shared/puppy';
import { t } from '@/lib/i18n';

export default function NotFound() {
  return (
    <div className="paw-pattern grid min-h-screen place-items-center p-6">
      <div className="text-center">
        <Puppy wave hearts className="mx-auto h-40 w-40 drop-shadow-lg" />
        <h1 className="mt-4 font-heading text-4xl font-black">{t('Page not found')}</h1>
        <p className="mt-2 text-muted-foreground">
          {t('This page wandered off to the playground. Our puppy will walk you back.')}
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-10 items-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          {t('Back to the start')}
        </Link>
      </div>
    </div>
  );
}
