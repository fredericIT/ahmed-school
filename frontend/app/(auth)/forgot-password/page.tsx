'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft, MailCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/forms/field';
import { api, errorMessage } from '@/lib/api';
import { msg, t } from '@/lib/i18n';

const schema = z.object({
  email: z.string().trim().email(msg('Enter a valid email address')),
});

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  return (
    <div className="rounded-3xl border bg-card p-8 shadow-lift">
      {sent ? (
        <div className="text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-mint/20 text-mint-700">
            <MailCheck className="h-7 w-7" aria-hidden />
          </div>
          <h1 className="mt-4 font-heading text-2xl font-black">{t('Check your inbox')}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t(
              "If an account exists for that email, we've sent a link to reset your password. The link is valid for one hour.",
            )}
          </p>
        </div>
      ) : (
        <>
          <h1 className="font-heading text-2xl font-black">{t('Forgot your password?')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("Enter your staff email and we'll send you a reset link.")}
          </p>
          {error && (
            <p role="alert" className="mt-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <form
            className="mt-6 space-y-4"
            noValidate
            onSubmit={handleSubmit(async (v) => {
              setError(null);
              try {
                await api.post('/auth/forgot-password', v);
                setSent(true);
              } catch (e) {
                setError(errorMessage(e));
              }
            })}
          >
            <Field label={t('Email address')} htmlFor="email" error={formState.errors.email}>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                className="h-11"
                aria-invalid={!!formState.errors.email}
                {...register('email')}
              />
            </Field>
            <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting}>
              {t('Send reset link')}
            </Button>
          </form>
        </>
      )}
      <Link
        href="/login"
        className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> {t('Back to sign in')}
      </Link>
    </div>
  );
}
