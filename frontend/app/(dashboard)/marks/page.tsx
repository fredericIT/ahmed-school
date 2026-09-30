'use client';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowLeft,
  BarChart3,
  ClipboardList,
  FileText,
  GraduationCap,
  NotebookPen,
  Pencil,
  Plus,
  Save,
  Trash2,
  Undo2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Checkbox, Progress, UserAvatar } from '@/components/ui/misc';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PageHeader } from '@/components/shared/page-header';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState, ErrorState } from '@/components/shared/empty-state';
import { ExportMenu } from '@/components/shared/export-menu';
import { ReportTable } from '@/components/tables/report-table';
import { Field, SelectField } from '@/components/forms/field';
import { useClasses } from '@/hooks/use-lookups';
import { useAuth } from '@/lib/auth';
import { api, errorMessage } from '@/lib/api';
import { cn, formatDate, formatPercent, fullName, todayKigali } from '@/lib/utils';
import type { Assessment, AssessmentSheet, AssessmentType, MarksOptions, Report } from '@/types';
import { msg, t, tRich } from '@/lib/i18n';

const TYPE_BADGE: Record<AssessmentType, 'blue' | 'purple' | 'amber' | 'green' | 'coral' | 'default'> = {
  CLASSWORK: 'blue',
  HOMEWORK: 'purple',
  QUIZ: 'amber',
  TEST: 'green',
  PROJECT: 'coral',
  EXAM: 'default',
};

function pctClass(p: number | null) {
  if (p === null) return 'text-muted-foreground';
  return p < 50
    ? 'text-red-600 dark:text-red-400'
    : p < 70
      ? 'text-amber-600 dark:text-amber-400'
      : 'text-emerald-600 dark:text-emerald-400';
}

/** Page state lives in the URL, so views can be shared and the back button works. */
function useMarksParams(options?: MarksOptions) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const set = (patch: Record<string, string | undefined>) => {
    const n = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) n.set(k, v);
      else n.delete(k);
    }
    router.replace(`${pathname}?${n.toString()}`, { scroll: false });
  };
  const termId = sp.get('termId') ?? options?.currentTermId?.toString();
  const pairKey =
    sp.get('pair') ?? (options?.pairs[0] ? `${options.pairs[0].classId}-${options.pairs[0].courseId}` : undefined);
  const pair = options?.pairs.find((p) => `${p.classId}-${p.courseId}` === pairKey);
  return {
    tab: sp.get('tab') ?? 'assessments',
    termId,
    pair,
    pairKey,
    assessmentId: sp.get('assessment') ?? undefined,
    classId: sp.get('classId') ?? undefined,
    set,
  };
}

// ─── Selectors ───

function TermSelect({
  options,
  value,
  onChange,
}: {
  options: MarksOptions;
  value?: string;
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-10 w-full sm:w-64" aria-label={t('Term')}>
        <SelectValue placeholder={t('Term')} />
      </SelectTrigger>
      <SelectContent>
        {options.terms.map((term) => (
          <SelectItem key={term.id} value={String(term.id)}>
            {term.isCurrent
              ? t('{term} · {year} (current)', { term: term.name, year: term.yearName })
              : `${term.name} · ${term.yearName}`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function PairSelect({
  options,
  value,
  onChange,
}: {
  options: MarksOptions;
  value?: string;
  onChange: (v: string) => void;
}) {
  const byClass = useMemo(() => {
    const m = new Map<string, MarksOptions['pairs']>();
    for (const p of options.pairs) m.set(p.className, [...(m.get(p.className) ?? []), p]);
    return [...m.entries()];
  }, [options.pairs]);
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-10 w-full sm:w-80" aria-label={t('Class and course')}>
        <SelectValue placeholder={t('Class and course')} />
      </SelectTrigger>
      <SelectContent>
        {byClass.map(([className, pairs]) => (
          <SelectGroup key={className}>
            <div className="px-2 pb-1 pt-2 font-heading text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              {className}
            </div>
            {pairs.map((p) => (
              <SelectItem key={`${p.classId}-${p.courseId}`} value={`${p.classId}-${p.courseId}`}>
                {p.className} · {p.courseName}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

// ─── Assessment dialog ───

const assessmentSchema = z.object({
  title: z.string().trim().min(2, msg('At least 2 characters')).max(120),
  type: z.enum(['CLASSWORK', 'HOMEWORK', 'QUIZ', 'TEST', 'PROJECT', 'EXAM']),
  date: z.string().min(1, msg('Required')),
  maxScore: z.coerce
    .number({
      get invalid_type_error() {
        return t('Enter a number');
      },
    })
    .positive(msg('Must be above 0'))
    .max(1000),
  description: z.string().trim().max(255).optional(),
});
type AssessmentValues = z.infer<typeof assessmentSchema>;

function AssessmentDialog({
  options,
  termId,
  classId,
  courseId,
  editing,
  onClose,
  onSaved,
}: {
  options: MarksOptions;
  termId: number;
  classId: number;
  courseId: number;
  editing?: Assessment;
  onClose: () => void;
  onSaved: (a: Assessment) => void;
}) {
  const term = options.terms.find((x) => x.id === termId);
  const today = todayKigali();
  const defaultDate = term && today >= term.startDate && today <= term.endDate ? today : (term?.startDate ?? today);
  const { register, control, handleSubmit, formState } = useForm<AssessmentValues>({
    resolver: zodResolver(assessmentSchema),
    defaultValues: editing
      ? {
          title: editing.title,
          type: editing.type,
          date: editing.date,
          maxScore: editing.maxScore,
          description: editing.description ?? '',
        }
      : {
          title: '',
          type: 'CLASSWORK',
          date: defaultDate,
          maxScore: 10,
          description: '',
        },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? t('Edit assessment') : t('New assessment')}</DialogTitle>
          <DialogDescription>
            {t(
              "Every assessment counts towards the term result: a pupil's course result is the total of their marks divided by the total possible.",
            )}
          </DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={handleSubmit(async (v) => {
            try {
              const body = { ...v, description: v.description || null };
              const saved = editing
                ? await api.patch<Assessment>(`/marks/assessments/${editing.id}`, body)
                : await api.post<Assessment>('/marks/assessments', {
                    ...body,
                    termId,
                    classId,
                    courseId,
                  });
              toast.success(editing ? t('Assessment updated') : t('Assessment created'));
              onSaved(saved);
            } catch (e) {
              toast.error(errorMessage(e));
            }
          })}
        >
          <Field
            label={t('Title')}
            htmlFor="as-title"
            required
            error={formState.errors.title}
            className="sm:col-span-2"
          >
            <Input id="as-title" placeholder={t('e.g. Addition and subtraction test')} {...register('title')} />
          </Field>
          <SelectField
            control={control}
            name="type"
            label={t('Type')}
            required
            options={Object.entries(options.typeLabels).map(([value, label]) => ({ value, label }))}
          />
          <Field label={t('Date')} htmlFor="as-date" required error={formState.errors.date}>
            <Input id="as-date" type="date" min={term?.startDate} max={term?.endDate} {...register('date')} />
          </Field>
          <Field label={t('Marked out of')} htmlFor="as-max" required error={formState.errors.maxScore}>
            <Input id="as-max" type="number" min={1} step="0.5" inputMode="decimal" {...register('maxScore')} />
          </Field>
          <Field label={t('Notes')} htmlFor="as-desc" error={formState.errors.description}>
            <Input id="as-desc" placeholder={t('Optional')} {...register('description')} />
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t('Cancel')}
            </Button>
            <Button type="submit" loading={formState.isSubmitting}>
              <Save aria-hidden /> {editing ? t('Save changes') : t('Create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Assessments list ───

function AssessmentList({
  options,
  termId,
  classId,
  courseId,
  onOpen,
}: {
  options: MarksOptions;
  termId: number;
  classId: number;
  courseId: number;
  onOpen: (id: number) => void;
}) {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<{ editing?: Assessment } | null>(null);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['assessments', termId, classId, courseId],
    queryFn: () =>
      api.get<Assessment[]>('/marks/assessments', {
        termId,
        classId,
        courseId,
      }),
  });
  const refresh = () =>
    qc.invalidateQueries({
      predicate: (q) => ['assessments', 'course-results', 'class-results'].includes(String(q.queryKey[0])),
    });

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div>
          <p className="font-heading font-bold">{t('Assessments')}</p>
          <p className="text-sm text-muted-foreground">
            {t('Classwork, homework, quizzes, tests, projects and exams for this term.')}
          </p>
        </div>
        <Button onClick={() => setDialog({})}>
          <Plus aria-hidden /> {t('New assessment')}
        </Button>
      </div>
      {error ? (
        <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={t('No assessments yet')}
          description={t("Create the first assessment for this course, then enter each pupil's marks.")}
          action={
            <Button onClick={() => setDialog({})}>
              <Plus aria-hidden /> {t('New assessment')}
            </Button>
          }
        />
      ) : (
        <ul className="divide-y">
          {data.map((a) => {
            const done = a.rosterSize ? Math.round((a.markedCount / a.rosterSize) * 100) : 0;
            return (
              <li
                key={a.id}
                className="grid items-center gap-3 p-4 md:grid-cols-[minmax(220px,1.6fr)_minmax(160px,1fr)_90px_auto]"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={TYPE_BADGE[a.type]}>{options.typeLabels[a.type]}</Badge>
                    <span className="text-xs text-muted-foreground">
                      {t('{date} · out of {maxScore}', { date: formatDate(a.date), maxScore: a.maxScore })}
                    </span>
                  </div>
                  <button
                    onClick={() => onOpen(a.id)}
                    className="mt-1 block truncate text-left font-semibold hover:text-primary"
                  >
                    {a.title}
                  </button>
                </div>
                <div>
                  <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                    <span>{t('Marked')}</span>
                    <span className="tabular">
                      {a.markedCount} / {a.rosterSize}
                    </span>
                  </div>
                  <Progress
                    value={done}
                    indicatorClassName={done === 100 ? 'bg-emerald-500' : undefined}
                    aria-label={t('{percent} marked', { percent: formatPercent(done) })}
                  />
                </div>
                <div className="text-right md:text-center">
                  <p className="font-heading text-[11px] uppercase tracking-wide text-muted-foreground">
                    {t('Average')}
                  </p>
                  <p className={cn('tabular font-heading font-extrabold', pctClass(a.averagePct))}>
                    {formatPercent(a.averagePct, 1)}
                  </p>
                </div>
                <div className="flex justify-end gap-1">
                  <Button size="sm" onClick={() => onOpen(a.id)}>
                    <NotebookPen aria-hidden /> {a.markedCount ? t('Edit marks') : t('Enter marks')}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setDialog({ editing: a })}
                    aria-label={t('Edit {title}', { title: a.title })}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <ConfirmDialog
                    title={t('Delete "{title}"?', { title: a.title })}
                    description={t('Its marks will no longer count in results or report cards.')}
                    confirmLabel={t('Delete')}
                    onConfirm={async () => {
                      try {
                        await api.delete(`/marks/assessments/${a.id}`);
                        toast.success(t('Assessment deleted'));
                        refresh();
                      } catch (e) {
                        toast.error(errorMessage(e));
                      }
                    }}
                    trigger={
                      <Button size="icon" variant="ghost" aria-label={t('Delete {title}', { title: a.title })}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    }
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {dialog && (
        <AssessmentDialog
          options={options}
          termId={termId}
          classId={classId}
          courseId={courseId}
          editing={dialog.editing}
          onClose={() => setDialog(null)}
          onSaved={(a) => {
            setDialog(null);
            refresh();
            if (!dialog.editing) onOpen(a.id);
          }}
        />
      )}
    </Card>
  );
}

// ─── Marks entry sheet ───

interface Row {
  score: string;
  absent: boolean;
  remark: string;
}

function MarksSheet({ id, onBack }: { id: number; onBack: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['assessment', id],
    queryFn: () => api.get<AssessmentSheet>(`/marks/assessments/${id}`),
  });
  const initial = useMemo(() => {
    const m: Record<number, Row> = {};
    for (const s of data?.students ?? [])
      m[s.id] = {
        score: s.mark?.score?.toString() ?? '',
        absent: s.mark?.absent ?? false,
        remark: s.mark?.remark ?? '',
      };
    return m;
  }, [data]);
  const [rows, setRows] = useState<Record<number, Row>>({});
  const [saving, setSaving] = useState(false);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  useEffect(() => setRows(initial), [initial]);

  const same = (a?: Row, b?: Row) =>
    !!a && !!b && a.score.trim() === b.score.trim() && a.absent === b.absent && a.remark.trim() === b.remark.trim();
  const changed = Object.keys(rows)
    .map(Number)
    .filter((sid) => !same(rows[sid], initial[sid]));
  const invalid = (r?: Row) => {
    if (!r || r.absent || r.score.trim() === '') return null;
    const n = Number(r.score);
    if (!Number.isFinite(n) || n < 0) return t('Not a valid mark');
    if (data && n > data.maxScore) return t('Above {max}', { max: data.maxScore });
    return null;
  };
  const errors = Object.keys(rows)
    .map(Number)
    .filter((sid) => invalid(rows[sid]));
  const entered = Object.values(rows).filter((r) => r.absent || r.score.trim() !== '').length;
  const scores = Object.values(rows)
    .filter((r) => !r.absent && r.score.trim() !== '' && !invalid(r))
    .map((r) => Number(r.score));
  const average =
    scores.length && data ? (scores.reduce((a, b) => a + b, 0) / scores.length / data.maxScore) * 100 : null;

  const update = (sid: number, patch: Partial<Row>) => setRows((r) => ({ ...r, [sid]: { ...r[sid], ...patch } }));

  const save = async () => {
    if (errors.length) {
      toast.error(t('Fix the highlighted marks first'));
      return;
    }
    setSaving(true);
    try {
      const res = await api.put<{ saved: number; cleared: number }>(`/marks/assessments/${id}/marks`, {
        marks: changed.map((sid) => ({
          studentId: sid,
          score: rows[sid].absent || rows[sid].score.trim() === '' ? null : Number(rows[sid].score),
          absent: rows[sid].absent,
          remark: rows[sid].remark.trim() || null,
        })),
      });
      toast.success(t('Marks saved'), {
        description: res.cleared
          ? t('{saved} saved, {cleared} cleared', { saved: res.saved, cleared: res.cleared })
          : t('{saved} saved', { saved: res.saved }),
      });
      await refetch();
      qc.invalidateQueries({
        predicate: (q) => ['assessments', 'course-results', 'class-results'].includes(String(q.queryKey[0])),
      });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const back = () => {
    if (changed.length && !window.confirm(t('Leave without saving your changes?'))) return;
    onBack();
  };

  if (error) return <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />;
  if (isLoading || !data)
    return (
      <Card className="space-y-2 p-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </Card>
    );

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b p-4">
        <div className="flex min-w-0 items-start gap-3">
          <Button variant="ghost" size="icon" onClick={back} aria-label={t('Back to assessments')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <p className="truncate font-heading text-lg font-bold">{data.title}</p>
            <p className="text-sm text-muted-foreground">
              {tRich('{className} · {courseName} · {date} · marked out of {max}', {
                className: data.className,
                courseName: data.courseName,
                date: formatDate(data.date),
                max: <strong>{data.maxScore}</strong>,
              })}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="gray" className="tabular">
            {t('{entered} / {count} entered', { entered, count: data.students.length })}
          </Badge>
          <Badge variant="outline" className={cn('tabular', pctClass(average))}>
            {t('Average {percent}', { percent: formatPercent(average, 1) })}
          </Badge>
          <Button variant="outline" onClick={() => setRows(initial)} disabled={!changed.length || saving}>
            <Undo2 aria-hidden /> {t('Undo')}
          </Button>
          <Button onClick={save} loading={saving} disabled={!changed.length}>
            <Save aria-hidden /> {changed.length ? t('Save ({count})', { count: changed.length }) : t('Save')}
          </Button>
        </div>
      </div>
      {data.students.length === 0 ? (
        <EmptyState icon={GraduationCap} title={t('No pupils in this class')} />
      ) : (
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/60 font-heading text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2.5 text-left font-bold">
                  {t('Pupil')}
                </th>
                <th scope="col" className="px-3 py-2.5 text-left font-bold">
                  {t('Mark')}
                </th>
                <th scope="col" className="px-3 py-2.5 text-center font-bold">
                  {t('Absent')}
                </th>
                <th scope="col" className="px-3 py-2.5 text-left font-bold">
                  {t('Remark')}
                </th>
                <th scope="col" className="px-4 py-2.5 text-right font-bold">
                  %
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.students.map((s, i) => {
                const r = rows[s.id] ?? {
                  score: '',
                  absent: false,
                  remark: '',
                };
                const err = invalid(r);
                const pct = !r.absent && r.score.trim() !== '' && !err ? (Number(r.score) / data.maxScore) * 100 : null;
                const dirty = !same(r, initial[s.id]);
                return (
                  <tr key={s.id} className={cn(dirty && 'bg-sunny/10')}>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-3">
                        <UserAvatar src={s.photo} name={fullName(s)} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{fullName(s)}</p>
                          <p className="text-xs text-muted-foreground">{s.admissionNumber}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Input
                          ref={(el) => {
                            inputs.current[i] = el;
                          }}
                          type="number"
                          inputMode="decimal"
                          min={0}
                          max={data.maxScore}
                          step="0.5"
                          value={r.absent ? '' : r.score}
                          disabled={r.absent}
                          placeholder={r.absent ? t('ABS') : '—'}
                          onChange={(e) => update(s.id, { score: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              inputs.current[i + 1]?.focus();
                            }
                          }}
                          aria-label={t('Mark for {name}', { name: fullName(s) })}
                          aria-invalid={!!err}
                          className={cn('tabular h-9 w-24', err && 'border-destructive focus-visible:ring-destructive')}
                        />
                        <span className="text-xs text-muted-foreground">/ {data.maxScore}</span>
                      </div>
                      {err && (
                        <p role="alert" className="mt-1 text-xs font-medium text-destructive">
                          {err}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Checkbox
                        checked={r.absent}
                        onCheckedChange={(v) => update(s.id, { absent: v === true })}
                        aria-label={t('{name} was absent (excused)', { name: fullName(s) })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={r.remark}
                        maxLength={255}
                        placeholder={t('Optional')}
                        onChange={(e) => update(s.id, { remark: e.target.value })}
                        aria-label={t('Remark for {name}', { name: fullName(s) })}
                        className="h-9"
                      />
                    </td>
                    <td className={cn('tabular px-4 py-2 text-right font-semibold', pctClass(pct))}>
                      {pct === null ? (r.absent ? t('Absent (short)|ABS') : '—') : formatPercent(pct)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="border-t px-4 py-3 text-xs text-muted-foreground">
        {t(
          'Press Enter to move to the next pupil. A pupil marked absent is excused: this assessment is left out of their total. Clearing a mark removes it.',
        )}
      </p>
    </Card>
  );
}

// ─── Results ───

function CourseResults({ termId, classId, courseId }: { termId: number; classId: number; courseId: number }) {
  const query = { termId, classId, courseId };
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['course-results', termId, classId, courseId],
    queryFn: () => api.get<Report>('/marks/course-results', query),
  });
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div>
          <p className="font-heading font-bold">{data?.title ?? t('Course results')}</p>
          <p className="text-sm text-muted-foreground">
            {t("Every assessment of the term, with each pupil's total, percentage and grade.")}
          </p>
        </div>
        <ExportMenu path="/marks/course-results" query={query} />
      </div>
      {error ? (
        <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
      ) : (
        <ReportTable report={data} loading={isLoading} />
      )}
    </Card>
  );
}

function ClassResults({
  termId,
  classId,
  onClass,
}: {
  termId: number;
  classId?: string;
  onClass: (v: string) => void;
}) {
  const { data: classes } = useClasses();
  const [pupil, setPupil] = useState<string>();
  const [busy, setBusy] = useState(false);
  const selected = classId ?? classes?.find((c) => c.studentCount > 0)?.id.toString();
  const query = { termId, classId: selected };
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['class-results', termId, selected],
    queryFn: () => api.get<Report>('/marks/class-results', query),
    enabled: !!selected,
  });
  useEffect(() => setPupil(undefined), [selected, termId]);

  const downloadAll = async () => {
    setBusy(true);
    const id = toast.loading(t('Preparing report cards…'));
    try {
      await api.download('/marks/report-cards', query, 'report-cards.pdf');
      toast.success(t('Report cards ready'), { id });
    } catch (e) {
      toast.error(errorMessage(e), { id });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">{t('Class')}</span>
            <Select value={selected} onValueChange={onClass}>
              <SelectTrigger className="h-10 w-full sm:w-52" aria-label={t('Class')}>
                <SelectValue placeholder={t('Class')} />
              </SelectTrigger>
              <SelectContent>
                {classes?.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="ml-auto flex flex-wrap items-end gap-2">
            <Button onClick={downloadAll} loading={busy} disabled={!data?.rows.length}>
              {!busy && <FileText aria-hidden />} {t('Report cards for the class (PDF)')}
            </Button>
            <div className="flex gap-2">
              <Select value={pupil} onValueChange={setPupil}>
                <SelectTrigger className="h-10 w-52" aria-label={t('Pupil')}>
                  <SelectValue placeholder={t('One pupil…')} />
                </SelectTrigger>
                <SelectContent>
                  {data?.rows.map((r) => (
                    <SelectItem key={String(r.studentId)} value={String(r.studentId)}>
                      {String(r.student)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                disabled={!pupil}
                onClick={() =>
                  api
                    .openPdf('/marks/report-cards', {
                      ...query,
                      studentId: pupil,
                    })
                    .catch((e) => toast.error(errorMessage(e)))
                }
              >
                <FileText aria-hidden /> {t('Report card')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div>
            <p className="font-heading font-bold">{data?.title ?? t('Class results')}</p>
            <p className="text-sm text-muted-foreground">
              {t("Each course's percentage, the average of all courses, the grade and the position in class.")}
            </p>
          </div>
          <ExportMenu path="/marks/class-results" query={query} />
        </div>
        {error ? (
          <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
        ) : (
          <ReportTable report={data} loading={isLoading || !selected} />
        )}
      </Card>
    </div>
  );
}

// ─── Page ───

function MarksInner() {
  const { can } = useAuth();
  const admin = can('marks.results');
  const {
    data: options,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['marks-options'],
    queryFn: () => api.get<MarksOptions>('/marks/options'),
  });
  const p = useMarksParams(options);
  const termId = p.termId ? Number(p.termId) : undefined;

  return (
    <>
      <PageHeader
        title={t('Marks')}
        description={
          admin
            ? t('Record assessments, follow results per course and per class, and print report cards.')
            : t(
                'Record the marks of every assessment for the courses you teach. They count towards each pupil’s school report.',
              )
        }
        icon={<NotebookPen />}
      />
      {error ? (
        <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />
      ) : isLoading || !options ? (
        <Skeleton className="h-40 w-full" />
      ) : !options.terms.length ? (
        <EmptyState
          icon={NotebookPen}
          title={t('No terms yet')}
          description={t('An administrator needs to set up the academic year and its terms first.')}
        />
      ) : (
        <Tabs value={p.tab} onValueChange={(v) => p.set({ tab: v, assessment: undefined })}>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <TabsList>
              <TabsTrigger value="assessments">
                <ClipboardList aria-hidden /> {t('Assessments')}
              </TabsTrigger>
              <TabsTrigger value="course">
                <BarChart3 aria-hidden /> {t('Course results')}
              </TabsTrigger>
              {admin && (
                <TabsTrigger value="class">
                  <GraduationCap aria-hidden /> {t('Class results & report cards')}
                </TabsTrigger>
              )}
            </TabsList>
            <div className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto">
              <TermSelect
                options={options}
                value={p.termId}
                onChange={(v) => p.set({ termId: v, assessment: undefined })}
              />
              {p.tab !== 'class' && options.pairs.length > 0 && (
                <PairSelect
                  options={options}
                  value={p.pairKey}
                  onChange={(v) => p.set({ pair: v, assessment: undefined })}
                />
              )}
            </div>
          </div>

          {p.tab !== 'class' && !p.pair ? (
            <Card>
              <EmptyState
                icon={GraduationCap}
                title={t('No courses assigned yet')}
                description={t('Ask an administrator to assign you courses and classes on the Teachers page.')}
              />
            </Card>
          ) : (
            <>
              <TabsContent value="assessments">
                {p.pair &&
                  termId &&
                  (p.assessmentId ? (
                    <MarksSheet id={Number(p.assessmentId)} onBack={() => p.set({ assessment: undefined })} />
                  ) : (
                    <AssessmentList
                      options={options}
                      termId={termId}
                      classId={p.pair.classId}
                      courseId={p.pair.courseId}
                      onOpen={(id) => p.set({ assessment: String(id) })}
                    />
                  ))}
              </TabsContent>
              <TabsContent value="course">
                {p.pair && termId && (
                  <CourseResults termId={termId} classId={p.pair.classId} courseId={p.pair.courseId} />
                )}
              </TabsContent>
              {admin && (
                <TabsContent value="class">
                  {termId && (
                    <ClassResults termId={termId} classId={p.classId} onClass={(v) => p.set({ classId: v })} />
                  )}
                </TabsContent>
              )}
            </>
          )}
        </Tabs>
      )}
    </>
  );
}

export default function MarksPage() {
  return (
    <Suspense>
      <MarksInner />
    </Suspense>
  );
}
