'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  BookOpen,
  CalendarDays,
  CalendarRange,
  Check,
  Globe2,
  Plus,
  Save,
  School,
  Settings2,
  Star,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shared/page-header';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { RequirePermission } from '@/components/shared/require';
import { Field, SelectField, SwitchField } from '@/components/forms/field';
import { ImageUpload } from '@/components/forms/image-upload';
import { useYears } from '@/hooks/use-lookups';
import { api, errorMessage } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import type { AcademicYear, Holiday, SchoolSettings, Term } from '@/types';
import { LOCALES, msg, t } from '@/lib/i18n';

const settingsSchema = z.object({
  name: z.string().trim().min(2, msg('Required')),
  motto: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.union([z.string().email(msg('Invalid email')), z.literal('')]).optional(),
  website: z.string().optional(),
  currency: z.string().trim().min(2).max(10),
  timezone: z.string().trim().min(3),
  locale: z.enum(['en', 'fr', 'rw']),
  admissionPrefix: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9]{2,10}$/, msg('2–10 letters/digits')),
  allowWeekendAttendance: z.boolean(),
  chronicAbsenceThreshold: z.coerce.number().int().min(1).max(100),
  loanPeriodDays: z.coerce.number().int().min(1).max(90),
  maxBooksPerStudent: z.coerce.number().int().min(1).max(20),
  overdueFinePerDay: z.coerce.number().int().min(0),
  lostBookFine: z.coerce.number().int().min(0),
});
type SettingsValues = z.infer<typeof settingsSchema>;

function SettingsInner() {
  const qc = useQueryClient();
  const { data: s } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<SchoolSettings>('/settings'),
  });
  const form = useForm<SettingsValues>({
    resolver: zodResolver(settingsSchema),
  });
  useEffect(() => {
    if (s)
      form.reset({
        ...s,
        motto: s.motto ?? '',
        address: s.address ?? '',
        phone: s.phone ?? '',
        email: s.email ?? '',
        website: s.website ?? '',
      });
  }, [s, form]);

  const save = form.handleSubmit(async (v) => {
    try {
      await api.patch('/settings', {
        ...v,
        admissionPrefix: v.admissionPrefix.toUpperCase(),
        motto: v.motto || null,
        address: v.address || null,
        phone: v.phone || null,
        email: v.email || null,
        website: v.website || null,
      });
      toast.success(t('Settings saved'));
      void qc.invalidateQueries({ queryKey: ['settings'] });
      void qc.invalidateQueries({ queryKey: ['settings-public'] });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  });

  if (!s) return <Skeleton className="h-96 rounded-2xl" />;
  const e = form.formState.errors;
  const saveBar = (
    <div className="flex justify-end">
      <Button onClick={() => void save()} loading={form.formState.isSubmitting}>
        <Save aria-hidden /> {t('Save settings')}
      </Button>
    </div>
  );

  return (
    <>
      <PageHeader title={t('Settings')} description={t('School profile, calendar and rules.')} icon={<Settings2 />} />
      <Tabs defaultValue="school">
        <TabsList>
          <TabsTrigger value="school">
            <School aria-hidden /> {t('School')}
          </TabsTrigger>
          <TabsTrigger value="calendar">
            <CalendarRange aria-hidden /> {t('Years & terms')}
          </TabsTrigger>
          <TabsTrigger value="holidays">
            <CalendarDays aria-hidden /> {t('Holidays')}
          </TabsTrigger>
          <TabsTrigger value="rules">
            <BookOpen aria-hidden /> {t('Rules')}
          </TabsTrigger>
          <TabsTrigger value="regional">
            <Globe2 aria-hidden /> {t('Regional')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="school" className="space-y-4">
          <Card>
            <CardContent className="grid grid-cols-1 gap-6 p-6 md:grid-cols-[auto_1fr]">
              <div className="flex flex-col items-center gap-2">
                <ImageUpload
                  value={s.logo}
                  label={t('School logo')}
                  className="h-36 w-36"
                  onUpload={async (file) => {
                    const fd = new FormData();
                    fd.append('file', file);
                    try {
                      await api.upload('/settings/logo', fd);
                      toast.success(t('Logo updated'));
                      void qc.invalidateQueries({ queryKey: ['settings'] });
                      void qc.invalidateQueries({
                        queryKey: ['settings-public'],
                      });
                    } catch (err) {
                      toast.error(errorMessage(err));
                      throw err;
                    }
                  }}
                />
                <p className="max-w-[9rem] text-center text-xs text-muted-foreground">
                  {t('PNG or JPG appear on PDF reports and ID cards.')}
                </p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={t('School name')} htmlFor="s-name" required error={e.name} className="sm:col-span-2">
                  <Input id="s-name" {...form.register('name')} />
                </Field>
                <Field label={t('Motto')} htmlFor="s-motto" className="sm:col-span-2">
                  <Input id="s-motto" {...form.register('motto')} />
                </Field>
                <Field label={t('Address')} htmlFor="s-addr" className="sm:col-span-2">
                  <Input id="s-addr" {...form.register('address')} />
                </Field>
                <Field label={t('Phone')} htmlFor="s-phone">
                  <Input id="s-phone" {...form.register('phone')} />
                </Field>
                <Field label={t('Email')} htmlFor="s-email" error={e.email}>
                  <Input id="s-email" type="email" {...form.register('email')} />
                </Field>
                <Field label={t('Website')} htmlFor="s-web">
                  <Input id="s-web" {...form.register('website')} />
                </Field>
              </div>
            </CardContent>
          </Card>
          <Card className="flex items-center justify-between gap-3 p-4">
            <p className="text-sm text-muted-foreground">
              {t('Classes and their capacity are managed on the Classes page.')}
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href="/classes">{t('Manage classes')}</Link>
            </Button>
          </Card>
          {saveBar}
        </TabsContent>

        <TabsContent value="calendar">
          <YearsAndTerms />
        </TabsContent>
        <TabsContent value="holidays">
          <Holidays />
        </TabsContent>

        <TabsContent value="rules" className="space-y-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t('Attendance')}</CardTitle>
                <CardDescription>{t('Future dates and holidays are always blocked.')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <SwitchField
                  control={form.control}
                  name="allowWeekendAttendance"
                  label={t('Allow attendance on weekends')}
                  description={t('Turn on if the school runs Saturday classes.')}
                />
                <Field
                  label={t('Chronic absence threshold (%)')}
                  htmlFor="s-thr"
                  error={e.chronicAbsenceThreshold}
                  hint={t('Students below this attendance rate are flagged.')}
                >
                  <Input id="s-thr" type="number" min={1} max={100} {...form.register('chronicAbsenceThreshold')} />
                </Field>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t('Library')}</CardTitle>
                <CardDescription>{t('Fines are in {currency}.', { currency: s.currency })}</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={t('Loan period (days)')} htmlFor="s-loan" error={e.loanPeriodDays}>
                  <Input id="s-loan" type="number" min={1} {...form.register('loanPeriodDays')} />
                </Field>
                <Field label={t('Max books per student')} htmlFor="s-max" error={e.maxBooksPerStudent}>
                  <Input id="s-max" type="number" min={1} {...form.register('maxBooksPerStudent')} />
                </Field>
                <Field
                  label={t('Overdue fine per day')}
                  htmlFor="s-od"
                  error={e.overdueFinePerDay}
                  hint={t('0 = no late fees')}
                >
                  <Input id="s-od" type="number" min={0} {...form.register('overdueFinePerDay')} />
                </Field>
                <Field label={t('Lost book fine')} htmlFor="s-lost" error={e.lostBookFine}>
                  <Input id="s-lost" type="number" min={0} {...form.register('lostBookFine')} />
                </Field>
              </CardContent>
            </Card>
          </div>
          {saveBar}
        </TabsContent>

        <TabsContent value="regional" className="space-y-4">
          <Card>
            <CardContent className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2">
              <Field
                label={t('Currency')}
                htmlFor="s-cur"
                error={e.currency}
                hint={t('Shown on reports, costs and fines')}
              >
                <Input id="s-cur" {...form.register('currency')} />
              </Field>
              <Field label={t('Timezone')} htmlFor="s-tz" error={e.timezone} hint={t('IANA name, e.g. Africa/Kigali')}>
                <Input id="s-tz" {...form.register('timezone')} />
              </Field>
              <SelectField
                control={form.control}
                name="locale"
                label={t('Default language')}
                hint={t('Used on devices where nobody has chosen a language yet.')}
                // Each language is named in itself.
                options={LOCALES.map((l) => ({ value: l.code, label: l.label }))}
              />
              <Field
                label={t('Admission number prefix')}
                htmlFor="s-pre"
                error={e.admissionPrefix}
                hint={t('Numbers look like PREFIX-2026-0001')}
              >
                <Input id="s-pre" {...form.register('admissionPrefix')} />
              </Field>
            </CardContent>
          </Card>
          {saveBar}
        </TabsContent>
      </Tabs>
    </>
  );
}

// ─── Years & terms ───

function YearsAndTerms() {
  const qc = useQueryClient();
  const { data: years, isLoading } = useYears();
  const [dialog, setDialog] = useState<{ kind: 'year' } | { kind: 'term'; year: AcademicYear; term?: Term } | null>(
    null,
  );
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['years'] });
    void qc.invalidateQueries({ queryKey: ['terms'] });
    void qc.invalidateQueries({ queryKey: ['academic-current'] });
  };
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      toast.success(msg);
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  if (isLoading) return <Skeleton className="h-64 rounded-2xl" />;
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setDialog({ kind: 'year' })}>
          <Plus aria-hidden /> {t('New academic year')}
        </Button>
      </div>
      {years?.map((y) => (
        <Card key={y.id} className={y.isCurrent ? 'ring-2 ring-primary/40' : ''}>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="flex items-center gap-2">
                {y.name} {y.isCurrent && <Badge>{t('Current')}</Badge>}
              </CardTitle>
              <CardDescription>
                {formatDate(y.startDate)} – {formatDate(y.endDate)}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {!y.isCurrent && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    void run(
                      () => api.post(`/academic/years/${y.id}/set-current`),
                      t('{name} is now current', { name: y.name }),
                    )
                  }
                >
                  <Star aria-hidden /> {t('Set current')}
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={() => setDialog({ kind: 'term', year: y })}>
                <Plus aria-hidden /> {t('Term')}
              </Button>
              {!y.isCurrent && (
                <ConfirmDialog
                  title={t('Delete {name}?', { name: y.name })}
                  description={t('Only years without enrolments can be deleted.')}
                  confirmLabel={t('Delete')}
                  onConfirm={() => run(() => api.delete(`/academic/years/${y.id}`), t('Year deleted'))}
                  trigger={
                    <Button variant="ghost" size="icon-sm" aria-label={t('Delete {name}', { name: y.name })}>
                      <Trash2 className="text-destructive" />
                    </Button>
                  }
                />
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {y.terms.map((term) => (
                <div
                  key={term.id}
                  className={`rounded-xl border p-4 ${term.isCurrent ? 'border-primary bg-primary/5' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-heading font-bold">{term.name}</p>
                    {term.isCurrent ? (
                      <Badge variant="green">
                        <Check className="h-3 w-3" /> {t('Current')}
                      </Badge>
                    ) : (
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0"
                        onClick={() =>
                          void run(
                            () => api.post(`/academic/terms/${term.id}/set-current`),
                            t('{name} is now current', { name: term.name }),
                          )
                        }
                      >
                        {t('Set current')}
                      </Button>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(term.startDate)} – {formatDate(term.endDate)}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => setDialog({ kind: 'term', year: y, term: term })}
                    >
                      {t('Edit')}
                    </Button>
                    {!term.isCurrent && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-destructive"
                        onClick={() => void run(() => api.delete(`/academic/terms/${term.id}`), t('Term deleted'))}
                      >
                        {t('Delete')}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
              {!y.terms.length && <p className="text-sm text-muted-foreground">{t('No terms yet.')}</p>}
            </div>
          </CardContent>
        </Card>
      ))}
      {dialog && <PeriodDialog dialog={dialog} onClose={() => setDialog(null)} onSaved={refresh} />}
    </div>
  );
}

function PeriodDialog({
  dialog,
  onClose,
  onSaved,
}: {
  dialog: { kind: 'year' } | { kind: 'term'; year: AcademicYear; term?: Term };
  onClose: () => void;
  onSaved: () => void;
}) {
  const term = dialog.kind === 'term' ? dialog.term : undefined;
  const [name, setName] = useState(
    term?.name ?? (dialog.kind === 'term' ? t('Term {number}', { number: dialog.year.terms.length + 1 }) : ''),
  );
  const [start, setStart] = useState(term?.startDate.slice(0, 10) ?? '');
  const [end, setEnd] = useState(term?.endDate.slice(0, 10) ?? '');
  const [current, setCurrent] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {dialog.kind === 'year'
              ? t('New academic year')
              : term
                ? t('Edit {name}', { name: term.name })
                : t('New term in {name}', { name: dialog.year.name })}
          </DialogTitle>
        </DialogHeader>
        <Field label={t('Name')} htmlFor="p-name" hint={dialog.kind === 'year' ? 'e.g. 2027-2028' : undefined}>
          <Input id="p-name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('Start')} htmlFor="p-start">
            <Input id="p-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label={t('End')} htmlFor="p-end">
            <Input id="p-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
        {!term && (
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={current}
              onChange={(e) => setCurrent(e.target.checked)}
              className="h-4 w-4 accent-[hsl(var(--primary))]"
            />
            {t('Make this current')}
          </label>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('Cancel')}
          </Button>
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                if (dialog.kind === 'year')
                  await api.post('/academic/years', {
                    name,
                    startDate: start,
                    endDate: end,
                    isCurrent: current,
                  });
                else if (term)
                  await api.patch(`/academic/terms/${term.id}`, {
                    name,
                    startDate: start,
                    endDate: end,
                  });
                else
                  await api.post('/academic/terms', {
                    academicYearId: dialog.year.id,
                    name,
                    startDate: start,
                    endDate: end,
                    isCurrent: current,
                  });
                toast.success(t('Saved'));
                onSaved();
                onClose();
              } catch (e) {
                toast.error(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {t('Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Holidays() {
  const qc = useQueryClient();
  const [year, setYear] = useState(new Date().getFullYear());
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const { data } = useQuery({
    queryKey: ['holidays', year],
    queryFn: () => api.get<Holiday[]>('/academic/holidays', { year }),
  });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['holidays'] });
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle>{t('Public holidays & school closures')}</CardTitle>
          <CardDescription>{t('Attendance cannot be recorded on these days.')}</CardDescription>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => setYear(year - 1)} aria-label={t('Previous year')}>
            ‹
          </Button>
          <span className="tabular w-14 text-center font-bold">{year}</span>
          <Button variant="outline" size="sm" onClick={() => setYear(year + 1)} aria-label={t('Next year')}>
            ›
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="flex flex-wrap gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name || !date) return;
            try {
              await api.post('/academic/holidays', { name, date });
              toast.success(t('Holiday added'));
              setName('');
              setDate('');
              refresh();
            } catch (err) {
              toast.error(errorMessage(err));
            }
          }}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('Holiday name')}
            className="flex-1"
            aria-label={t('Holiday name')}
          />
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-44"
            aria-label={t('Holiday date')}
          />
          <Button type="submit" disabled={!name || !date}>
            <Plus aria-hidden /> {t('Add')}
          </Button>
        </form>
        <ul className="divide-y rounded-xl border">
          {data?.map((h) => (
            <li key={h.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span>
                <span className="tabular mr-3 font-semibold">{formatDate(h.date)}</span>
                {h.name}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('Remove {name}', { name: h.name })}
                onClick={async () => {
                  try {
                    await api.delete(`/academic/holidays/${h.id}`);
                    refresh();
                  } catch (e) {
                    toast.error(errorMessage(e));
                  }
                }}
              >
                <Trash2 className="text-destructive" />
              </Button>
            </li>
          ))}
          {!data?.length && (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground">
              {t('No holidays for {year}.', { year })}
            </li>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  return (
    <RequirePermission permission="settings.manage">
      <SettingsInner />
    </RequirePermission>
  );
}
