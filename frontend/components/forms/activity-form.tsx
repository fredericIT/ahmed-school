'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';
import { Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Field, SelectField } from '@/components/forms/field';
import { useClasses, useCurrency, useTerms } from '@/hooks/use-lookups';
import { api } from '@/lib/api';
import { cn, fullName, todayKigali } from '@/lib/utils';
import { isoDate } from '@/lib/validation';
import type { Activity, StudentListItem } from '@/types';
import { msg, t } from '@/lib/i18n';

export const CATEGORIES = [
  {
    value: 'SPORTS',
    get label() {
      return t('Sports');
    },
    emoji: '⚽',
  },
  {
    value: 'TRIP',
    get label() {
      return t('Trip');
    },
    emoji: '🚌',
  },
  {
    value: 'CELEBRATION',
    get label() {
      return t('Celebration');
    },
    emoji: '🎉',
  },
  {
    value: 'CULTURAL',
    get label() {
      return t('Cultural');
    },
    emoji: '🥁',
  },
  {
    value: 'ACADEMIC',
    get label() {
      return t('Academic');
    },
    emoji: '📖',
  },
  {
    value: 'HEALTH',
    get label() {
      return t('Health');
    },
    emoji: '🩺',
  },
  {
    value: 'PARENT_MEETING',
    get label() {
      return t('Parent meeting');
    },
    emoji: '👪',
  },
  {
    value: 'OTHER',
    get label() {
      return t('Other');
    },
    emoji: '✨',
  },
] as const;
export const categoryMeta = (c: string) => CATEGORIES.find((x) => x.value === c) ?? CATEGORIES[7];

const time = z.union([z.string().regex(/^\d{2}:\d{2}$/), z.literal('')]).optional();
const money = z.union([z.coerce.number().min(0), z.literal('')]).optional();

const schema = z
  .object({
    title: z.string().trim().min(2, msg('Title is required')).max(150),
    description: z.string().max(5000).optional(),
    category: z.enum(['SPORTS', 'TRIP', 'CELEBRATION', 'CULTURAL', 'ACADEMIC', 'HEALTH', 'PARENT_MEETING', 'OTHER']),
    date: isoDate,
    startTime: time,
    endTime: time,
    location: z.string().max(150).optional(),
    organizer: z.string().max(150).optional(),
    status: z.enum(['PLANNED', 'ONGOING', 'COMPLETED', 'CANCELLED']),
    budget: money,
    termId: z.number().nullable().optional(),
    classIds: z.array(z.number()),
  })
  .refine((v) => !v.startTime || !v.endTime || v.startTime < v.endTime, {
    get message() {
      return t('End time must be after start');
    },
    path: ['endTime'],
  });
export type ActivityValues = z.infer<typeof schema>;

export function toActivityPayload(v: ActivityValues, studentIds: number[]) {
  return {
    ...v,
    description: v.description || null,
    startTime: v.startTime || null,
    endTime: v.endTime || null,
    location: v.location || null,
    organizer: v.organizer || null,
    budget: v.budget === '' || v.budget === undefined ? null : Number(v.budget),
    studentIds,
  };
}

export function ActivityForm({
  activity,
  onSubmit,
  onCancel,
}: {
  activity?: Activity;
  onSubmit: (v: ActivityValues, studentIds: number[]) => Promise<void>;
  onCancel: () => void;
}) {
  const currency = useCurrency();
  const { data: classes } = useClasses();
  const { data: terms } = useTerms();
  const [students, setStudents] = useState<{ id: number; name: string }[]>(
    activity?.students.map((s) => ({ id: s.id, name: fullName(s) })) ?? [],
  );
  const [q, setQ] = useState('');
  const { data: found } = useQuery({
    queryKey: ['student-picker', q],
    queryFn: () => api.list<StudentListItem>('/students', { search: q, pageSize: 8 }),
    enabled: q.trim().length >= 2,
  });
  const { register, handleSubmit, control, watch, setValue, formState } = useForm<ActivityValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: activity?.title ?? '',
      description: activity?.description ?? '',
      category: activity?.category ?? 'ACADEMIC',
      date: activity?.date.slice(0, 10) ?? todayKigali(),
      startTime: activity?.startTime ?? '',
      endTime: activity?.endTime ?? '',
      location: activity?.location ?? '',
      organizer: activity?.organizer ?? '',
      status: activity?.status ?? 'PLANNED',
      budget: activity?.budget ?? '',
      termId: activity?.term?.id ?? null,
      classIds: activity?.classes.map((c) => c.id) ?? [],
    },
  });
  const e = formState.errors;
  const classIds = watch('classIds');
  const category = watch('category');

  return (
    <form
      noValidate
      onSubmit={handleSubmit((v) =>
        onSubmit(
          v,
          students.map((s) => s.id),
        ),
      )}
      className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]"
    >
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{t('Details')}</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label={t('Title')} htmlFor="a-title" required error={e.title} className="sm:col-span-2">
              <Input id="a-title" placeholder={t('e.g. Trip to Nyandungu Eco-Park')} {...register('title')} />
            </Field>
            <Field label={t('Category')} required className="sm:col-span-2">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label={t('Category')}>
                {CATEGORIES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    role="radio"
                    aria-checked={category === c.value}
                    onClick={() => setValue('category', c.value)}
                    className={cn(
                      'flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition',
                      category === c.value ? 'border-primary bg-primary/10 text-primary' : 'hover:bg-accent',
                    )}
                  >
                    <span aria-hidden>{c.emoji}</span> {c.label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label={t('Date')} htmlFor="a-date" required error={e.date}>
              <Input id="a-date" type="date" {...register('date')} />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label={t('Start')} htmlFor="a-start">
                <Input id="a-start" type="time" {...register('startTime')} />
              </Field>
              <Field label={t('End')} htmlFor="a-end" error={e.endTime}>
                <Input id="a-end" type="time" {...register('endTime')} />
              </Field>
            </div>
            <Field label={t('Location')} htmlFor="a-loc">
              <Input id="a-loc" {...register('location')} />
            </Field>
            <Field label={t('Organizer')} htmlFor="a-org">
              <Input id="a-org" {...register('organizer')} />
            </Field>
            <Field label={t('Description')} htmlFor="a-desc" className="sm:col-span-2">
              <Textarea id="a-desc" rows={4} {...register('description')} />
            </Field>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('Participants')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="mb-2 text-sm font-semibold">{t('Whole classes')}</p>
              <div className="flex flex-wrap gap-2">
                {classes?.map((c) => {
                  const on = classIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setValue('classIds', on ? classIds.filter((x) => x !== c.id) : [...classIds, c.id])
                      }
                      className={cn(
                        'rounded-full border px-3 py-1.5 text-sm font-semibold transition',
                        on ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-accent',
                      )}
                    >
                      {c.name}
                    </button>
                  );
                })}
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  onClick={() => setValue('classIds', classes?.map((c) => c.id) ?? [])}
                >
                  {t('Select all')}
                </Button>
              </div>
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold">{t('Specific students')}</p>
              <Input
                value={q}
                onChange={(ev) => setQ(ev.target.value)}
                placeholder={t('Search a student to add…')}
                aria-label={t('Search student')}
              />
              {found && q.length >= 2 && (
                <ul className="mt-2 max-h-48 divide-y overflow-auto rounded-xl border">
                  {found.data.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                        onClick={() => {
                          if (!students.some((x) => x.id === s.id))
                            setStudents([...students, { id: s.id, name: fullName(s) }]);
                          setQ('');
                        }}
                      >
                        <span className="font-medium">{fullName(s)}</span>
                        <span className="text-xs text-muted-foreground">{s.currentClass?.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                {students.map((s) => (
                  <Badge key={s.id} variant="purple" className="gap-1 py-1">
                    {s.name}
                    <button
                      type="button"
                      onClick={() => setStudents(students.filter((x) => x.id !== s.id))}
                      aria-label={t('Remove {name}', { name: s.name })}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>{t('Planning')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <SelectField
              control={control}
              name="status"
              label={t('Status')}
              options={[
                { value: 'PLANNED', label: t('Planned') },
                { value: 'ONGOING', label: t('Ongoing') },
                { value: 'COMPLETED', label: t('Completed') },
                { value: 'CANCELLED', label: t('Cancelled') },
              ]}
            />
            <SelectField
              control={control}
              name="termId"
              label={t('Term')}
              numeric
              allowEmpty={t('Detect from date')}
              options={(terms ?? []).map((term) => ({
                value: String(term.id),
                label: `${term.name} ${term.academicYear?.name ?? ''}`,
              }))}
            />
            <Field label={t('Budget ({currency})', { currency })} htmlFor="a-budget" error={e.budget as never}>
              <Input id="a-budget" type="number" min={0} step={500} {...register('budget')} />
            </Field>
          </CardContent>
        </Card>
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
            {t('Cancel')}
          </Button>
          <Button type="submit" className="flex-1" loading={formState.isSubmitting}>
            <Save aria-hidden /> {t('Save activity')}
          </Button>
        </div>
      </div>
    </form>
  );
}
