'use client';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { useReducedMotion } from 'framer-motion';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from 'recharts';
import { BarChart3, Table2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn, dateFormat, formatMoney, formatNumber, formatPercent } from '@/lib/utils';
import { t, tRich } from '@/lib/i18n';

/**
 * Chart palette (validated with the dataviz CVD validator, light & dark):
 * series 1 = royal blue, series 2 = coral. Dark steps are selected for the dark surface, not flipped.
 */
const PALETTE = {
  light: {
    s1: '#4F6BED',
    s2: '#F0604F',
    grid: '#E5E7EB',
    axis: '#64748B',
    cursor: '#CBD5E1',
  },
  dark: {
    s1: '#6F86F2',
    s2: '#E5533F',
    grid: '#1F2A44',
    axis: '#94A3B8',
    cursor: '#334155',
  },
};

export function useChartColors() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const reduce = useReducedMotion();
  // Animations are skipped for users who ask for reduced motion.
  return {
    ...PALETTE[mounted && resolvedTheme === 'dark' ? 'dark' : 'light'],
    animate: !reduce,
  };
}

interface TableSpec {
  columns: { key: string; label: string }[];
  rows: Record<string, string | number | null>[];
}

/** Card wrapper with a chart ⇄ table toggle so every chart has an accessible data view. */
export function ChartCard({
  title,
  description,
  loading,
  table,
  legend,
  children,
  className,
  height = 260,
}: {
  title: string;
  description?: string;
  loading?: boolean;
  table?: TableSpec;
  legend?: { label: string; color: string; line?: boolean }[];
  children: React.ReactNode;
  className?: string;
  height?: number;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader className="flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle>{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {table && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setAsTable((v) => !v)}
            aria-label={asTable ? t('Show chart') : t('Show data table')}
            aria-pressed={asTable}
          >
            {asTable ? <BarChart3 /> : <Table2 />}
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex-1">
        {legend && !asTable && (
          <ul className="mb-3 flex flex-wrap gap-4 text-xs font-medium text-muted-foreground" aria-label={t('Legend')}>
            {legend.map((l) => (
              <li key={l.label} className="flex items-center gap-1.5">
                <span
                  className={cn('inline-block', l.line ? 'h-0.5 w-4 rounded' : 'h-2.5 w-2.5 rounded-sm')}
                  style={{ background: l.color }}
                  aria-hidden
                />
                {l.label}
              </li>
            ))}
          </ul>
        )}
        {loading ? (
          <Skeleton className="w-full" style={{ height }} />
        ) : asTable && table ? (
          <div className="overflow-auto" style={{ maxHeight: height }}>
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr>
                  {table.columns.map((c) => (
                    <th
                      key={c.key}
                      className="border-b px-2 py-1.5 text-left text-xs font-bold uppercase text-muted-foreground"
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r, i) => (
                  <tr key={i} className="border-b last:border-0">
                    {table.columns.map((c) => (
                      <td key={c.key} className="tabular px-2 py-1.5">
                        {r[c.key] ?? '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div
            style={{ height }}
            role="img"
            aria-label={t('{title} chart. Use the table button for the data.', { title })}
          >
            {children}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  format,
}: TooltipProps<number, string> & {
  format?: (v: number, name: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border bg-popover px-3 py-2 text-xs shadow-lift">
      <p className="mb-1 font-semibold text-foreground">{label}</p>
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="flex items-center gap-2 text-muted-foreground">
          <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} aria-hidden />
          <span>{p.name}:</span>
          <span className="tabular font-semibold text-foreground">
            {format ? format(Number(p.value), String(p.name)) : formatNumber(Number(p.value), 2)}
          </span>
        </p>
      ))}
    </div>
  );
}

const axisProps = (color: string) => ({
  tick: { fill: color, fontSize: 11 },
  tickLine: false,
  axisLine: false,
});

export function AttendanceTrendChart({
  data,
}: {
  data: {
    date: string;
    rate: number | null;
    present: number;
    absent: number;
  }[];
}) {
  const c = useChartColors();
  const rows = data.map((d) => ({
    ...d,
    label: dateFormat({
      day: 'numeric',
      month: 'short',
    }).format(new Date(`${d.date}T00:00:00Z`)),
  }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={rows} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="attFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c.s1} stopOpacity={0.25} />
            <stop offset="100%" stopColor={c.s1} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke={c.grid} />
        <XAxis dataKey="label" {...axisProps(c.axis)} minTickGap={24} />
        <YAxis
          domain={[0, 100]}
          ticks={[0, 25, 50, 75, 100]}
          {...axisProps(c.axis)}
          tickFormatter={(v) => formatPercent(v)}
        />
        <Tooltip
          cursor={{ stroke: c.cursor, strokeWidth: 1 }}
          content={<ChartTooltip format={(v) => formatPercent(v, 1)} />}
        />
        <Area
          isAnimationActive={c.animate}
          animationDuration={600}
          type="monotone"
          dataKey="rate"
          name="Attendance rate"
          stroke={c.s1}
          strokeWidth={2}
          fill="url(#attFill)"
          connectNulls
          activeDot={{ r: 5, strokeWidth: 2, stroke: 'hsl(var(--card))' }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function StudentsPerClassChart({ data }: { data: { name: string; students: number; capacity: number }[] }) {
  const c = useChartColors();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid vertical={false} stroke={c.grid} />
        <XAxis
          dataKey="name"
          {...axisProps(c.axis)}
          interval={0}
          tickFormatter={(v: string) => v.replace(/ Class$/, '')}
        />
        <YAxis allowDecimals={false} {...axisProps(c.axis)} />
        <Tooltip
          cursor={{ fill: c.grid, opacity: 0.5 }}
          content={({ active, payload, label }) =>
            active && payload?.length ? (
              <div className="rounded-xl border bg-popover px-3 py-2 text-xs shadow-lift">
                <p className="font-semibold">{label}</p>
                <p className="text-muted-foreground">
                  {tRich('{students} of {capacity} seats', {
                    students: (
                      <span className="tabular font-semibold text-foreground">{payload[0].payload.students}</span>
                    ),
                    capacity: payload[0].payload.capacity,
                  })}
                </p>
              </div>
            ) : null
          }
        />
        <Bar
          isAnimationActive={c.animate}
          animationDuration={600}
          dataKey="students"
          name="Students"
          fill={c.s1}
          radius={[4, 4, 0, 0]}
          maxBarSize={48}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function StockByMonthChart({
  data,
  currency,
}: {
  data: { month: string; in: number; out: number }[];
  currency: string;
}) {
  const c = useChartColors();
  const rows = data.map((d) => ({ ...d, label: monthLabel(d.month) }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={{ top: 8, right: 8, left: 4, bottom: 0 }} barGap={2} barCategoryGap="24%">
        <CartesianGrid vertical={false} stroke={c.grid} />
        <XAxis dataKey="label" {...axisProps(c.axis)} />
        <YAxis {...axisProps(c.axis)} tickFormatter={compact} width={44} />
        <Tooltip
          cursor={{ fill: c.grid, opacity: 0.5 }}
          content={<ChartTooltip format={(v) => formatMoney(v, currency)} />}
        />
        <Bar
          isAnimationActive={c.animate}
          animationDuration={600}
          dataKey="in"
          name="Stock in"
          fill={c.s1}
          radius={[4, 4, 0, 0]}
          maxBarSize={28}
        />
        <Bar
          isAnimationActive={c.animate}
          animationDuration={600}
          dataKey="out"
          name="Stock out"
          fill={c.s2}
          radius={[4, 4, 0, 0]}
          maxBarSize={28}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function LoansByMonthChart({ data }: { data: { month: string; issued: number; returned: number }[] }) {
  const c = useChartColors();
  const rows = data.map((d) => ({ ...d, label: monthLabel(d.month) }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={rows} margin={{ top: 8, right: 12, left: -18, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={c.grid} />
        <XAxis dataKey="label" {...axisProps(c.axis)} />
        <YAxis allowDecimals={false} {...axisProps(c.axis)} />
        <Tooltip cursor={{ stroke: c.cursor, strokeWidth: 1 }} content={<ChartTooltip />} />
        <Line
          isAnimationActive={c.animate}
          animationDuration={600}
          type="monotone"
          dataKey="issued"
          name="Issued"
          stroke={c.s1}
          strokeWidth={2}
          dot={{ r: 4, fill: c.s1, strokeWidth: 2, stroke: 'hsl(var(--card))' }}
          activeDot={{ r: 6 }}
        />
        <Line
          isAnimationActive={c.animate}
          animationDuration={600}
          type="monotone"
          dataKey="returned"
          name="Returned"
          stroke={c.s2}
          strokeWidth={2}
          dot={{ r: 4, fill: c.s2, strokeWidth: 2, stroke: 'hsl(var(--card))' }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Two-part split as a labelled bar with numbers, rather than a two-slice pie. */
export function GenderSplit({ boys, girls }: { boys: number; girls: number }) {
  const c = useChartColors();
  const total = boys + girls || 1;
  const pb = Math.round((boys / total) * 100);
  return (
    <div className="flex h-full flex-col justify-center gap-5">
      <div className="grid grid-cols-2 gap-4">
        {[
          { label: t('Boys'), n: boys, p: pb, color: c.s1 },
          { label: t('Girls'), n: girls, p: 100 - pb, color: c.s2 },
        ].map((g) => (
          <div key={g.label}>
            <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: g.color }} aria-hidden />
              {g.label}
            </p>
            <p className="tabular font-heading text-3xl font-extrabold">{g.n}</p>
            <p className="tabular text-xs text-muted-foreground">
              {t('{percent} of students', { percent: formatPercent(g.p) })}
            </p>
          </div>
        ))}
      </div>
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full" aria-hidden>
        <div className="h-full rounded-l-full" style={{ width: `${pb}%`, background: c.s1 }} />
        <div className="h-full flex-1 rounded-r-full" style={{ background: c.s2 }} />
      </div>
    </div>
  );
}

function monthLabel(m: string) {
  return dateFormat({
    month: 'short',
  }).format(new Date(`${m}-01T00:00:00Z`));
}

function compact(v: number) {
  return v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(v);
}

export const CHART_SERIES = PALETTE;
