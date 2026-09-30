'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertTriangle, BadgeCheck, Eye, EyeOff, IdCard, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Field } from '@/components/forms/field';
import { api, errorMessage } from '@/lib/api';
import { passwordSchema } from '@/lib/validation';
import { msg, t, tRich } from '@/lib/i18n';

const schema = z
  .object({
    regNumber: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^\d{2}[A-Z]{2,3}\d{3,}$/, msg('Enter the registration number from your email, e.g. 26TR001')),
    password: passwordSchema,
    confirmPassword: z.string().min(1, msg('Confirm your password')),
  })
  .refine((v) => v.password === v.confirmPassword, {
    get message() {
      return t('Passwords do not match');
    },
    path: ['confirmPassword'],
  });
type Values = z.infer<typeof schema>;

function ActivateForm() {
  const token = useSearchParams().get('token') ?? '';
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const info = useQuery({
    queryKey: ['activation', token],
    queryFn: () => api.get<{ firstName: string }>('/auth/activation', { token }),
    enabled: token.length >= 20,
    retry: false,
  });
  const { register, handleSubmit, formState } = useForm<Values>({
    resolver: zodResolver(schema),
  });

  if (!token || info.isError) {
    return (
      <div className="mt-4 flex gap-3 rounded-xl bg-destructive/10 p-4 text-sm text-destructive">
        <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden />
        <p>
          {info.isError
            ? errorMessage(info.error)
            : t('Open the activation link from the email the school sent to your Gmail.')}
          {t('If you need a new link, contact the school administration.')}
        </p>
      </div>
    );
  }
  if (info.isLoading) return <Skeleton className="mt-6 h-64" />;

  return (
    <>
      <p className="mt-1 text-sm text-muted-foreground">
        {tRich('Welcome, {name}! Enter the registration number from your email and choose your password.', {
          name: <span className="font-semibold text-foreground">{info.data?.firstName}</span>,
        })}
      </p>
      {error && (
        <p role="alert" className="mt-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
          {error}
        </p>
      )}
      <form
        noValidate
        className="mt-6 space-y-4"
        onSubmit={handleSubmit(async (v) => {
          setError(null);
          try {
            await api.post('/auth/activate', { token, ...v });
            toast.success(t('Account activated'), {
              description: t('Sign in with {regNumber} and your new password.', { regNumber: v.regNumber }),
            });
            router.replace('/login');
          } catch (e) {
            setError(errorMessage(e));
          }
        })}
      >
        <Field
          label={t('Registration number')}
          htmlFor="regNumber"
          required
          error={formState.errors.regNumber}
          hint={t('As written in your email, e.g. 26TR001')}
        >
          <div className="relative">
            <IdCard
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="regNumber"
              autoComplete="username"
              autoCapitalize="characters"
              spellCheck={false}
              className="h-11 pl-9 font-mono uppercase tracking-wider"
              autoFocus
              {...register('regNumber')}
            />
          </div>
        </Field>
        <Field
          label={t('New password')}
          htmlFor="password"
          required
          error={formState.errors.password}
          hint={t('At least 8 characters with upper & lower case letters and a number')}
        >
          <div className="relative">
            <KeyRound
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="password"
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              className="h-11 pl-9 pr-10"
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-muted"
              aria-label={show ? t('Hide password') : t('Show password')}
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>
        <Field
          label={t('Confirm password')}
          htmlFor="confirmPassword"
          required
          error={formState.errors.confirmPassword}
        >
          <Input
            id="confirmPassword"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            className="h-11"
            {...register('confirmPassword')}
          />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting}>
          {!formState.isSubmitting && <BadgeCheck aria-hidden />} {t('Activate my account')}
        </Button>
      </form>
    </>
  );
}

export default function ActivatePage() {
  return (
    <div className="rounded-3xl border bg-card p-8 shadow-lift">
      <h1 className="font-heading text-2xl font-black">{t('Activate your account')}</h1>
      <Suspense>
        <ActivateForm />
      </Suspense>
      <Link href="/login" className="mt-6 inline-block text-sm font-semibold text-primary hover:underline">
        {t('Already activated? Sign in')}
      </Link>
    </div>
  );
}
