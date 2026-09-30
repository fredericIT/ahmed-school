'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/forms/field';
import { api, errorMessage } from '@/lib/api';
import { passwordSchema } from '@/lib/validation';
import { t, tRich } from '@/lib/i18n';

const schema = z
  .object({ newPassword: passwordSchema, confirm: z.string() })
  .refine((v) => v.newPassword === v.confirm, {
    get message() {
      return t('Passwords do not match');
    },
    path: ['confirm'],
  });

function ResetForm() {
  const token = useSearchParams().get('token') ?? '';
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema) });

  if (!token) {
    return (
      <p className="text-sm text-muted-foreground">
        {tRich('This reset link is incomplete. {link}.', {
          link: (
            <Link href="/forgot-password" className="font-semibold text-primary">
              {t('Request a new one')}
            </Link>
          ),
        })}
      </p>
    );
  }
  return (
    <form
      className="mt-6 space-y-4"
      noValidate
      onSubmit={handleSubmit(async (v) => {
        setError(null);
        try {
          await api.post('/auth/reset-password', {
            token,
            newPassword: v.newPassword,
          });
          toast.success(t('Password updated. Please sign in.'));
          router.replace('/login');
        } catch (e) {
          setError(errorMessage(e));
        }
      })}
    >
      {error && (
        <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <Field
        label={t('New password')}
        htmlFor="newPassword"
        error={formState.errors.newPassword}
        hint={t('At least 8 characters with upper & lower case letters and a number.')}
      >
        <Input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          className="h-11"
          {...register('newPassword')}
        />
      </Field>
      <Field label={t('Confirm password')} htmlFor="confirm" error={formState.errors.confirm}>
        <Input id="confirm" type="password" autoComplete="new-password" className="h-11" {...register('confirm')} />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting}>
        {t('Set new password')}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="rounded-3xl border bg-card p-8 shadow-lift">
      <h1 className="font-heading text-2xl font-black">{t('Choose a new password')}</h1>
      <Suspense>
        <ResetForm />
      </Suspense>
    </div>
  );
}
