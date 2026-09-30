'use client';
import { Suspense, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, BookOpen, CalendarCheck, Package, PartyPopper, Printer, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/shared/page-header';
import { ExportMenu } from '@/components/shared/export-menu';
import { EmptyState } from '@/components/shared/empty-state';
import { ReportTable } from '@/components/tables/report-table';
import { FilterSelect } from '@/components/forms/field';
import { useClasses, useCurrency, useSettings, useTerms } from '@/hooks/use-lookups';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Report } from '@/types';
import { t } from '@/lib/i18n';

interface ReportMeta {
  key: string;
  group: string;
  title: string;
  description: string;
  filters: ('dateRange' | 'term' | 'class')[];
}

const GROUP_ICON: Record<string, { icon: typeof Users; cls: string }> = {
  Students: { icon: Users, cls: 'bg-coral/15 text-coral-700 dark:text-coral' },
  Attendance: {
    icon: CalendarCheck,
    cls: 'bg-mint/20 text-mint-700 dark:text-mint',
  },
  Activities: {
    icon: PartyPopper,
    cls: 'bg-sunny/25 text-sunny-700 dark:text-sunny',
  },
  Inventory: { icon: Package, cls: 'bg-royal/10 text-royal' },
  Library: {
    icon: BookOpen,
    cls: 'bg-lavender/20 text-lavender-700 dark:text-lavender',
  },
};

function ReportsInner() {
  const sp = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const currency = useCurrency();
  const { data: settings } = useSettings();
  const { data: catalogue } = useQuery({
    queryKey: ['reports-catalogue'],
    queryFn: () => api.get<ReportMeta[]>('/reports'),
  });
  const { data: classes } = useClasses();
  const { data: terms } = useTerms();
  const key = sp.get('report') ?? 'attendance-classes';
  const filters = {
    from: sp.get('from') ?? undefined,
    to: sp.get('to') ?? undefined,
    termId: sp.get('termId') ?? undefined,
    classId: sp.get('classId') ?? undefined,
  };
  const meta = catalogue?.find((r) => r.key === key);
  const applicable = useMemo(
    () => ({
      from: meta?.filters.includes('dateRange') ? filters.from : undefined,
      to: meta?.filters.includes('dateRange') ? filters.to : undefined,
      termId: meta?.filters.includes('term') ? filters.termId : undefined,
      classId: meta?.filters.includes('class') ? filters.classId : undefined,
    }),
    [meta, filters.from, filters.to, filters.termId, filters.classId],
  );
  const { data: report, isLoading } = useQuery({
    queryKey: ['report', key, applicable],
    queryFn: () => api.get<Report>(`/reports/${key}`, applicable),
    enabled: !!meta,
  });
  const set = (patch: Record<string, string | undefined>) => {
    const n = new URLSearchParams(sp.toString());
    Object.entries(patch).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k)));
    router.replace(`${pathname}?${n.toString()}`, { scroll: false });
  };
  const groups = [...new Set(catalogue?.map((r) => r.group) ?? [])];

  return (
    <>
      <PageHeader
        title={t('Reports center')}
        description={t('Every report in one place — filter, preview, then export to PDF or Excel.')}
        icon={<BarChart3 />}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
        <Card className="no-print h-fit p-3">
          {!catalogue ? (
            <Skeleton className="h-96" />
          ) : (
            <nav className="space-y-4" aria-label={t('Reports')}>
              {groups.map((g) => {
                const gi = GROUP_ICON[g] ?? GROUP_ICON.Students;
                return (
                  <div key={g}>
                    <p className="mb-1 flex items-center gap-2 px-2 font-heading text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      <span className={cn('grid h-6 w-6 place-items-center rounded-md', gi.cls)}>
                        <gi.icon className="h-3.5 w-3.5" aria-hidden />
                      </span>
                      {/* Group names (Students, Attendance…) are translated like the menu. */}
                      {t(g)}
                    </p>
                    <ul>
                      {catalogue
                        .filter((r) => r.group === g)
                        .map((r) => (
                          <li key={r.key}>
                            <button
                              onClick={() => set({ report: r.key })}
                              aria-current={r.key === key ? 'page' : undefined}
                              className={cn(
                                'w-full rounded-lg px-3 py-2 text-left text-sm transition hover:bg-accent',
                                r.key === key && 'bg-primary/10 font-semibold text-primary',
                              )}
                            >
                              {r.title}
                            </button>
                          </li>
                        ))}
                    </ul>
                  </div>
                );
              })}
            </nav>
          )}
        </Card>
        <Card className="overflow-hidden">
          {!meta ? (
            <EmptyState icon={BarChart3} title={t('Choose a report')} />
          ) : (
            <>
              <div className="border-b p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-heading text-xl font-extrabold">{report?.title ?? meta.title}</h2>
                    <p className="text-sm text-muted-foreground">{report?.subtitle ?? meta.description}</p>
                  </div>
                  <div className="no-print flex gap-2">
                    <Button variant="outline" onClick={() => window.print()}>
                      <Printer aria-hidden /> {t('Print')}
                    </Button>
                    <ExportMenu path={`/reports/${key}`} query={applicable} />
                  </div>
                </div>
                {meta.filters.length > 0 && (
                  <div className="no-print mt-4 flex flex-wrap items-end gap-2">
                    {meta.filters.includes('term') && (
                      <FilterSelect
                        value={filters.termId}
                        onChange={(v) =>
                          set({
                            termId: v,
                            ...(v ? { from: undefined, to: undefined } : {}),
                          })
                        }
                        placeholder={t('Term')}
                        allLabel={t('Current term')}
                        options={(terms ?? []).map((term) => ({
                          value: String(term.id),
                          label: `${term.name} ${term.academicYear?.name ?? ''}`,
                        }))}
                      />
                    )}
                    {meta.filters.includes('class') && (
                      <FilterSelect
                        value={filters.classId}
                        onChange={(v) => set({ classId: v })}
                        placeholder={t('Class')}
                        allLabel={t('All classes')}
                        options={(classes ?? []).map((c) => ({
                          value: String(c.id),
                          label: c.name,
                        }))}
                      />
                    )}
                    {meta.filters.includes('dateRange') && (
                      <>
                        <label className="text-xs font-semibold text-muted-foreground">
                          {t('From')}
                          <Input
                            type="date"
                            value={filters.from ?? ''}
                            onChange={(e) =>
                              set({
                                from: e.target.value || undefined,
                                termId: undefined,
                              })
                            }
                            className="mt-1 w-40"
                          />
                        </label>
                        <label className="text-xs font-semibold text-muted-foreground">
                          {t('To')}
                          <Input
                            type="date"
                            value={filters.to ?? ''}
                            onChange={(e) =>
                              set({
                                to: e.target.value || undefined,
                                termId: undefined,
                              })
                            }
                            className="mt-1 w-40"
                          />
                        </label>
                      </>
                    )}
                    {(filters.from || filters.to || filters.termId || filters.classId) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          set({
                            from: undefined,
                            to: undefined,
                            termId: undefined,
                            classId: undefined,
                          })
                        }
                      >
                        {t('Clear filters')}
                      </Button>
                    )}
                  </div>
                )}
              </div>
              <div className="print-only border-b p-4">
                <p className="text-lg font-bold">{settings?.name}</p>
              </div>
              <ReportTable report={report} loading={isLoading} currency={currency} />
            </>
          )}
        </Card>
      </div>
    </>
  );
}

export default function ReportsPage() {
  return (
    <Suspense>
      <ReportsInner />
    </Suspense>
  );
}
