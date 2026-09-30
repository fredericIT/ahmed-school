'use client';
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { KeyRound, Save, UserCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { HeroBanner } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { Field } from '@/components/forms/field';
import { ImageUpload } from '@/components/forms/image-upload';
import { ROLE_LABELS, useAuth } from '@/lib/auth';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime, fullName } from '@/lib/utils';
import { passwordSchema } from '@/lib/validation';
import { msg, t } from '@/lib/i18n';

const profileSchema = z.object({
  firstName: z.string().trim().min(1, msg('Required')),
  lastName: z.string().trim().min(1, msg('Required')),
  phone: z.string().trim().optional(),
});
const passwordForm = z
  .object({
    currentPassword: z.string().min(1, msg('Required')),
    newPassword: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, {
    get message() {
      return t('Passwords do not match');
    },
    path: ['confirm'],
  });

export default function ProfilePage() {
  const { user, can } = useAuth();
  const qc = useQueryClient();
  const profile = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
  });
  const pw = useForm<z.infer<typeof passwordForm>>({
    resolver: zodResolver(passwordForm),
    defaultValues: { currentPassword: '', newPassword: '', confirm: '' },
  });
  useEffect(() => {
    if (user)
      profile.reset({
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone ?? '',
      });
  }, [user, profile]);
  if (!user) return <Skeleton className="h-96 rounded-2xl" />;

  return (
    <div className="space-y-6">
      <HeroBanner>
        <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
          <ImageUpload
            value={user.avatar}
            shape="circle"
            label={t('Add photo')}
            className="h-24 w-24 border-4 border-solid border-white/40 bg-white/20 text-white"
            onUpload={async (file) => {
              const fd = new FormData();
              fd.append('file', file);
              try {
                await api.upload('/auth/avatar', fd);
                toast.success(t('Photo updated'));
                void qc.invalidateQueries({ queryKey: ['me'] });
              } catch (e) {
                toast.error(errorMessage(e));
                throw e;
              }
            }}
          />
          <div>
            <h1 className="font-heading text-3xl font-black">{fullName(user)}</h1>
            <p className="text-white/85">{user.email}</p>
            <div className="mt-2 flex items-center gap-2 text-sm text-white/80">
              <StatusBadge status={user.role} label={t(ROLE_LABELS[user.role])} className="bg-white/90" />
              {t('Last sign-in {date}', { date: formatDateTime(user.lastLoginAt) })}
            </div>
          </div>
        </div>
      </HeroBanner>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCircle className="h-5 w-5 text-primary" aria-hidden /> {t('Personal details')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form
              noValidate
              className="grid grid-cols-1 gap-4 sm:grid-cols-2"
              onSubmit={profile.handleSubmit(async (v) => {
                try {
                  await api.patch('/auth/profile', {
                    ...v,
                    phone: v.phone || null,
                  });
                  toast.success(t('Profile updated'));
                  void qc.invalidateQueries({ queryKey: ['me'] });
                } catch (e) {
                  toast.error(errorMessage(e));
                }
              })}
            >
              <Field label={t('First name')} htmlFor="p-first" error={profile.formState.errors.firstName}>
                <Input id="p-first" {...profile.register('firstName')} />
              </Field>
              <Field label={t('Last name')} htmlFor="p-last" error={profile.formState.errors.lastName}>
                <Input id="p-last" {...profile.register('lastName')} />
              </Field>
              <Field label={t('Phone')} htmlFor="p-phone">
                <Input id="p-phone" type="tel" {...profile.register('phone')} />
              </Field>
              <Field label={t('Email')} htmlFor="p-email" hint={t('Ask a super admin to change your email.')}>
                <Input id="p-email" value={user.email} disabled />
              </Field>
              <div className="sm:col-span-2">
                <Button type="submit" loading={profile.formState.isSubmitting}>
                  <Save aria-hidden /> {t('Save profile')}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
        {can('password.change') ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-primary" aria-hidden /> {t('Change password')}
              </CardTitle>
              <CardDescription>{t('Other devices will be signed out.')}</CardDescription>
            </CardHeader>
            <CardContent>
              <form
                noValidate
                className="space-y-4"
                onSubmit={pw.handleSubmit(async (v) => {
                  try {
                    await api.post('/auth/change-password', {
                      currentPassword: v.currentPassword,
                      newPassword: v.newPassword,
                    });
                    toast.success(t('Password changed'));
                    pw.reset();
                  } catch (e) {
                    toast.error(errorMessage(e));
                  }
                })}
              >
                <Field label={t('Current password')} htmlFor="cp" error={pw.formState.errors.currentPassword}>
                  <Input id="cp" type="password" autoComplete="current-password" {...pw.register('currentPassword')} />
                </Field>
                <Field
                  label={t('New password')}
                  htmlFor="np"
                  error={pw.formState.errors.newPassword}
                  hint={t('8+ characters, upper & lower case and a number')}
                >
                  <Input id="np" type="password" autoComplete="new-password" {...pw.register('newPassword')} />
                </Field>
                <Field label={t('Confirm new password')} htmlFor="cf" error={pw.formState.errors.confirm}>
                  <Input id="cf" type="password" autoComplete="new-password" {...pw.register('confirm')} />
                </Field>
                <Button type="submit" loading={pw.formState.isSubmitting}>
                  {t('Update password')}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-primary" aria-hidden /> {t('Password')}
              </CardTitle>
              <CardDescription>
                {t(
                  'Your password is managed by the school administration. Ask an administrator if you need a new one.',
                )}
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>
    </div>
  );
}
