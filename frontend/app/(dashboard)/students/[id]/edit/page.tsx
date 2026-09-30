'use client';
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Edit, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shared/page-header';
import { Field, SelectField } from '@/components/forms/field';
import { useClasses } from '@/hooks/use-lookups';
import { api, errorMessage } from '@/lib/api';
import { dateOnly, fullName } from '@/lib/utils';
import { isoDate, optionalText } from '@/lib/validation';
import type { Student } from '@/types';
import { msg, t } from '@/lib/i18n';

const schema = z.object({
  firstName: z.string().trim().min(1, msg('Required')).max(80),
  lastName: z.string().trim().min(1, msg('Required')).max(80),
  gender: z.enum(['MALE', 'FEMALE']),
  dateOfBirth: isoDate,
  admissionDate: isoDate,
  nationality: optionalText(60),
  address: optionalText(255),
  previousSchool: optionalText(150),
  bloodGroup: z.string().nullable().optional(),
  allergies: optionalText(2000),
  medicalNotes: optionalText(2000),
  specialNeeds: optionalText(2000),
  currentClassId: z.number().int().positive(),
});
type Values = z.infer<typeof schema>;

export default function EditStudentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: classes } = useClasses();
  const { data: s } = useQuery({
    queryKey: ['student', id],
    queryFn: () => api.get<Student>(`/students/${id}`),
  });
  const { register, handleSubmit, reset, control, formState } = useForm<Values>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (!s) return;
    reset({
      firstName: s.firstName,
      lastName: s.lastName,
      gender: s.gender,
      dateOfBirth: dateOnly(s.dateOfBirth),
      admissionDate: dateOnly(s.admissionDate),
      nationality: s.nationality,
      address: s.address,
      previousSchool: s.previousSchool,
      bloodGroup: s.bloodGroup,
      allergies: s.allergies,
      medicalNotes: s.medicalNotes,
      specialNeeds: s.specialNeeds,
      currentClassId: s.currentClassId ?? undefined,
    });
  }, [s, reset]);

  if (!s) return <Skeleton className="h-96 rounded-2xl" />;
  const e = formState.errors;

  return (
    <>
      <PageHeader
        title={t('Edit {name}', { name: fullName(s) })}
        description={t("Guardians are managed from the profile's Guardians tab.")}
        icon={<Edit />}
        breadcrumbs={[
          { label: t('Students'), href: '/students' },
          { label: fullName(s), href: `/students/${s.id}` },
          { label: t('Edit') },
        ]}
      />
      <form
        noValidate
        onSubmit={handleSubmit(async (v) => {
          try {
            await api.patch(`/students/${s.id}`, {
              ...v,
              bloodGroup: v.bloodGroup || null,
            });
            toast.success(t('Student updated'));
            await qc.invalidateQueries({ queryKey: ['student', id] });
            void qc.invalidateQueries({ queryKey: ['students'] });
            router.push(`/students/${s.id}`);
          } catch (err) {
            toast.error(errorMessage(err));
          }
        })}
        className="grid grid-cols-1 gap-4 lg:grid-cols-2"
      >
        <Card>
          <CardHeader>
            <CardTitle>{t('Child information')}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t('First name')} htmlFor="firstName" required error={e.firstName}>
              <Input id="firstName" {...register('firstName')} />
            </Field>
            <Field label={t('Last name')} htmlFor="lastName" required error={e.lastName}>
              <Input id="lastName" {...register('lastName')} />
            </Field>
            <SelectField
              control={control}
              name="gender"
              label={t('Gender')}
              required
              options={[
                { value: 'MALE', label: t('Boy') },
                { value: 'FEMALE', label: t('Girl') },
              ]}
            />
            <Field label={t('Date of birth')} htmlFor="dob" required error={e.dateOfBirth}>
              <Input id="dob" type="date" {...register('dateOfBirth')} />
            </Field>
            <Field label={t('Nationality')} htmlFor="nat">
              <Input id="nat" {...register('nationality')} />
            </Field>
            <Field label={t('Admission date')} htmlFor="adm" required error={e.admissionDate}>
              <Input id="adm" type="date" {...register('admissionDate')} />
            </Field>
            <Field label={t('Address')} htmlFor="addr" className="sm:col-span-2">
              <Input id="addr" {...register('address')} />
            </Field>
            <Field label={t('Previous school')} htmlFor="prev" className="sm:col-span-2">
              <Input id="prev" {...register('previousSchool')} />
            </Field>
            <SelectField
              control={control}
              name="currentClassId"
              label={t('Class')}
              required
              numeric
              className="sm:col-span-2"
              options={(classes ?? []).map((c) => ({
                value: String(c.id),
                label: `${c.name} (${c.studentCount}/${c.capacity})`,
              }))}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('Medical information')}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4">
            <SelectField
              control={control}
              name="bloodGroup"
              label={t('Blood group')}
              allowEmpty={t('Unknown')}
              options={['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((b) => ({ value: b, label: b }))}
            />
            <Field label={t('Allergies')} htmlFor="all">
              <Textarea id="all" rows={2} {...register('allergies')} />
            </Field>
            <Field label={t('Medical notes')} htmlFor="med">
              <Textarea id="med" rows={3} {...register('medicalNotes')} />
            </Field>
            <Field label={t('Special needs')} htmlFor="sn">
              <Textarea id="sn" rows={3} {...register('specialNeeds')} />
            </Field>
          </CardContent>
        </Card>
        <div className="flex justify-end gap-2 lg:col-span-2">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            {t('Cancel')}
          </Button>
          <Button type="submit" loading={formState.isSubmitting}>
            <Save aria-hidden /> {t('Save changes')}
          </Button>
        </div>
      </form>
    </>
  );
}
