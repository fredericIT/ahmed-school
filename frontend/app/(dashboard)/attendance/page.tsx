'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  BarChart3,
  CalendarCheck,
  CalendarDays,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Lock,
  Printer,
  Save,
  Undo2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { UserAvatar } from '@/components/ui/misc';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/shared/page-header';
import { ATTENDANCE_COLORS } from '@/components/shared/status-badge';
import { EmptyState } from '@/components/shared/empty-state';
import { ExportMenu } from '@/components/shared/export-menu';
import { ReportTable } from '@/components/tables/report-table';
import { FilterSelect } from '@/components/forms/field';
import { useClasses, useSettings, useTerms } from '@/hooks/use-lookups';
import { useAuth } from '@/lib/auth';
import { api, errorMessage } from '@/lib/api';
import { enumLabel } from '@/lib/labels';
import { cn, dateFormat, formatDate, formatPercent, fullName, todayKigali } from '@/lib/utils';
import type { AttendanceRecord, AttendanceStatus, Report, SchoolClass } from '@/types';
import { plural, t } from '@/lib/i18n';

const STATUSES: { value: AttendanceStatus; label: string; short: string }[] = [
  {
    value: 'PRESENT',
    get label() {
      return t('Present');
    },
    get short() {
      return t('Attendance code: present|P');
    },
  },
  {
    value: 'LATE',
    get label() {
      return t('Late');
    },
    get short() {
      return t('Attendance code: late|L');
    },
  },
  {
    value: 'ABSENT',
    get label() {
      return t('Absent');
    },
    get short() {
      return t('Attendance code: absent|A');
    },
  },
  {
    value: 'SICK',
    get label() {
      return t('Sick');
    },
    get short() {
      return t('Attendance code: sick|S');
    },
  },
  {
    value: 'EXCUSED',
    get label() {
      return t('Excused');
    },
    get short() {
      return t('Attendance code: excused|E');
    },
  },
];

const ACTIVE_CLS: Record<AttendanceStatus, string> = {
  PRESENT: 'bg-emerald-500 text-white border-emerald-500',
  LATE: 'bg-amber-500 text-white border-amber-500',
  ABSENT: 'bg-red-500 text-white border-red-500',
  SICK: 'bg-violet-500 text-white border-violet-500',
  EXCUSED: 'bg-sky-500 text-white border-sky-500',
};

function useClassParam(classes?: SchoolClass[]) {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const classId = sp.get('classId') ?? (classes?.find((c) => c.studentCount > 0)?.id.toString() || undefined);
  const set = (key: string, v?: string) => {
    const n = new URLSearchParams(sp.toString());
    if (v) n.set(key, v);
    else n.delete(key);
    router.replace(`${pathname}?${n.toString()}`, { scroll: false });
  };
  return {
    classId,
    tab: sp.get('tab') ?? 'take',
    date: sp.get('date') ?? todayKigali(),
    month: sp.get('month') ?? todayKigali().slice(0, 7),
    set,
  };
}

/** Links to the student profile for administrators; teachers see the name only. */
function StudentName({ id, className, children }: { id: number; className?: string; children: React.ReactNode }) {
  const { can } = useAuth();
  if (!can('admin.area')) return <span className={className}>{children}</span>;
  return (
    <Link href={`/students/${id}`} className={className}>
      {children}
    </Link>
  );
}

function AttendanceInner() {
  const { can } = useAuth();
  const { data: classes } = useClasses();
  const p = useClassParam(classes);
  return (
    <>
      <PageHeader
        title={t('Attendance')}
        description={t('Record daily attendance, see the monthly calendar and follow up on absences.')}
        icon={<CalendarCheck />}
      />
      <Tabs value={p.tab} onValueChange={(v) => p.set('tab', v)}>
        <TabsList>
          <TabsTrigger value="take">
            <ClipboardCheck aria-hidden /> {t('Take attendance')}
          </TabsTrigger>
          <TabsTrigger value="calendar">
            <CalendarDays aria-hidden /> {t('Monthly calendar')}
          </TabsTrigger>
          {can('admin.area') && (
            <TabsTrigger value="reports">
              <BarChart3 aria-hidden /> {t('Reports')}
            </TabsTrigger>
          )}
        </TabsList>
        <TabsContent value="take">
          <TakeAttendance
            classes={classes}
            classId={p.classId}
            date={p.date}
            onClass={(v) => p.set('classId', v)}
            onDate={(v) => p.set('date', v)}
          />
        </TabsContent>
        <TabsContent value="calendar">
          <MonthlyGrid
            classes={classes}
            classId={p.classId}
            month={p.month}
            onClass={(v) => p.set('classId', v)}
            onMonth={(v) => p.set('month', v)}
          />
        </TabsContent>
        {can('admin.area') && (
          <TabsContent value="reports">
            <AttendanceReports />
          </TabsContent>
        )}
      </Tabs>
    </>
  );
}

export default function AttendancePage() {
  return (
    <Suspense>
      <AttendanceInner />
    </Suspense>
  );
}

// ─── Take attendance ───

interface SheetRow {
  student: {
    id: number;
    admissionNumber: string;
    firstName: string;
    lastName: string;
    gender: string;
    photo: string | null;
    allergies: string | null;
  };
  authorizedPickups: string[];
  attendance: AttendanceRecord | null;
}
interface Sheet {
  class: SchoolClass;
  date: string;
  lockReason: string | null;
  taken: boolean;
  rows: SheetRow[];
}
interface Draft {
  status?: AttendanceStatus;
  arrivalTime: string;
  pickedUpBy: string;
  remark: string;
}

function TakeAttendance({
  classes,
  classId,
  date,
  onClass,
  onDate,
}: {
  classes?: SchoolClass[];
  classId?: string;
  date: string;
  onClass: (v: string) => void;
  onDate: (v: string) => void;
}) {
  const qc = useQueryClient();
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [saving, setSaving] = useState(false);
  const { data: sheet, isLoading } = useQuery({
    queryKey: ['attendance-sheet', classId, date],
    queryFn: () => api.get<Sheet>('/attendance/sheet', { classId, date }),
    enabled: !!classId,
  });

  const initial = useMemo(() => {
    const m: Record<number, Draft> = {};
    sheet?.rows.forEach((r) => {
      m[r.student.id] = {
        status: r.attendance?.status,
        arrivalTime: r.attendance?.arrivalTime ?? '',
        pickedUpBy: r.attendance?.pickedUpBy ?? '',
        remark: r.attendance?.remark ?? '',
      };
    });
    return m;
  }, [sheet]);
  useEffect(() => setDrafts(initial), [initial]);

  const dirty = JSON.stringify(drafts) !== JSON.stringify(initial);
  const counts = STATUSES.map((s) => ({
    ...s,
    n: Object.values(drafts).filter((d) => d.status === s.value).length,
  }));
  const marked = Object.values(drafts).filter((d) => d.status).length;
  const total = sheet?.rows.length ?? 0;
  const locked = !!sheet?.lockReason;
  const set = (id: number, patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));

  const markAll = () =>
    setDrafts((d) =>
      Object.fromEntries(
        Object.entries(d).map(([k, v]) => [
          k,
          {
            ...v,
            status: v.status && v.status !== 'PRESENT' ? v.status : 'PRESENT',
          },
        ]),
      ),
    );

  const save = async () => {
    if (!sheet) return;
    const missing = total - marked;
    if (missing > 0) {
      toast.error(plural(missing, '{count} student has no status yet', '{count} students have no status yet'));
      return;
    }
    setSaving(true);
    try {
      const r = await api.post<{ created: number; updated: number }>('/attendance/sheet', {
        classId: sheet.class.id,
        date,
        records: Object.entries(drafts).map(([studentId, d]) => ({
          studentId: Number(studentId),
          status: d.status,
          arrivalTime: d.arrivalTime || null,
          pickedUpBy: d.pickedUpBy || null,
          remark: d.remark || null,
        })),
      });
      toast.success(t('Attendance saved'), {
        description:
          date < todayKigali() && r.updated
            ? t('{created} new · {updated} updated (edit logged)', { created: r.created, updated: r.updated })
            : t('{created} new · {updated} updated', { created: r.created, updated: r.updated }),
      });
      void qc.invalidateQueries({
        queryKey: ['attendance-sheet', classId, date],
      });
      void qc.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const shiftDay = (n: number) => {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    const next = d.toISOString().slice(0, 10);
    if (next <= todayKigali()) onDate(next);
  };

  return (
    <div className="space-y-4">
      <Card className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
        <Select value={classId} onValueChange={onClass}>
          <SelectTrigger className="md:w-56" aria-label={t('Class')}>
            <SelectValue placeholder={t('Choose class')} />
          </SelectTrigger>
          <SelectContent>
            {classes?.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => shiftDay(-1)} aria-label={t('Previous day')}>
            <ChevronLeft />
          </Button>
          <Input
            type="date"
            value={date}
            max={todayKigali()}
            onChange={(e) => e.target.value && onDate(e.target.value)}
            className="w-44"
            aria-label={t('Date')}
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => shiftDay(1)}
            disabled={date >= todayKigali()}
            aria-label={t('Next day')}
          >
            <ChevronRight />
          </Button>
          {date !== todayKigali() && (
            <Button variant="ghost" size="sm" onClick={() => onDate(todayKigali())}>
              {t('Today')}
            </Button>
          )}
        </div>
        <div className="flex flex-1 flex-wrap items-center gap-2 md:justify-end">
          {counts.map((c) => (
            <span
              key={c.value}
              className="tabular inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold"
            >
              <span className="h-2 w-2 rounded-full" style={{ background: ATTENDANCE_COLORS[c.value] }} aria-hidden />
              {c.label} {c.n}
            </span>
          ))}
        </div>
      </Card>

      {sheet?.lockReason && (
        <div className="flex items-center gap-3 rounded-2xl border border-sunny/50 bg-sunny/10 px-4 py-3 text-sm font-medium text-sunny-700 dark:text-sunny">
          <Lock className="h-4 w-4" aria-hidden />{' '}
          {t('{lockReason}. The sheet is read-only.', { lockReason: sheet.lockReason })}
        </div>
      )}
      {sheet && !locked && date < todayKigali() && sheet.taken && (
        <div className="flex items-center gap-3 rounded-2xl border border-royal/30 bg-royal/5 px-4 py-3 text-sm font-medium text-royal">
          <AlertTriangle className="h-4 w-4" aria-hidden />{' '}
          {t('You are editing a past day. Changes are recorded in the audit log.')}
        </div>
      )}

      {!classId ? (
        <Card>
          <EmptyState icon={ClipboardCheck} title={t('Choose a class')} />
        </Card>
      ) : isLoading || !sheet ? (
        <Card className="space-y-2 p-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </Card>
      ) : sheet.rows.length === 0 ? (
        <Card>
          <EmptyState title={t('No active students in this class')} />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
            <div>
              <p className="font-heading text-lg font-bold">
                {sheet.class.name} · {formatDate(date)}
              </p>
              <p className="tabular text-sm text-muted-foreground">
                {t('{marked}/{total} marked', { marked, total })}
                {sheet.taken && (
                  <Badge variant="green" className="ml-2">
                    {t('Saved')}
                  </Badge>
                )}
              </p>
            </div>
            {!locked && (
              <div className="flex gap-2">
                {dirty && (
                  <Button variant="ghost" onClick={() => setDrafts(initial)}>
                    <Undo2 aria-hidden /> {t('Reset')}
                  </Button>
                )}
                <Button variant="mint" onClick={markAll}>
                  <CheckCheck aria-hidden /> {t('Mark all present')}
                </Button>
              </div>
            )}
          </div>
          <ul className="divide-y">
            {sheet.rows.map((r) => {
              const d = drafts[r.student.id] ?? {
                arrivalTime: '',
                pickedUpBy: '',
                remark: '',
              };
              const absentish = d.status && d.status !== 'PRESENT' && d.status !== 'LATE';
              return (
                <li
                  key={r.student.id}
                  className={cn(
                    'grid gap-3 p-4 lg:grid-cols-[minmax(220px,1fr)_auto_minmax(320px,1.4fr)] lg:items-center',
                    !d.status && 'bg-sunny/5',
                  )}
                >
                  <div className="flex items-center gap-3">
                    <UserAvatar src={r.student.photo} name={fullName(r.student)} size="md" />
                    <div className="min-w-0">
                      <StudentName id={r.student.id} className="block truncate font-semibold hover:text-primary">
                        {fullName(r.student)}
                      </StudentName>
                      <p className="flex items-center gap-2 text-xs text-muted-foreground">
                        {r.student.admissionNumber}
                        {r.student.allergies && (
                          <Badge variant="red" className="px-1.5 py-0 text-[10px]">
                            {t('Allergy')}
                          </Badge>
                        )}
                      </p>
                    </div>
                  </div>
                  <div
                    role="radiogroup"
                    aria-label={t('Status for {name}', { name: fullName(r.student) })}
                    className="flex flex-wrap gap-1.5"
                  >
                    {STATUSES.map((s) => {
                      const active = d.status === s.value;
                      return (
                        <button
                          key={s.value}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          disabled={locked}
                          onClick={() => set(r.student.id, { status: s.value })}
                          className={cn(
                            'h-9 rounded-lg border px-3 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-60',
                            active ? ACTIVE_CLS[s.value] : 'bg-card text-muted-foreground hover:bg-accent',
                          )}
                        >
                          <span className="sm:hidden">{s.short}</span>
                          <span className="hidden sm:inline">{s.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-[110px_1fr_1fr]">
                    <Input
                      type="time"
                      value={d.arrivalTime}
                      onChange={(e) => set(r.student.id, { arrivalTime: e.target.value })}
                      disabled={locked || absentish}
                      aria-label={t('Arrival time')}
                      className="h-9"
                    />
                    <Input
                      value={d.pickedUpBy}
                      onChange={(e) => set(r.student.id, { pickedUpBy: e.target.value })}
                      disabled={locked || absentish}
                      placeholder={t('Picked up by')}
                      list={`pickup-${r.student.id}`}
                      aria-label={t('Picked up by')}
                      className="h-9"
                    />
                    <datalist id={`pickup-${r.student.id}`}>
                      {r.authorizedPickups.map((p) => (
                        <option key={p} value={p} />
                      ))}
                    </datalist>
                    <Input
                      value={d.remark}
                      onChange={(e) => set(r.student.id, { remark: e.target.value })}
                      disabled={locked}
                      placeholder={absentish ? t('Reason') : t('Remark')}
                      aria-label={t('Remark')}
                      className="col-span-2 h-9 sm:col-span-1"
                    />
                  </div>
                </li>
              );
            })}
          </ul>
          {!locked && (
            <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t bg-card/95 p-4 backdrop-blur">
              <p className="text-sm text-muted-foreground">
                {dirty ? t('You have unsaved changes') : sheet.taken ? t('All changes saved') : t('Not saved yet')}
              </p>
              <Button onClick={() => void save()} loading={saving} disabled={!dirty && sheet.taken} size="lg">
                <Save aria-hidden /> {t('Save attendance')}
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

// ─── Monthly calendar grid ───

interface Monthly {
  class: SchoolClass;
  days: {
    date: string;
    weekend: boolean;
    holiday: string | null;
    schoolDay: boolean;
  }[];
  students: {
    id: number;
    firstName: string;
    lastName: string;
    photo: string | null;
    statuses: Record<string, AttendanceStatus>;
    rate: number | null;
    absences: number;
  }[];
}

function MonthlyGrid({
  classes,
  classId,
  month,
  onClass,
  onMonth,
}: {
  classes?: SchoolClass[];
  classId?: string;
  month: string;
  onClass: (v: string) => void;
  onMonth: (v: string) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['attendance-monthly', classId, month],
    queryFn: () => api.get<Monthly>('/attendance/monthly', { classId, month }),
    enabled: !!classId,
  });
  const shift = (n: number) => {
    const [y, m] = month.split('-').map(Number);
    onMonth(new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7));
  };
  const label = dateFormat({
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${month}-01T00:00:00Z`));
  return (
    <div className="space-y-4">
      <Card className="no-print flex flex-wrap items-center gap-3 p-4">
        <Select value={classId} onValueChange={onClass}>
          <SelectTrigger className="w-56" aria-label={t('Class')}>
            <SelectValue placeholder={t('Choose class')} />
          </SelectTrigger>
          <SelectContent>
            {classes?.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => shift(-1)} aria-label={t('Previous month')}>
            <ChevronLeft />
          </Button>
          <span className="min-w-[150px] text-center font-heading font-bold">{label}</span>
          <Button variant="outline" size="icon" onClick={() => shift(1)} aria-label={t('Next month')}>
            <ChevronRight />
          </Button>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3 text-xs">
          {STATUSES.map((s) => (
            <span key={s.value} className="flex items-center gap-1">
              <span
                className="grid h-5 w-5 place-items-center rounded text-[10px] font-bold text-white"
                style={{ background: ATTENDANCE_COLORS[s.value] }}
              >
                {s.short}
              </span>
              {s.label}
            </span>
          ))}
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer aria-hidden /> {t('Print')}
          </Button>
        </div>
      </Card>
      <Card className="overflow-hidden">
        <div className="print-only p-4">
          <h2 className="text-lg font-bold">{t('{name} — attendance {label}', { name: data?.class.name, label })}</h2>
        </div>
        {isLoading || !data ? (
          <Skeleton className="m-4 h-64" />
        ) : (
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="bg-muted/60">
                  <th scope="col" className="sticky left-0 z-10 min-w-[180px] bg-muted px-3 py-2 text-left font-bold">
                    {t('Student')}
                  </th>
                  {data.days.map((d) => (
                    <th
                      key={d.date}
                      scope="col"
                      className={cn(
                        'min-w-[28px] px-0.5 py-2 text-center font-semibold',
                        !d.schoolDay && 'bg-muted text-muted-foreground/50',
                      )}
                      title={d.holiday ?? undefined}
                    >
                      <span className="block text-[9px] uppercase">
                        {dateFormat({
                          weekday: 'narrow',
                        }).format(new Date(`${d.date}T00:00:00Z`))}
                      </span>
                      {Number(d.date.slice(8))}
                    </th>
                  ))}
                  <th scope="col" className="px-3 py-2 text-right font-bold">
                    {t('Rate')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.students.map((s) => (
                  <tr key={s.id} className="border-t">
                    <th scope="row" className="sticky left-0 z-10 bg-card px-3 py-1.5 text-left font-semibold">
                      <StudentName id={s.id} className="hover:text-primary">
                        {fullName(s)}
                      </StudentName>
                    </th>
                    {data.days.map((d) => {
                      const st = s.statuses[d.date];
                      return (
                        <td key={d.date} className={cn('p-0.5 text-center', !d.schoolDay && 'bg-muted/60')}>
                          {st ? (
                            <span
                              className="mx-auto grid h-6 w-6 place-items-center rounded text-[10px] font-bold text-white"
                              style={{ background: ATTENDANCE_COLORS[st] }}
                              title={`${formatDate(d.date)}: ${enumLabel(st)}`} // i18n-ignore: both parts are translated
                            >
                              {STATUSES.find((x) => x.value === st)?.short}
                            </span>
                          ) : null}
                        </td>
                      );
                    })}
                    <td
                      className={cn(
                        'tabular px-3 text-right font-bold',
                        s.rate != null && s.rate < 80 && 'text-red-600',
                      )}
                    >
                      {formatPercent(s.rate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Reports ───

function AttendanceReports() {
  const { data: classes } = useClasses();
  const { data: terms } = useTerms();
  const { data: settings } = useSettings();
  const [type, setType] = useState<'classes' | 'students' | 'chronic'>('classes');
  const [termId, setTermId] = useState<string>();
  const [classId, setClassId] = useState<string>();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [threshold, setThreshold] = useState<string>('');
  const query = {
    termId,
    classId: type === 'classes' ? undefined : classId,
    from: from || undefined,
    to: to || undefined,
    threshold: type === 'chronic' ? threshold || undefined : undefined,
  };
  const { data, isLoading } = useQuery({
    queryKey: ['attendance-report', type, query],
    queryFn: () => api.get<Report>(`/attendance/reports/${type}`, query),
  });

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b p-4">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['classes', t('By class')],
              ['students', t('By student')],
              ['chronic', t('Chronic absentees')],
            ] as const
          ).map(([k, l]) => (
            <Button key={k} variant={type === k ? 'default' : 'outline'} size="sm" onClick={() => setType(k)}>
              {l}
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <FilterSelect
            value={termId}
            onChange={(v) => {
              setTermId(v);
              if (v) {
                setFrom('');
                setTo('');
              }
            }}
            placeholder={t('Term')}
            allLabel={t('Current term')}
            options={(terms ?? []).map((term) => ({
              value: String(term.id),
              label: `${term.name} ${term.academicYear?.name ?? ''}`,
            }))}
          />
          {type !== 'classes' && (
            <FilterSelect
              value={classId}
              onChange={setClassId}
              placeholder={t('Class')}
              allLabel={t('All classes')}
              options={(classes ?? []).map((c) => ({
                value: String(c.id),
                label: c.name,
              }))}
            />
          )}
          <label className="text-xs font-semibold text-muted-foreground">
            {t('From')}
            <Input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setTermId(undefined);
              }}
              className="mt-1 w-40"
            />
          </label>
          <label className="text-xs font-semibold text-muted-foreground">
            {t('To')}
            <Input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setTermId(undefined);
              }}
              className="mt-1 w-40"
            />
          </label>
          {type === 'chronic' && (
            <label className="text-xs font-semibold text-muted-foreground">
              {t('Below %')}
              <Input
                type="number"
                min={1}
                max={100}
                value={threshold}
                placeholder={String(settings?.chronicAbsenceThreshold ?? 80)}
                onChange={(e) => setThreshold(e.target.value)}
                className="mt-1 w-24"
              />
            </label>
          )}
          <div className="ml-auto">
            <ExportMenu path={`/attendance/reports/${type}`} query={query} />
          </div>
        </div>
        {data?.subtitle && <p className="text-sm text-muted-foreground">{data.subtitle}</p>}
      </div>
      <ReportTable report={data} loading={isLoading} />
    </Card>
  );
}
