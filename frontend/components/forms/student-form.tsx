'use client';
import { useEffect, useMemo, useState } from 'react';
import { useFieldArray, useForm, type FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Baby,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  HeartPulse,
  Link2,
  Plus,
  School,
  Trash2,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Checkbox, Progress } from '@/components/ui/misc';
import { Badge } from '@/components/ui/badge';
import { Field, SelectField } from '@/components/forms/field';
import { ImageUpload } from '@/components/forms/image-upload';
import { useClasses } from '@/hooks/use-lookups';
import { api } from '@/lib/api';
import { cn, formatDate, todayKigali } from '@/lib/utils';
import { isoDate, optionalText, phoneSchema } from '@/lib/validation';
import type { Guardian } from '@/types';
import { msg, t } from '@/lib/i18n';
import { enumLabel } from '@/lib/labels';

const guardianSchema = z.object({
  existingId: z.number().optional(),
  fullName: z.string().trim().min(2, msg('Full name is required')).max(150),
  relationship: z.string().trim().min(2, msg('Relationship is required')),
  phone: phoneSchema,
  altPhone: z.union([phoneSchema, z.literal('')]).optional(),
  email: z.union([z.string().trim().email(msg('Invalid email')), z.literal('')]).optional(),
  occupation: z.string().trim().max(100).optional(),
  address: z.string().trim().max(255).optional(),
  nationalId: z
    .union([
      z
        .string()
        .trim()
        .regex(/^\d{16}$/, msg('National ID has 16 digits')),
      z.literal(''),
    ])
    .optional(),
  isPrimary: z.boolean(),
  isEmergencyContact: z.boolean(),
  canPickUp: z.boolean(),
});

const schema = z.object({
  firstName: z.string().trim().min(1, msg('First name is required')).max(80),
  lastName: z.string().trim().min(1, msg('Last name is required')).max(80),
  gender: z.enum(['MALE', 'FEMALE'], {
    errorMap: () => ({ message: t('Select a gender') }),
  }),
  dateOfBirth: isoDate,
  nationality: optionalText(60),
  address: optionalText(255),
  previousSchool: optionalText(150),
  admissionDate: isoDate,
  bloodGroup: z.string().optional().nullable(),
  allergies: optionalText(2000),
  medicalNotes: optionalText(2000),
  specialNeeds: optionalText(2000),
  currentClassId: z
    .number({
      get invalid_type_error() {
        return t('Choose a class');
      },
      get required_error() {
        return t('Choose a class');
      },
    })
    .int()
    .positive(msg('Choose a class')),
  guardians: z.array(guardianSchema).min(1, msg('Add at least one guardian')),
});
export type StudentFormValues = z.infer<typeof schema>;

const STEPS = [
  {
    key: 'child',
    get title() {
      return t('Child info');
    },
    icon: Baby,
    fields: [
      'firstName',
      'lastName',
      'gender',
      'dateOfBirth',
      'nationality',
      'address',
      'previousSchool',
      'admissionDate',
    ],
  },
  {
    key: 'guardians',
    get title() {
      return t('Guardians');
    },
    icon: Users,
    fields: ['guardians'],
  },
  {
    key: 'medical',
    get title() {
      return t('Medical');
    },
    icon: HeartPulse,
    fields: ['bloodGroup', 'allergies', 'medicalNotes', 'specialNeeds'],
  },
  {
    key: 'class',
    get title() {
      return t('Class');
    },
    icon: School,
    fields: ['currentClassId'],
  },
  {
    key: 'review',
    get title() {
      return t('Review');
    },
    icon: ClipboardCheck,
    fields: [],
  },
] as const;

const BLOOD = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
// Stored in English; shown translated.
const RELATIONSHIPS = [
  msg('Mother'),
  msg('Father'),
  msg('Grandmother'),
  msg('Grandfather'),
  msg('Aunt'),
  msg('Uncle'),
  msg('Sibling'),
  msg('Guardian'),
  msg('Nanny'),
];

const emptyGuardian = (primary: boolean): StudentFormValues['guardians'][number] => ({
  fullName: '',
  relationship: primary ? t('Mother') : t('Father'),
  phone: '',
  altPhone: '',
  email: '',
  occupation: '',
  address: '',
  nationalId: '',
  isPrimary: primary,
  isEmergencyContact: primary,
  canPickUp: true,
});

/** Builds the API payload: existing guardians are linked by id, new ones are created. */
export function toPayload(v: StudentFormValues) {
  const { guardians, ...rest } = v;
  return {
    ...rest,
    bloodGroup: rest.bloodGroup || null,
    guardians: guardians.map((g) =>
      g.existingId
        ? { existingId: g.existingId, isPrimary: g.isPrimary }
        : {
            ...g,
            existingId: undefined,
            altPhone: g.altPhone || null,
            email: g.email || null,
            nationalId: g.nationalId || null,
            occupation: g.occupation || null,
            address: g.address || null,
          },
    ),
  };
}

export function StudentWizard({
  onSubmit,
}: {
  onSubmit: (values: StudentFormValues, photo: File | null) => Promise<void>;
}) {
  const [step, setStep] = useState(0);
  const [photo, setPhoto] = useState<File | null>(null);
  const { data: classes } = useClasses();
  const form = useForm<StudentFormValues>({
    resolver: zodResolver(schema),
    mode: 'onTouched',
    defaultValues: {
      firstName: '',
      lastName: '',
      nationality: t('Rwandan'),
      admissionDate: todayKigali(),
      guardians: [emptyGuardian(true)],
      bloodGroup: null,
    },
  });
  const { register, control, watch, setValue, trigger, formState, handleSubmit } = form;
  const guardians = useFieldArray({ control, name: 'guardians' });
  const dob = watch('dateOfBirth');
  const classId = watch('currentClassId');
  const values = watch();

  const { data: nextNumber } = useQuery({
    queryKey: ['next-admission'],
    queryFn: () => api.get<{ admissionNumber: string }>('/students/next-admission-number'),
  });
  const { data: suggestion } = useQuery({
    queryKey: ['age-suggestion', dob],
    queryFn: () =>
      api.get<{
        age: number;
        grade: string;
        gradeLabel: string;
        classes: { id: number; name: string }[];
      }>('/students/age-suggestion', { dateOfBirth: dob }),
    enabled: /^\d{4}-\d{2}-\d{2}$/.test(dob ?? ''),
  });

  // Pre-select the suggested class the first time we learn the child's age.
  useEffect(() => {
    if (suggestion?.classes.length && !form.getValues('currentClassId')) {
      const open = classes?.find((c) => suggestion.classes.some((s) => s.id === c.id) && c.availableSeats > 0);
      if (open) setValue('currentClassId', open.id);
    }
  }, [suggestion, classes, form, setValue]);

  const next = async () => {
    const ok = await trigger(STEPS[step].fields as unknown as (keyof StudentFormValues)[], { shouldFocus: true });
    if (!ok) {
      toast.error(t('Please fix the highlighted fields'));
      return;
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };

  const onInvalid = (errors: FieldErrors<StudentFormValues>) => {
    const first = STEPS.findIndex((s) => s.fields.some((f) => f in errors));
    if (first >= 0) setStep(first);
    toast.error(t('Some information is missing'));
  };

  const selectedClass = classes?.find((c) => c.id === classId);

  return (
    <form onSubmit={handleSubmit((v) => onSubmit(v, photo), onInvalid)} noValidate>
      {/* Stepper */}
      <Card className="mb-6 p-4">
        <ol className="flex items-center justify-between gap-2">
          {STEPS.map((s, i) => (
            <li key={s.key} className="flex flex-1 items-center gap-2 last:flex-none">
              <button
                type="button"
                onClick={() => i < step && setStep(i)}
                disabled={i > step}
                className={cn('flex items-center gap-2 rounded-xl p-1 text-left', i < step && 'cursor-pointer')}
                aria-current={i === step ? 'step' : undefined}
              >
                <span
                  className={cn(
                    'grid h-10 w-10 shrink-0 place-items-center rounded-xl border-2 transition-colors',
                    i < step && 'border-mint bg-mint text-slate-900',
                    i === step && 'border-primary bg-primary text-primary-foreground shadow-lift',
                    i > step && 'border-border text-muted-foreground',
                  )}
                >
                  {i < step ? <Check className="h-5 w-5" /> : <s.icon className="h-5 w-5" aria-hidden />}
                </span>
                <span className="hidden text-sm font-semibold md:block">
                  <span className="block text-[11px] font-medium text-muted-foreground">
                    {t('Step {number}', { number: i + 1 })}
                  </span>
                  {t(s.title)}
                </span>
              </button>
              {i < STEPS.length - 1 && (
                <span className={cn('h-0.5 flex-1 rounded-full', i < step ? 'bg-mint' : 'bg-border')} aria-hidden />
              )}
            </li>
          ))}
        </ol>
        <Progress value={((step + 1) / STEPS.length) * 100} className="mt-4 h-1.5 md:hidden" />
      </Card>

      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.2 }}
        >
          {step === 0 && (
            <Card>
              <CardContent className="grid grid-cols-1 gap-6 p-6 md:grid-cols-[auto_1fr]">
                <div className="flex flex-col items-center gap-2">
                  <ImageUpload onSelect={setPhoto} label={t('Child photo')} className="h-36 w-36" />
                  <p className="text-center text-xs text-muted-foreground">{t('JPG / PNG, max 2 MB')}</p>
                  {nextNumber && (
                    <Badge variant="default" className="mt-2">
                      {t('Adm. no. {admissionNumber}', { admissionNumber: nextNumber.admissionNumber })}
                    </Badge>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label={t('First name')} htmlFor="firstName" required error={formState.errors.firstName}>
                    <Input id="firstName" {...register('firstName')} aria-invalid={!!formState.errors.firstName} />
                  </Field>
                  <Field label={t('Last name')} htmlFor="lastName" required error={formState.errors.lastName}>
                    <Input id="lastName" {...register('lastName')} aria-invalid={!!formState.errors.lastName} />
                  </Field>
                  <Field label={t('Gender')} required error={formState.errors.gender}>
                    <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('Gender')}>
                      {(['MALE', 'FEMALE'] as const).map((g) => (
                        <button
                          key={g}
                          type="button"
                          role="radio"
                          aria-checked={values.gender === g}
                          onClick={() => setValue('gender', g, { shouldValidate: true })}
                          className={cn(
                            'h-10 rounded-xl border text-sm font-semibold transition',
                            values.gender === g
                              ? g === 'MALE'
                                ? 'border-royal bg-royal/10 text-royal'
                                : 'border-coral bg-coral/10 text-coral-700 dark:text-coral'
                              : 'hover:bg-accent',
                          )}
                        >
                          {g === 'MALE' ? t('Boy') : t('Girl')}
                        </button>
                      ))}
                    </div>
                  </Field>
                  <Field
                    label={t('Date of birth')}
                    htmlFor="dateOfBirth"
                    required
                    error={formState.errors.dateOfBirth}
                    hint={
                      suggestion
                        ? t('{age} years old · suggested: {gradeLabel}', {
                            age: suggestion.age,
                            gradeLabel: suggestion.gradeLabel,
                          })
                        : undefined
                    }
                  >
                    <Input
                      id="dateOfBirth"
                      type="date"
                      max={todayKigali()}
                      {...register('dateOfBirth')}
                      aria-invalid={!!formState.errors.dateOfBirth}
                    />
                  </Field>
                  <Field label={t('Nationality')} htmlFor="nationality">
                    <Input id="nationality" {...register('nationality')} />
                  </Field>
                  <Field
                    label={t('Admission date')}
                    htmlFor="admissionDate"
                    required
                    error={formState.errors.admissionDate}
                  >
                    <Input id="admissionDate" type="date" {...register('admissionDate')} />
                  </Field>
                  <Field label={t('Home address')} htmlFor="address" className="sm:col-span-2">
                    <Input id="address" placeholder={t('Sector, district')} {...register('address')} />
                  </Field>
                  <Field label={t('Previous school')} htmlFor="previousSchool" className="sm:col-span-2">
                    <Input
                      id="previousSchool"
                      placeholder={t('Leave empty if this is the first school')}
                      {...register('previousSchool')}
                    />
                  </Field>
                </div>
              </CardContent>
            </Card>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <GuardianSearch
                onPick={(g) => {
                  if (values.guardians.some((x) => x.existingId === g.id)) return;
                  const isFirstBlank =
                    values.guardians.length === 1 && !values.guardians[0].fullName && !values.guardians[0].existingId;
                  const entry = {
                    ...emptyGuardian(false),
                    existingId: g.id,
                    fullName: g.fullName,
                    relationship: g.relationship,
                    phone: g.phone,
                    email: g.email ?? '',
                    isEmergencyContact: g.isEmergencyContact,
                    canPickUp: g.canPickUp,
                    isPrimary: isFirstBlank,
                  };
                  if (isFirstBlank) guardians.replace([entry]);
                  else guardians.append(entry);
                  toast.success(t('{fullName} linked', { fullName: g.fullName }));
                }}
              />
              {typeof formState.errors.guardians?.message === 'string' && (
                <p className="text-sm font-medium text-destructive">{t(String(formState.errors.guardians.message))}</p>
              )}
              {guardians.fields.map((f, i) => {
                const errs = formState.errors.guardians?.[i];
                const g = values.guardians[i];
                const linked = !!g?.existingId;
                return (
                  <Card key={f.id} className={cn(g?.isPrimary && 'ring-2 ring-primary/40')}>
                    <CardContent className="space-y-4 p-6">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <p className="font-heading font-bold">{t('Guardian {number}', { number: i + 1 })}</p>
                          {g?.isPrimary && <Badge>{t('Primary')}</Badge>}
                          {linked && (
                            <Badge variant="purple">
                              <Link2 className="h-3 w-3" /> {t('Existing guardian')}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {!g?.isPrimary && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                values.guardians.forEach((_, j) => setValue(`guardians.${j}.isPrimary`, j === i))
                              }
                            >
                              {t('Make primary')}
                            </Button>
                          )}
                          {guardians.fields.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => guardians.remove(i)}
                              aria-label={t('Remove guardian {number}', { number: i + 1 })}
                            >
                              <Trash2 className="text-destructive" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <Field label={t('Full name')} htmlFor={`g${i}-name`} required error={errs?.fullName}>
                          <Input id={`g${i}-name`} disabled={linked} {...register(`guardians.${i}.fullName`)} />
                        </Field>
                        <Field label={t('Relationship')} htmlFor={`g${i}-rel`} required error={errs?.relationship}>
                          <Input
                            id={`g${i}-rel`}
                            list="relationships"
                            disabled={linked}
                            {...register(`guardians.${i}.relationship`)}
                          />
                        </Field>
                        <Field label={t('Phone')} htmlFor={`g${i}-phone`} required error={errs?.phone}>
                          <Input
                            id={`g${i}-phone`}
                            type="tel"
                            placeholder={t('+250 7xx xxx xxx')}
                            disabled={linked}
                            {...register(`guardians.${i}.phone`)}
                          />
                        </Field>
                        {!linked && (
                          <>
                            <Field label={t('Alternative phone')} htmlFor={`g${i}-alt`} error={errs?.altPhone}>
                              <Input id={`g${i}-alt`} type="tel" {...register(`guardians.${i}.altPhone`)} />
                            </Field>
                            <Field label={t('Email')} htmlFor={`g${i}-email`} error={errs?.email}>
                              <Input id={`g${i}-email`} type="email" {...register(`guardians.${i}.email`)} />
                            </Field>
                            <Field label={t('Occupation')} htmlFor={`g${i}-occ`}>
                              <Input id={`g${i}-occ`} {...register(`guardians.${i}.occupation`)} />
                            </Field>
                            <Field label={t('National ID')} htmlFor={`g${i}-nid`} error={errs?.nationalId}>
                              <Input
                                id={`g${i}-nid`}
                                inputMode="numeric"
                                maxLength={16}
                                {...register(`guardians.${i}.nationalId`)}
                              />
                            </Field>
                            <Field label={t('Address')} htmlFor={`g${i}-addr`} className="lg:col-span-2">
                              <Input id={`g${i}-addr`} {...register(`guardians.${i}.address`)} />
                            </Field>
                          </>
                        )}
                      </div>
                      {!linked && (
                        <div className="flex flex-wrap gap-6">
                          <label className="flex items-center gap-2 text-sm font-medium">
                            <Checkbox
                              checked={g?.isEmergencyContact}
                              onCheckedChange={(v) => setValue(`guardians.${i}.isEmergencyContact`, v === true)}
                            />
                            {t('Emergency contact')}
                          </label>
                          <label className="flex items-center gap-2 text-sm font-medium">
                            <Checkbox
                              checked={g?.canPickUp}
                              onCheckedChange={(v) => setValue(`guardians.${i}.canPickUp`, v === true)}
                            />
                            {t('Authorized to pick up the child')}
                          </label>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
              <datalist id="relationships">
                {RELATIONSHIPS.map((r) => (
                  <option key={r} value={t(r)} />
                ))}
              </datalist>
              {guardians.fields.length < 6 && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-dashed"
                  onClick={() => guardians.append(emptyGuardian(false))}
                >
                  <Plus aria-hidden /> {t('Add another guardian')}
                </Button>
              )}
            </div>
          )}

          {step === 2 && (
            <Card>
              <CardContent className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2">
                <Field label={t('Blood group')}>
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('Blood group')}>
                    {[...BLOOD, null].map((val) => {
                      const active = (values.bloodGroup ?? null) === val;
                      return (
                        <button
                          key={val ?? 'unknown'}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => setValue('bloodGroup', val)}
                          className={cn(
                            'h-9 min-w-12 rounded-lg border px-3 text-sm font-semibold',
                            active ? 'border-coral bg-coral/10 text-coral-700 dark:text-coral' : 'hover:bg-accent',
                          )}
                        >
                          {val ?? t('Unknown')}
                        </button>
                      );
                    })}
                  </div>
                </Field>
                <Field
                  label={t('Allergies')}
                  htmlFor="allergies"
                  hint={t('Food, medicine or other allergies the teachers must know about.')}
                >
                  <Textarea id="allergies" rows={2} {...register('allergies')} />
                </Field>
                <Field label={t('Medical notes')} htmlFor="medicalNotes" className="sm:col-span-2">
                  <Textarea
                    id="medicalNotes"
                    rows={3}
                    placeholder={t("Conditions, medication, doctor's instructions…")}
                    {...register('medicalNotes')}
                  />
                </Field>
                <Field label={t('Special needs')} htmlFor="specialNeeds" className="sm:col-span-2">
                  <Textarea
                    id="specialNeeds"
                    rows={3}
                    placeholder={t('Learning support, therapy, mobility…')}
                    {...register('specialNeeds')}
                  />
                </Field>
              </CardContent>
            </Card>
          )}

          {step === 3 && (
            <div className="space-y-4">
              {suggestion && (
                <p className="rounded-xl bg-sunny/15 px-4 py-3 text-sm font-medium text-sunny-700 dark:text-sunny">
                  {t('Based on age ({age} years), we suggest', { age: suggestion.age })}{' '}
                  <strong>{suggestion.gradeLabel}</strong>.
                </p>
              )}
              {typeof formState.errors.currentClassId?.message === 'string' && (
                <p className="text-sm font-medium text-destructive">
                  {t(String(formState.errors.currentClassId.message))}
                </p>
              )}
              <div
                className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
                role="radiogroup"
                aria-label={t('Class')}
              >
                {classes?.map((c) => {
                  const full = c.availableSeats <= 0;
                  const suggested = suggestion?.classes.some((s) => s.id === c.id);
                  const active = classId === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      disabled={full}
                      onClick={() =>
                        setValue('currentClassId', c.id, {
                          shouldValidate: true,
                        })
                      }
                      className={cn(
                        'relative rounded-2xl border-2 bg-card p-5 text-left shadow-soft transition disabled:cursor-not-allowed disabled:opacity-50',
                        active ? 'border-primary ring-4 ring-primary/15' : 'border-transparent hover:border-primary/40',
                      )}
                    >
                      {suggested && (
                        <Badge variant="amber" className="absolute right-3 top-3">
                          {t('Suggested')}
                        </Badge>
                      )}
                      <p className="font-heading text-lg font-bold">{c.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.level === 'NURSERY' ? t('Nursery') : t('Primary')} · {c.classTeacherName ?? t('No teacher')}{' '}
                        · {t('Room {room}', { room: c.room ?? '—' })}
                      </p>
                      <Progress
                        value={(c.studentCount / c.capacity) * 100}
                        className="mt-4"
                        indicatorClassName={full ? 'bg-destructive' : c.availableSeats <= 3 ? 'bg-sunny' : 'bg-mint'}
                      />
                      <p className="tabular mt-1.5 text-xs font-semibold text-muted-foreground">
                        {c.studentCount}/{c.capacity} ·{' '}
                        {full ? t('Full') : t('{availableSeats} seats left', { availableSeats: c.availableSeats })}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ReviewCard title={t('Child')} onEdit={() => setStep(0)}>
                <ReviewRow k={t('Name')} v={`${values.firstName} ${values.lastName}`} />
                <ReviewRow k={t('Gender')} v={values.gender ? enumLabel(values.gender) : ''} />
                <ReviewRow
                  k={t('Date of birth')}
                  v={
                    suggestion
                      ? t('{date} ({age} yrs)', { date: formatDate(values.dateOfBirth), age: suggestion.age })
                      : formatDate(values.dateOfBirth)
                  }
                />
                <ReviewRow k={t('Nationality')} v={values.nationality} />
                <ReviewRow k={t('Address')} v={values.address} />
                <ReviewRow k={t('Admission date')} v={formatDate(values.admissionDate)} />
                <ReviewRow k={t('Photo')} v={photo ? photo.name : t('Not provided')} />
              </ReviewCard>
              <ReviewCard title={t('Class & medical')} onEdit={() => setStep(3)}>
                <ReviewRow k={t('Class')} v={selectedClass?.name} />
                <ReviewRow k={t('Blood group')} v={values.bloodGroup ?? t('Unknown')} />
                <ReviewRow k={t('Allergies')} v={values.allergies} />
                <ReviewRow k={t('Medical notes')} v={values.medicalNotes} />
                <ReviewRow k={t('Special needs')} v={values.specialNeeds} />
              </ReviewCard>
              <ReviewCard title={t('Guardians')} onEdit={() => setStep(1)} className="lg:col-span-2">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {values.guardians.map((g, i) => (
                    <div key={i} className="rounded-xl bg-muted/50 p-3 text-sm">
                      <p className="font-semibold">
                        {g.fullName} <span className="font-normal text-muted-foreground">({g.relationship})</span>
                      </p>
                      <p className="tabular text-muted-foreground">{g.phone}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {g.isPrimary && <Badge>{t('Primary')}</Badge>}
                        {g.isEmergencyContact && <Badge variant="coral">{t('Emergency')}</Badge>}
                        <Badge variant={g.canPickUp ? 'green' : 'gray'}>
                          {g.canPickUp ? t('Can pick up') : t('No pick-up')}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              </ReviewCard>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="sticky bottom-0 z-10 -mx-4 mt-6 flex items-center justify-between gap-3 border-t bg-background/90 px-4 py-4 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border">
        <Button
          type="button"
          variant="outline"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
        >
          <ChevronLeft aria-hidden /> {t('Back')}
        </Button>
        <p className="hidden text-sm text-muted-foreground sm:block">
          {t('Step {number} of {count}:', { number: step + 1, count: STEPS.length })}{' '}
          <span className="font-semibold text-foreground">{t(STEPS[step].title)}</span>
        </p>
        {step < STEPS.length - 1 ? (
          <Button type="button" onClick={() => void next()}>
            {t('Next')} <ChevronRight aria-hidden />
          </Button>
        ) : (
          <Button type="submit" variant="mint" loading={formState.isSubmitting}>
            <Check aria-hidden /> {t('Register student')}
          </Button>
        )}
      </div>
    </form>
  );
}

function GuardianSearch({ onPick }: { onPick: (g: Guardian) => void }) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(timer);
  }, [q]);
  const { data } = useQuery({
    queryKey: ['guardian-search', debounced],
    queryFn: () =>
      api.get<
        (Guardian & {
          students: { student: { firstName: string; lastName: string } }[];
        })[]
      >('/students/guardians/search', { search: debounced }),
    enabled: debounced.length >= 2,
  });
  const results = useMemo(() => data ?? [], [data]);
  return (
    <Card className="p-4">
      <p className="text-sm font-semibold">{t('Sibling already at school?')}</p>
      <p className="text-xs text-muted-foreground">
        {t('Search an existing parent by name or phone to link them instead of typing again.')}
      </p>
      <Input
        className="mt-3"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('Search guardian name or phone…')}
        aria-label={t('Search existing guardian')}
      />
      {results.length > 0 && (
        <ul className="mt-2 divide-y rounded-xl border">
          {results.map((g) => (
            <li key={g.id} className="flex items-center justify-between gap-3 p-3 text-sm">
              <div className="min-w-0">
                <p className="font-semibold">
                  {g.fullName} <span className="font-normal text-muted-foreground">· {g.relationship}</span>
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {t('{phone} · Parent of', { phone: g.phone })}{' '}
                  {g.students.map((s) => s.student.firstName).join(', ') || '—'}
                </p>
              </div>
              <Button type="button" size="sm" variant="secondary" onClick={() => onPick(g)}>
                <Link2 aria-hidden /> {t('Link')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ReviewCard({
  title,
  onEdit,
  children,
  className,
}: {
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <p className="font-heading font-bold">{title}</p>
          <Button type="button" variant="link" size="sm" onClick={onEdit}>
            {t('Edit')}
          </Button>
        </div>
        <dl className="space-y-1.5">{children}</dl>
      </CardContent>
    </Card>
  );
}

function ReviewRow({ k, v }: { k: string; v?: string | null }) {
  return (
    <div className="grid grid-cols-[130px_1fr] gap-2 text-sm">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="font-medium">{v || '—'}</dd>
    </div>
  );
}
