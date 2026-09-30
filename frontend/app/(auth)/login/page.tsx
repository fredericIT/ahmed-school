'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Lock, LogIn, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/forms/field';
import { api, errorMessage } from '@/lib/api';
import type { User } from '@/types';
import { msg, t } from '@/lib/i18n';

const schema = z.object({
  // Staff use their email; teachers use the registration number from their Gmail (e.g. 26TR001).
  email: z.string().trim().min(3, msg('Enter your email or registration number')),
  password: z.string().min(1, msg('Password is required')),
});
type Values = z.infer<typeof schema>;

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const qc = useQueryClient();
  const [show, setShow] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: Values) => {
    setServerError(null);
    try {
      const { user } = await api.post<{ user: User }>('/auth/login', {
        identifier: values.email,
        password: values.password,
      });
      qc.clear();
      toast.success(t('Welcome back'));
      const next = params.get('next');
      const home = user.role === 'TEACHER' ? '/my-classes' : '/dashboard';
      router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : home);
    } catch (e) {
      setServerError(errorMessage(e));
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <div className="rounded-3xl border bg-card p-8 shadow-lift">
        <h1 className="font-heading text-3xl font-black">
          {t('Welcome back')} <span aria-hidden>👋</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('Sign in to continue.')}</p>

        {params.get('expired') && !serverError && (
          <p className="mt-4 rounded-xl bg-sunny/15 px-3 py-2 text-sm font-medium text-sunny-700 dark:text-sunny">
            {t('Your session expired. Please sign in again.')}
          </p>
        )}
        {serverError && (
          <p role="alert" className="mt-4 rounded-xl bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
            {serverError}
          </p>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
          <Field
            label={t('Email or registration number')}
            htmlFor="email"
            error={formState.errors.email}
          >
            <div className="relative">
              <Mail
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id="email"
                type="text"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
                placeholder={t('you@school.rw or registration no.')}
                className="h-11 pl-9"
                aria-invalid={!!formState.errors.email}
                {...register('email')}
              />
            </div>
          </Field>
          <Field label={t('Password')} htmlFor="password" error={formState.errors.password}>
            <div className="relative">
              <Lock
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id="password"
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                className="h-11 pl-9 pr-10"
                aria-invalid={!!formState.errors.password}
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
          <div className="flex justify-end">
            <Link href="/forgot-password" className="text-sm font-semibold text-primary hover:underline">
              {t('Forgot password?')}
            </Link>
          </div>
          <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting}>
            {!formState.isSubmitting && <LogIn aria-hidden />}
            {t('Sign in')}
          </Button>
        </form>
      </div>
      <p className="mt-6 text-center text-xs font-medium text-white/85 drop-shadow">
        {t('Access is limited to school staff. All activity is logged.')}
      </p>
    </motion.div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
