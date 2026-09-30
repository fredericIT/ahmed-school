'use client';
import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  List,
  MapPin,
  PartyPopper,
  Plus,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { ExportMenu } from '@/components/shared/export-menu';
import { EmptyState } from '@/components/shared/empty-state';
import { DateChip } from '@/components/shared/date-chip';
import { Pagination } from '@/components/tables/data-table';
import { SearchInput } from '@/components/forms/search-input';
import { FilterSelect } from '@/components/forms/field';
import { CATEGORIES, categoryMeta } from '@/components/forms/activity-form';
import { useListParams } from '@/hooks/use-list-params';
import { useClasses, useCurrency, useTerms } from '@/hooks/use-lookups';
import { api } from '@/lib/api';
import { cn, dateFormat, formatDate, formatMoney, todayKigali, weekdayNames } from '@/lib/utils';
import type { ActivityListItem, ActivityStatus, ActivityCategory } from '@/types';
import { t } from '@/lib/i18n';

const FILTERS = ['category', 'status', 'termId', 'classId', 'view'] as const;

const CATEGORY_TONE: Record<string, string> = {
  SPORTS: 'bg-mint/20 text-mint-700 dark:text-mint',
  TRIP: 'bg-royal/10 text-royal',
  CELEBRATION: 'bg-sunny/25 text-sunny-700 dark:text-sunny',
  CULTURAL: 'bg-coral/15 text-coral-700 dark:text-coral',
  ACADEMIC: 'bg-lavender/20 text-lavender-700 dark:text-lavender',
  HEALTH: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  PARENT_MEETING: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  OTHER: 'bg-slate-500/10 text-slate-700 dark:text-slate-300',
};

function ActivitiesInner() {
  const list = useListParams(FILTERS, {
    sortBy: 'date',
    sortOrder: 'desc',
    pageSize: 12,
  });
  const view = list.filters.view === 'calendar' ? 'calendar' : 'list';
  const { data: terms } = useTerms();
  const { data: classes } = useClasses();
  const { view: _v, ...filters } = list.filters;
  const query = { ...list.query, view: undefined };

  return (
    <>
      <PageHeader
        title={t('Activities')}
        description={t('Plan, run and document school activities.')}
        icon={<PartyPopper />}
        actions={
          <>
            <ExportMenu path="/activities" query={query} />
            <Button asChild>
              <Link href="/activities/new">
                <Plus aria-hidden /> {t('New activity')}
              </Link>
            </Button>
          </>
        }
      />
      <Card className="mb-4 flex flex-wrap items-center gap-2 p-3">
        <SearchInput value={list.search} onChange={list.setSearch} placeholder={t('Search activities…')} />
        <FilterSelect
          value={filters.category}
          onChange={(v) => list.setFilter('category', v)}
          placeholder={t('Category')}
          allLabel={t('All categories')}
          options={CATEGORIES.map((c) => ({
            value: c.value,
            label: `${c.emoji} ${c.label}`,
          }))}
        />
        <FilterSelect
          value={filters.status}
          onChange={(v) => list.setFilter('status', v)}
          placeholder={t('Status')}
          allLabel={t('All statuses')}
          options={['PLANNED', 'ONGOING', 'COMPLETED', 'CANCELLED'].map((s) => ({
            value: s,
            label: s[0] + s.slice(1).toLowerCase(),
          }))}
          className="sm:w-36"
        />
        <FilterSelect
          value={filters.termId}
          onChange={(v) => list.setFilter('termId', v)}
          placeholder={t('Term')}
          allLabel={t('All terms')}
          options={(terms ?? []).map((term) => ({
            value: String(term.id),
            label: `${term.name} ${term.academicYear?.name ?? ''}`,
          }))}
        />
        <FilterSelect
          value={filters.classId}
          onChange={(v) => list.setFilter('classId', v)}
          placeholder={t('Class')}
          allLabel={t('All classes')}
          options={(classes ?? []).map((c) => ({
            value: String(c.id),
            label: c.name,
          }))}
          className="sm:w-36"
        />
        <div className="ml-auto flex rounded-xl bg-muted p-1" role="group" aria-label={t('View')}>
          <button
            onClick={() => list.setFilter('view', undefined)}
            aria-pressed={view === 'list'}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-muted-foreground',
              view === 'list' && 'bg-card text-foreground shadow-sm',
            )}
          >
            <List className="h-4 w-4" aria-hidden /> {t('List')}
          </button>
          <button
            onClick={() => list.setFilter('view', 'calendar')}
            aria-pressed={view === 'calendar'}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-muted-foreground',
              view === 'calendar' && 'bg-card text-foreground shadow-sm',
            )}
          >
            <CalendarDays className="h-4 w-4" aria-hidden /> {t('Calendar')}
          </button>
        </div>
      </Card>
      {view === 'list' ? (
        <ActivityList query={query} onPage={list.setPage} />
      ) : (
        <ActivityCalendar category={filters.category} status={filters.status} />
      )}
    </>
  );
}

function ActivityList({
  query,
  onPage,
}: {
  query: Record<string, string | number | undefined>;
  onPage: (p: number) => void;
}) {
  const currency = useCurrency();
  const { data, isLoading } = useQuery({
    queryKey: ['activities', query],
    queryFn: () => api.list<ActivityListItem>('/activities', query),
    placeholderData: (p) => p,
  });
  if (isLoading)
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-52 rounded-2xl" />
        ))}
      </div>
    );
  if (!data?.data.length)
    return (
      <Card>
        <EmptyState
          icon={PartyPopper}
          title={t('No activities found')}
          description={t('Plan a sports day, trip or celebration to see it here.')}
          action={
            <Button asChild size="sm">
              <Link href="/activities/new">{t('New activity')}</Link>
            </Button>
          }
        />
      </Card>
    );
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.data.map((a) => {
          const meta = categoryMeta(a.category);
          return (
            <Link
              key={a.id}
              href={`/activities/${a.id}`}
              className="group flex flex-col rounded-2xl border bg-card p-5 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift"
            >
              <div className="flex items-start justify-between gap-3">
                <DateChip date={a.date} />
                <StatusBadge status={a.status} />
              </div>
              <p className="mt-3 font-heading text-lg font-bold leading-snug group-hover:text-primary">{a.title}</p>
              <span
                className={cn(
                  'mt-2 inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold',
                  CATEGORY_TONE[a.category],
                )}
              >
                <span aria-hidden>{meta.emoji}</span> {meta.label}
              </span>
              <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                {a.location && (
                  <p className="flex items-center gap-1.5 truncate">
                    <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden /> {a.location}
                    {a.startTime && ` · ${a.startTime}`}
                  </p>
                )}
                <p className="flex items-center gap-1.5 truncate">
                  <Users className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {[a.classes.map((c) => c.name).join(', '), a.studentCount ? `${a.studentCount} students` : '']
                    .filter(Boolean)
                    .join(' + ') || t('No participants yet')}
                </p>
              </div>
              <div className="mt-auto flex items-center justify-between border-t pt-3 text-xs font-medium text-muted-foreground">
                <span className="tabular">
                  {a.actualCost != null
                    ? t('Spent {amount}', { amount: formatMoney(a.actualCost, currency) })
                    : a.budget != null
                      ? t('Budget {amount}', { amount: formatMoney(a.budget, currency) })
                      : t('No budget')}
                </span>
                {a.photoCount > 0 && (
                  <span className="flex items-center gap-1">
                    <ImageIcon className="h-3.5 w-3.5" aria-hidden /> {a.photoCount}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
      <Card>
        <Pagination meta={data.meta} onPageChange={onPage} />
      </Card>
    </div>
  );
}

function ActivityCalendar({ category, status }: { category?: string; status?: string }) {
  const router = useRouter();
  const [month, setMonth] = useState(todayKigali().slice(0, 7));
  const [mode, setMode] = useState<'month' | 'week'>('month');
  const [weekStart, setWeekStart] = useState(() => mondayOf(todayKigali()));
  const range = useMemo(() => {
    if (mode === 'week') return { from: weekStart, to: addDays(weekStart, 6) };
    const [y, m] = month.split('-').map(Number);
    const first = `${month}-01`;
    const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    return { from: mondayOf(first), to: addDays(mondayOf(last), 6) };
  }, [mode, month, weekStart]);
  const { data } = useQuery({
    queryKey: ['activities-calendar', range],
    queryFn: () =>
      api.get<
        {
          id: number;
          title: string;
          category: ActivityCategory;
          date: string;
          startTime: string | null;
          status: ActivityStatus;
        }[]
      >('/activities/calendar', range),
  });
  const items = (data ?? []).filter((a) => (!category || a.category === category) && (!status || a.status === status));
  const days: string[] = [];
  for (let d = range.from; d <= range.to; d = addDays(d, 1)) days.push(d);
  const today = todayKigali();

  const shift = (n: number) => {
    if (mode === 'week') setWeekStart(addDays(weekStart, 7 * n));
    else {
      const [y, m] = month.split('-').map(Number);
      setMonth(new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7));
    }
  };
  const title =
    mode === 'month'
      ? dateFormat({
          month: 'long',
          year: 'numeric',
        }).format(new Date(`${month}-01T00:00:00Z`))
      : t('Week of {date}', { date: formatDate(weekStart) });

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => shift(-1)} aria-label={t('Previous')}>
            <ChevronLeft />
          </Button>
          <h2 className="min-w-[180px] text-center font-heading text-lg font-bold">{title}</h2>
          <Button variant="outline" size="icon" onClick={() => shift(1)} aria-label={t('Next')}>
            <ChevronRight />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setMonth(today.slice(0, 7));
              setWeekStart(mondayOf(today));
            }}
          >
            {t('Today')}
          </Button>
        </div>
        <div className="flex rounded-xl bg-muted p-1">
          {(['month', 'week'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={cn(
                'rounded-lg px-3 py-1 text-sm font-semibold capitalize text-muted-foreground',
                mode === m && 'bg-card text-foreground shadow-sm',
              )}
            >
              {m === 'month' ? t('Month') : t('Week')}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-7 border-b bg-muted/50 text-center text-xs font-bold uppercase text-muted-foreground">
        {weekdayNames().map((d) => (
          <div key={d} className="py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d) => {
          const out = mode === 'month' && !d.startsWith(month);
          const dayItems = items.filter((a) => a.date.slice(0, 10) === d);
          return (
            <div
              key={d}
              className={cn(
                'border-b border-r p-1.5',
                mode === 'week' ? 'min-h-[260px]' : 'min-h-[110px]',
                out && 'bg-muted/30',
              )}
            >
              <span
                className={cn(
                  'tabular mb-1 inline-grid h-6 w-6 place-items-center rounded-full text-xs font-semibold',
                  d === today ? 'bg-primary text-primary-foreground' : out ? 'text-muted-foreground/60' : '',
                )}
              >
                {Number(d.slice(8))}
              </span>
              <div className="space-y-1">
                {dayItems.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => router.push(`/activities/${a.id}`)}
                    className={cn(
                      'block w-full truncate rounded-md px-1.5 py-1 text-left text-[11px] font-semibold transition hover:brightness-95',
                      CATEGORY_TONE[a.category],
                      a.status === 'CANCELLED' && 'line-through opacity-60',
                    )}
                    title={a.title}
                  >
                    {categoryMeta(a.category).emoji} {a.startTime && <span className="tabular">{a.startTime} </span>}
                    {a.title}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function mondayOf(iso: string) {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return addDays(iso, -((day + 6) % 7));
}

export default function ActivitiesPage() {
  return (
    <Suspense>
      <ActivitiesInner />
    </Suspense>
  );
}
