'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  BookMarked,
  BookOpen,
  CalendarCheck,
  CalendarClock,
  CalendarX2,
  ClipboardList,
  LayoutGrid,
  NotebookPen,
  Package,
  TrendingDown,
  Trophy,
  ClipboardCheck,
  PackageMinus,
  PackageSearch,
  PartyPopper,
  SlidersHorizontal,
  UserPlus,
  Users,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/ui/misc';
import { Skeleton } from '@/components/ui/skeleton';
import { HeroBanner } from '@/components/shared/page-header';
import { KpiCard } from '@/components/shared/kpi-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { EmptyState, ErrorState } from '@/components/shared/empty-state';
import {
  AttendanceTrendChart,
  ChartCard,
  GenderSplit,
  LoansByMonthChart,
  StockByMonthChart,
  StudentsPerClassChart,
  useChartColors,
} from '@/components/charts/charts';
import { DateChip } from '@/components/shared/date-chip';
import {
  CustomizeDashboardButton,
  CustomizeDashboardDialog,
  useDashboardWidgets,
} from '@/components/dashboard/customize-dashboard';
import { useAuth } from '@/lib/auth';
import { useCurrency } from '@/hooks/use-lookups';
import { api } from '@/lib/api';
import { cn, formatDate, formatNumber, formatPercent, fullName } from '@/lib/utils';
import type { ActivityCategory, AssessmentType, AttendanceStatus, Gender, ItemUnit } from '@/types';
import { plural, t } from '@/lib/i18n';
import { enumLabel } from '@/lib/labels';

interface DashboardData {
  today: string;
  kpis: {
    students: { total: number; nursery: number; primary: number };
    attendanceToday: Record<AttendanceStatus, number> & {
      recorded: number;
      rate: number | null;
      classesTaken: number;
      classesTotal: number;
    };
    upcomingActivities: number;
    lowStockItems: number;
    expiringItems: number;
    booksBorrowed: number;
    overdueLoans: number;
  };
  charts: {
    attendanceTrend: {
      date: string;
      rate: number | null;
      present: number;
      absent: number;
      total: number;
    }[];
    studentsPerClass: {
      classId: number;
      name: string;
      students: number;
      capacity: number;
    }[];
    gender: { gender: Gender; count: number }[];
    stockByMonth: { month: string; in: number; out: number; damaged: number }[];
    loansByMonth: { month: string; issued: number; returned: number }[];
  };
  lists: {
    recentRegistrations: {
      id: number;
      firstName: string;
      lastName: string;
      photo: string | null;
      admissionNumber: string;
      createdAt: string;
      currentClass: { name: string } | null;
    }[];
    todaysAbsentees: {
      student: {
        id: number;
        firstName: string;
        lastName: string;
        photo: string | null;
      };
      class: { name: string };
      status: AttendanceStatus;
      remark: string | null;
    }[];
    upcomingActivities: {
      id: number;
      title: string;
      category: ActivityCategory;
      date: string;
      startTime: string | null;
      location: string | null;
    }[];
    lowStock: {
      id: number;
      name: string;
      sku: string;
      quantity: number;
      reorderLevel: number;
      unit: ItemUnit;
    }[];
    overdueBooks: {
      id: number;
      dueDate: string;
      bookCopy: { copyCode: string; book: { title: string } };
      student: {
        id: number;
        firstName: string;
        lastName: string;
        currentClass: { name: string } | null;
      } | null;
    }[];
  };
}

const QUICK_ACTIONS = [
  {
    href: '/students/new',
    get label() {
      return t('Register student');
    },
    icon: UserPlus,
    cls: 'bg-coral/15 text-coral-700 dark:text-coral',
  },
  {
    href: '/attendance',
    get label() {
      return t('Take attendance');
    },
    icon: ClipboardCheck,
    cls: 'bg-mint/20 text-mint-700 dark:text-mint',
  },
  {
    href: '/activities/new',
    get label() {
      return t('New activity');
    },
    icon: PartyPopper,
    cls: 'bg-sunny/25 text-sunny-700 dark:text-sunny',
  },
  {
    href: '/inventory/movements?new=1',
    get label() {
      return t('Stock in / out');
    },
    icon: PackageMinus,
    cls: 'bg-royal/10 text-royal',
  },
  {
    href: '/library/loans?issue=1',
    get label() {
      return t('Issue book');
    },
    icon: BookMarked,
    cls: 'bg-lavender/20 text-lavender-700 dark:text-lavender',
  },
];

/**
 * One overview per main section: `/dashboard?focus=attendance` shows only attendance, and so on.
 * The Home page tiles open these, for admins who only want to follow one part of the school.
 */
const AREAS = {
  students: {
    get label() {
      return t('Students');
    },
    icon: Users,
    href: '/students',
    get description() {
      return t('Pupils per class, boys and girls, and the latest registrations.');
    },
    widgets: ['kpi.students', 'chart.gender', 'chart.studentsPerClass', 'list.registrations'],
    actions: ['/students/new'],
  },
  attendance: {
    get label() {
      return t('Attendance');
    },
    icon: CalendarCheck,
    href: '/attendance',
    get description() {
      return t("Today's attendance, the last 30 days and who is absent today.");
    },
    widgets: ['chart.attendanceTrend', 'list.absentees'],
    actions: ['/attendance'],
  },
  marks: {
    get label() {
      return t('Marks');
    },
    icon: NotebookPen,
    href: '/marks?tab=class',
    get description() {
      return t('Averages and pass rates per class this term, and the latest assessments.');
    },
    widgets: [],
    actions: [],
  },
  activities: {
    get label() {
      return t('Activities');
    },
    icon: PartyPopper,
    href: '/activities',
    get description() {
      return t('What is planned next at school.');
    },
    widgets: ['kpi.activities', 'list.upcoming'],
    actions: ['/activities/new'],
  },
  inventory: {
    get label() {
      return t('Inventory');
    },
    icon: Package,
    href: '/inventory',
    get description() {
      return t('Stock alerts, stock movement per month and items to reorder.');
    },
    widgets: ['chart.stock', 'list.lowStock'],
    actions: ['/inventory/movements?new=1'],
  },
  library: {
    get label() {
      return t('Library');
    },
    icon: BookOpen,
    href: '/library',
    get description() {
      return t('Books on loan, overdue books and loans per month.');
    },
    widgets: ['kpi.library', 'chart.loans', 'list.overdue'],
    actions: ['/library/loans?issue=1'],
  },
} as const;
type Area = keyof typeof AREAS;
const isArea = (v: string | null): v is Area => !!v && v in AREAS;

function AreaSwitcher({ focus }: { focus?: Area }) {
  const items: { key?: Area; label: string; icon: typeof Users }[] = [
    { label: t('Everything'), icon: LayoutGrid },
    ...(Object.keys(AREAS) as Area[]).map((key) => ({
      key,
      label: AREAS[key].label,
      icon: AREAS[key].icon,
    })),
  ];
  return (
    <nav aria-label={t('Choose what to see')} className="scrollbar-thin -mx-1 overflow-x-auto px-1 pb-1">
      <ul className="flex w-max gap-2">
        {items.map((i) => {
          const active = i.key === focus;
          return (
            <li key={i.label}>
              <Link
                href={i.key ? `/dashboard?focus=${i.key}` : '/dashboard'}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition',
                  active
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : 'bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
                )}
              >
                <i.icon className="h-4 w-4" aria-hidden /> {i.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function greeting() {
  // Kigali is UTC+2 all year (no daylight saving).
  const h = (new Date().getUTCHours() + 2) % 24;
  return h < 12 ? t('Good morning') : h < 17 ? t('Good afternoon') : t('Good evening');
}

export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardInner />
    </Suspense>
  );
}

function DashboardInner() {
  const { user } = useAuth();
  const currency = useCurrency();
  const colors = useChartColors();
  const params = useSearchParams();
  const focusParam = params.get('focus');
  const focus = isArea(focusParam) ? focusParam : undefined;
  const area = focus ? AREAS[focus] : undefined;
  const widgets = useDashboardWidgets();
  // A focused overview shows its section's widgets whatever the personal dashboard choice is.
  const show = (key: string) => (area ? (area.widgets as readonly string[]).includes(key) : widgets.show(key));
  const visibleCount = area ? area.widgets.length : widgets.visibleCount;
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const showKpis = ['kpi.students', 'kpi.attendance', 'kpi.activities', 'kpi.library'].some(show);
  const showCharts = [
    'chart.attendanceTrend',
    'chart.gender',
    'chart.studentsPerClass',
    'chart.stock',
    'chart.loans',
  ].some(show);
  const showLists = ['list.absentees', 'list.upcoming', 'list.registrations', 'list.lowStock', 'list.overdue'].some(
    show,
  );
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<DashboardData>('/dashboard'),
  });
  const k = data?.kpis;
  const att = k?.attendanceToday;
  const boys = data?.charts.gender.find((g) => g.gender === 'MALE')?.count ?? 0;
  const girls = data?.charts.gender.find((g) => g.gender === 'FEMALE')?.count ?? 0;

  if (error) return <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />;

  return (
    <div className="space-y-6">
      <HeroBanner>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          {area ? (
            <div>
              <p className="text-sm font-semibold text-white/80">{data ? formatDate(data.today) : ' '}</p>
              <h1 className="mt-1 flex items-center gap-3 font-heading text-3xl font-black sm:text-4xl">
                <area.icon className="h-8 w-8 text-sunny" aria-hidden /> {t('{label} overview', { label: area.label })}
              </h1>
              <p className="mt-1 max-w-xl text-white/85">{area.description}</p>
            </div>
          ) : (
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm font-semibold text-white/80">{data ? formatDate(data.today) : ' '}</p>
                <CustomizeDashboardButton />
              </div>
              <h1 className="mt-1 font-heading text-3xl font-black sm:text-4xl">
                {greeting()}, {user?.firstName ?? '…'}! <span aria-hidden>🌟</span>
              </h1>
              <p className="mt-1 max-w-xl text-white/85">
                {att && att.classesTaken < att.classesTotal
                  ? t('Attendance has been taken for {classesTaken} of {classesTotal} classes today.', {
                      classesTaken: att.classesTaken,
                      classesTotal: att.classesTotal,
                    })
                  : t('Here is what is happening at school today.')}
              </p>
            </div>
          )}
          {(area || show('quickActions')) && (
            <div className="flex flex-wrap gap-2">
              {area && (
                <Link
                  href={area.href}
                  className="flex items-center gap-2 rounded-xl bg-sunny px-4 py-2 text-sm font-bold text-slate-900 shadow-sm transition hover:-translate-y-0.5 hover:bg-sunny/90"
                >
                  {t('Open {area}', { area: area.label })} <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              )}
              {QUICK_ACTIONS.filter((a) => !area || (area.actions as readonly string[]).includes(a.href)).map((a) => (
                <Link
                  key={a.href}
                  href={a.href}
                  className="flex items-center gap-2 rounded-xl bg-white/95 px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:-translate-y-0.5 hover:bg-white dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
                >
                  <span className={`grid h-7 w-7 place-items-center rounded-lg ${a.cls}`}>
                    <a.icon className="h-4 w-4" aria-hidden />
                  </span>
                  {a.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      </HeroBanner>

      <AreaSwitcher focus={focus} />

      {!area && visibleCount === 0 && (
        <Card>
          <EmptyState
            icon={SlidersHorizontal}
            title={t('Your dashboard is empty')}
            description={t('You have hidden every widget. Choose what you want to track.')}
            action={
              <Button size="sm" onClick={() => setCustomizeOpen(true)}>
                <SlidersHorizontal aria-hidden /> {t('Choose widgets')}
              </Button>
            }
          />
        </Card>
      )}
      <CustomizeDashboardDialog open={customizeOpen} onOpenChange={setCustomizeOpen} />

      {focus === 'marks' && <MarksOverview />}

      {focus === 'attendance' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            index={0}
            label={t('Attendance today')}
            value={formatPercent(att?.rate)}
            hint={t('Present + late, of pupils recorded')}
            icon={CalendarCheck}
            tone="mint"
            href="/attendance"
            loading={isLoading}
          />
          <KpiCard
            index={1}
            label={t('Classes taken today')}
            value={att ? `${att.classesTaken} / ${att.classesTotal}` : '—'}
            hint={
              att &&
              (att.classesTaken < att.classesTotal ? t('Some registers still to take') : t('All registers taken'))
            }
            icon={ClipboardList}
            tone="royal"
            href="/attendance"
            loading={isLoading}
          />
          <KpiCard
            index={2}
            label={t('Absent today')}
            value={att ? att.ABSENT + att.SICK + att.EXCUSED : '—'}
            hint={att && t('{sick} sick · {excused} excused', { sick: att.SICK, excused: att.EXCUSED })}
            icon={CalendarX2}
            tone="coral"
            href="/attendance"
            loading={isLoading}
          />
          <KpiCard
            index={3}
            label={t('Late today')}
            value={att?.LATE ?? '—'}
            hint={t('Arrived after the start of the day')}
            icon={CalendarClock}
            tone="sunny"
            href="/attendance"
            loading={isLoading}
          />
        </div>
      )}

      {(focus === 'inventory' || focus === 'library') && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {focus === 'inventory' ? (
            <>
              <KpiCard
                index={0}
                label={t('Low on stock')}
                value={k?.lowStockItems ?? '—'}
                hint={t('At or below reorder level')}
                icon={PackageSearch}
                tone="sunny"
                href="/inventory?lowStock=true"
                loading={isLoading}
              />
              <KpiCard
                index={1}
                label={t('Expired or expiring')}
                value={k?.expiringItems ?? '—'}
                hint={t('Food and medical items, next 30 days')}
                icon={AlertTriangle}
                tone="coral"
                href="/inventory?expiring=true"
                loading={isLoading}
              />
            </>
          ) : (
            <>
              <KpiCard
                index={0}
                label={t('Books on loan')}
                value={k?.booksBorrowed ?? '—'}
                hint={t('Issued and not yet returned')}
                icon={BookOpen}
                tone="lavender"
                href="/library/loans?status=ACTIVE"
                loading={isLoading}
              />
              <KpiCard
                index={1}
                label={t('Overdue books')}
                value={k?.overdueLoans ?? '—'}
                hint={k && (k.overdueLoans ? t('Follow up with the borrowers') : t('None overdue'))}
                icon={CalendarClock}
                tone="coral"
                href="/library/loans?status=OVERDUE"
                loading={isLoading}
              />
            </>
          )}
        </div>
      )}

      {focus === 'students' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            index={0}
            label={t('Active pupils')}
            value={k?.students.total ?? '—'}
            hint={t('Currently enrolled')}
            icon={Users}
            tone="royal"
            href="/students"
            loading={isLoading}
          />
          <KpiCard
            index={1}
            label={t('Nursery')}
            value={k?.students.nursery ?? '—'}
            hint={t('Baby, Middle and Top Class')}
            icon={PartyPopper}
            tone="sunny"
            href="/students?level=NURSERY"
            loading={isLoading}
          />
          <KpiCard
            index={2}
            label={t('Primary')}
            value={k?.students.primary ?? '—'}
            hint={t('P1 and P2')}
            icon={BookOpen}
            tone="mint"
            href="/students?level=PRIMARY"
            loading={isLoading}
          />
          <KpiCard
            index={3}
            label={t('Girls · boys')}
            value={data ? `${girls} · ${boys}` : '—'}
            hint={t('Active pupils')}
            icon={Users}
            tone="lavender"
            href="/students"
            loading={isLoading}
          />
        </div>
      )}

      {showKpis && focus !== 'library' && focus !== 'students' && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {show('kpi.students') && (
            <KpiCard
              index={0}
              label={t('Total students')}
              value={k?.students.total ?? '—'}
              hint={
                k &&
                t('{nursery} nursery · {primary} primary', { nursery: k.students.nursery, primary: k.students.primary })
              }
              icon={Users}
              tone="royal"
              href="/students"
              loading={isLoading}
            />
          )}
          {show('kpi.attendance') && (
            <KpiCard
              index={1}
              label={t('Attendance today')}
              value={formatPercent(att?.rate)}
              hint={
                att &&
                t('{present} present · {absent} absent', {
                  present: att.PRESENT + att.LATE,
                  absent: att.ABSENT + att.SICK + att.EXCUSED,
                })
              }
              icon={CalendarCheck}
              tone="mint"
              href="/attendance"
              loading={isLoading}
            />
          )}
          {show('kpi.activities') && (
            <KpiCard
              index={2}
              label={t('Upcoming activities')}
              value={k?.upcomingActivities ?? '—'}
              hint={t('Planned or ongoing')}
              icon={PartyPopper}
              tone="sunny"
              href="/activities"
              loading={isLoading}
            />
          )}
          {show('kpi.library') && (
            <KpiCard
              index={3}
              label={t('Books on loan')}
              value={k?.booksBorrowed ?? '—'}
              hint={
                k &&
                (k.overdueLoans ? t('{overdueLoans} overdue', { overdueLoans: k.overdueLoans }) : t('None overdue'))
              }
              icon={BookOpen}
              tone="lavender"
              href="/library/loans?status=ACTIVE"
              loading={isLoading}
            />
          )}
        </div>
      )}

      {show('alerts') && k && (k.lowStockItems > 0 || k.overdueLoans > 0 || k.expiringItems > 0) && (
        <div className="flex flex-col gap-2 sm:flex-row">
          {k.lowStockItems > 0 && focus !== 'library' && (
            <AlertPill
              href="/inventory?lowStock=true"
              icon={PackageSearch}
              tone="sunny"
              text={plural(
                k.lowStockItems,
                '{count} item at or below reorder level',
                '{count} items at or below reorder level',
              )}
            />
          )}
          {k.expiringItems > 0 && focus !== 'library' && (
            <AlertPill
              href="/inventory?expiring=true"
              icon={AlertTriangle}
              tone="coral"
              text={plural(
                k.expiringItems,
                '{count} item expired or expiring soon',
                '{count} items expired or expiring soon',
              )}
            />
          )}
          {k.overdueLoans > 0 && focus !== 'inventory' && (
            <AlertPill
              href="/library/loans?status=OVERDUE"
              icon={CalendarClock}
              tone="red"
              text={plural(k.overdueLoans, '{count} library book overdue', '{count} library books overdue')}
            />
          )}
        </div>
      )}

      {/* In a single-area overview, charts and lists share one two-column grid so nothing sits alone. */}
      <div className={area ? 'grid grid-cols-1 gap-4 lg:grid-cols-2' : 'space-y-6'}>
        {showCharts && (
          <div className={area ? 'contents' : 'grid grid-cols-1 gap-4 lg:grid-cols-3'}>
            {show('chart.attendanceTrend') && (
              <ChartCard
                className="lg:col-span-2"
                title={t('Attendance trend')}
                description={t('Daily attendance rate, last 30 days (present + late)')}
                loading={isLoading}
                table={{
                  columns: [
                    { key: 'date', label: t('Date') },
                    { key: 'rate', label: t('Rate %') },
                    { key: 'present', label: t('Present') },
                    { key: 'absent', label: t('Absent') },
                  ],
                  rows: data?.charts.attendanceTrend ?? [],
                }}
              >
                <AttendanceTrendChart data={data?.charts.attendanceTrend ?? []} />
              </ChartCard>
            )}
            {show('chart.gender') && (
              <ChartCard
                title={t('Boys & girls')}
                description={t('Active students')}
                loading={isLoading}
                table={{
                  columns: [
                    { key: 'g', label: t('Gender') },
                    { key: 'n', label: t('Students') },
                  ],
                  rows: [
                    { g: t('Boys'), n: boys },
                    { g: t('Girls'), n: girls },
                  ],
                }}
              >
                <GenderSplit boys={boys} girls={girls} />
              </ChartCard>
            )}
            {show('chart.studentsPerClass') && (
              <ChartCard
                title={t('Students per class')}
                loading={isLoading}
                table={{
                  columns: [
                    { key: 'name', label: t('Class') },
                    { key: 'students', label: t('Students') },
                    { key: 'capacity', label: t('Capacity') },
                  ],
                  rows: data?.charts.studentsPerClass ?? [],
                }}
              >
                <StudentsPerClassChart data={data?.charts.studentsPerClass ?? []} />
              </ChartCard>
            )}
            {show('chart.stock') && (
              <ChartCard
                title={t('Stock movement')}
                description={t('Value per month ({currency})', { currency })}
                loading={isLoading}
                legend={[
                  { label: t('Stock in'), color: colors.s1 },
                  { label: t('Stock out'), color: colors.s2 },
                ]}
                table={{
                  columns: [
                    { key: 'month', label: t('Month') },
                    { key: 'in', label: t('In') },
                    { key: 'out', label: t('Out') },
                    { key: 'damaged', label: t('Damaged') },
                  ],
                  rows: data?.charts.stockByMonth ?? [],
                }}
              >
                <StockByMonthChart data={data?.charts.stockByMonth ?? []} currency={currency} />
              </ChartCard>
            )}
            {show('chart.loans') && (
              <ChartCard
                title={t('Library loans')}
                description={t('Books per month')}
                loading={isLoading}
                legend={[
                  { label: t('Issued'), color: colors.s1, line: true },
                  { label: t('Returned'), color: colors.s2, line: true },
                ]}
                table={{
                  columns: [
                    { key: 'month', label: t('Month') },
                    { key: 'issued', label: t('Issued') },
                    { key: 'returned', label: t('Returned') },
                  ],
                  rows: data?.charts.loansByMonth ?? [],
                }}
              >
                <LoansByMonthChart data={data?.charts.loansByMonth ?? []} />
              </ChartCard>
            )}
          </div>
        )}

        {showLists && (
          <div className={area ? 'contents' : 'grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3'}>
            {show('list.absentees') && (
              <ListCard
                title={t("Today's absentees")}
                href="/attendance"
                loading={isLoading}
                empty={t('Everyone recorded so far is in school today 🎉')}
              >
                {data?.lists.todaysAbsentees.slice(0, 6).map((a) => (
                  <Row key={a.student.id} href={`/students/${a.student.id}`}>
                    <UserAvatar src={a.student.photo} name={fullName(a.student)} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{fullName(a.student)}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {a.class.name}
                        {a.remark && ` · ${a.remark}`}
                      </p>
                    </div>
                    <StatusBadge status={a.status} />
                  </Row>
                ))}
              </ListCard>
            )}

            {show('list.upcoming') && (
              <ListCard
                title={t('Upcoming activities')}
                href="/activities"
                loading={isLoading}
                empty={t('No activities planned yet.')}
              >
                {data?.lists.upcomingActivities.map((a) => (
                  <Row key={a.id} href={`/activities/${a.id}`}>
                    <DateChip date={a.date} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{a.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {enumLabel(a.category)}
                        {a.startTime && ` · ${a.startTime}`}
                        {a.location && ` · ${a.location}`}
                      </p>
                    </div>
                  </Row>
                ))}
              </ListCard>
            )}

            {show('list.registrations') && (
              <ListCard
                title={t('Recent registrations')}
                href="/students"
                loading={isLoading}
                empty={t('No students registered yet.')}
              >
                {data?.lists.recentRegistrations.map((s) => (
                  <Row key={s.id} href={`/students/${s.id}`}>
                    <UserAvatar src={s.photo} name={fullName(s)} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{fullName(s)}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {s.admissionNumber} · {s.currentClass?.name}
                      </p>
                    </div>
                    <span className="text-xs text-muted-foreground">{formatDate(s.createdAt)}</span>
                  </Row>
                ))}
              </ListCard>
            )}

            {show('list.lowStock') && (
              <ListCard
                title={t('Low-stock alerts')}
                href="/inventory?lowStock=true"
                loading={isLoading}
                empty={t('All items are well stocked.')}
              >
                {data?.lists.lowStock.map((i) => (
                  <Row key={i.id} href={`/inventory/items/${i.id}`}>
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-sunny/20 text-sunny-700 dark:text-sunny">
                      <PackageSearch className="h-4 w-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{i.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t('Reorder at {reorderLevel}', { reorderLevel: i.reorderLevel })}
                      </p>
                    </div>
                    <StatusBadge
                      status={i.quantity === 0 ? 'EXPIRED' : 'LOW'}
                      label={`${formatNumber(i.quantity)} ${enumLabel(i.unit)}`} // i18n-ignore: number and translated unit
                    />
                  </Row>
                ))}
              </ListCard>
            )}

            {show('list.overdue') && (
              <ListCard
                title={t('Overdue books')}
                href="/library/loans?status=OVERDUE"
                loading={isLoading}
                empty={t('No overdue books.')}
              >
                {data?.lists.overdueBooks.map((l) => (
                  <Row key={l.id} href={l.student ? `/students/${l.student.id}` : '/library/loans?status=OVERDUE'}>
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-red-500/10 text-red-600">
                      <BookOpen className="h-4 w-4" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{l.bookCopy.book.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {l.student ? `${fullName(l.student)} · ${l.student.currentClass?.name ?? ''}` : t('Staff')}
                      </p>
                    </div>
                    <span className="text-xs font-semibold text-red-600">
                      {t('Due {date}', { date: formatDate(l.dueDate) })}
                    </span>
                  </Row>
                ))}
              </ListCard>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AlertPill({
  href,
  icon: Icon,
  text,
  tone,
}: {
  href: string;
  icon: typeof AlertTriangle;
  text: string;
  tone: 'sunny' | 'coral' | 'red';
}) {
  const cls = {
    sunny: 'border-sunny/40 bg-sunny/10 text-sunny-700 dark:text-sunny',
    coral: 'border-coral/40 bg-coral/10 text-coral-700 dark:text-coral',
    red: 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300',
  }[tone];
  return (
    <Link
      href={href}
      className={`flex flex-1 items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition hover:shadow-soft ${cls}`}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span className="flex-1">{text}</span>
      <ArrowRight className="h-4 w-4" aria-hidden />
    </Link>
  );
}

function ListCard({
  title,
  href,
  loading,
  empty,
  children,
}: {
  title: string;
  href: string;
  loading: boolean;
  empty: string;
  children: React.ReactNode;
}) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle>{title}</CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link href={href}>
            {t('View all')} <ArrowRight aria-hidden />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-1">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
        ) : items.length ? (
          children
        ) : (
          <EmptyState title={t('All clear')} description={empty} className="py-6" />
        )}
      </CardContent>
    </Card>
  );
}

function Row({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-accent">
      {children}
    </Link>
  );
}

// ─── Marks overview (dashboard?focus=marks) ───

interface MarksOverviewData {
  term: { id: number; name: string; yearName: string } | null;
  totals: {
    assessments: number;
    marksEntered: number;
    average: number | null;
    passRate: number | null;
    belowPass: number;
  } | null;
  classes: {
    classId: number;
    name: string;
    pupils: number;
    courses: number;
    average: number | null;
    passRate: number | null;
    belowPass: number;
  }[];
  recent: {
    id: number;
    title: string;
    type: AssessmentType;
    date: string;
    className: string;
    courseName: string;
    averagePct: number | null;
    markedCount: number;
    rosterSize: number;
  }[];
}

const PASS_MARK = 50;
const pct = (n: number | null | undefined) => formatPercent(n, 1);

function MarksOverview() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['marks-overview'],
    queryFn: () => api.get<MarksOverviewData>('/marks/overview'),
  });
  if (error) return <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />;
  if (data && !data.term)
    return (
      <Card>
        <EmptyState
          icon={NotebookPen}
          title={t('No current term')}
          description={t('Set the current term in Settings to follow marks.')}
        />
      </Card>
    );
  const totals = data?.totals;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          index={0}
          label={t('School average')}
          value={pct(totals?.average)}
          hint={data?.term ? `${data.term.name} · ${data.term.yearName}` : undefined}
          icon={Trophy}
          tone="royal"
          href="/marks?tab=class"
          loading={isLoading}
        />
        <KpiCard
          index={1}
          label={t('Pass rate')}
          value={pct(totals?.passRate)}
          hint={t('Pupils averaging {percent} or more', { percent: formatPercent(PASS_MARK) })}
          icon={NotebookPen}
          tone="mint"
          href="/marks?tab=class"
          loading={isLoading}
        />
        <KpiCard
          index={2}
          label={t('Below the pass mark')}
          value={totals?.belowPass ?? '—'}
          hint={t('Pupils who may need extra support')}
          icon={TrendingDown}
          tone="coral"
          href="/marks?tab=class"
          loading={isLoading}
        />
        <KpiCard
          index={3}
          label={t('Assessments this term')}
          value={totals?.assessments ?? '—'}
          hint={totals && t('{count} marks entered', { count: totals.marksEntered })}
          icon={ClipboardList}
          tone="sunny"
          href="/marks"
          loading={isLoading}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          title={t('Average by class')}
          description={t("Mean of each pupil's course average; the line marks the {percent} pass mark", {
            percent: formatPercent(PASS_MARK),
          })}
          loading={isLoading}
          height={Math.max(160, (data?.classes.length ?? 5) * 44)}
          table={{
            columns: [
              { key: 'name', label: t('Class') },
              { key: 'average', label: t('Average %') },
              { key: 'passRate', label: t('Pass rate %') },
              { key: 'belowPass', label: t('Below pass') },
              { key: 'pupils', label: t('Pupils') },
            ],
            rows: data?.classes ?? [],
          }}
        >
          <ClassAverageBars classes={data?.classes ?? []} />
        </ChartCard>

        <ListCard
          title={t('Latest assessments')}
          href="/marks"
          loading={isLoading}
          empty={t('No assessments recorded this term yet.')}
        >
          {data?.recent.map((a) => (
            <Row key={a.id} href="/marks">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-coral/10 text-coral">
                <NotebookPen className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{a.title}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {t('{className} · {date} · {markedCount}/{rosterSize} marked', {
                    className: a.className,
                    date: formatDate(a.date),
                    markedCount: a.markedCount,
                    rosterSize: a.rosterSize,
                  })}
                </p>
              </div>
              <span className="tabular text-sm font-bold">{pct(a.averagePct)}</span>
            </Row>
          ))}
        </ListCard>
      </div>
    </div>
  );
}

/** One horizontal bar per class in a single hue, value labelled at the end, with a pass-mark reference line. */
function ClassAverageBars({ classes }: { classes: MarksOverviewData['classes'] }) {
  if (!classes.length)
    return (
      <EmptyState
        title={t('No marks yet')}
        description={t('Results appear once teachers enter marks.')}
        className="py-6"
      />
    );
  return (
    <ul className="flex h-full flex-col justify-center gap-3" aria-label={t('Average by class')}>
      {classes.map((c) => (
        <li
          key={c.classId}
          className="group grid grid-cols-[104px_1fr_56px] items-center gap-3"
          title={t(
            '{name}: average {percent}, pass rate {percent2}, {belowPass} below the pass mark, {pupils} pupils',
            {
              name: c.name,
              percent: pct(c.average),
              percent2: pct(c.passRate),
              belowPass: c.belowPass,
              pupils: c.pupils,
            },
          )}
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{c.name}</span>
            <span className="block text-[11px] text-muted-foreground">
              {c.belowPass ? t('{belowPass} below pass', { belowPass: c.belowPass }) : t('All passing')}
            </span>
          </span>
          <span className="relative h-4 rounded-full bg-muted">
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-primary transition-[filter] group-hover:brightness-110"
              style={{ width: `${Math.min(100, c.average ?? 0)}%` }}
            />
            <span
              className="absolute -inset-y-1 w-0.5 rounded bg-foreground/50"
              style={{ left: `${PASS_MARK}%` }}
              aria-hidden
            />
          </span>
          <span className="tabular text-right text-sm font-bold">{pct(c.average)}</span>
        </li>
      ))}
    </ul>
  );
}
