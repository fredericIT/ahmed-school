'use client';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { StatusBadge } from '@/components/shared/status-badge';
import { cn, formatDate, formatMoney, formatNumber, formatPercent } from '@/lib/utils';
import type { Report, ReportColumn } from '@/types';
import { t } from '@/lib/i18n';

const STATUS_KEYS = new Set(['status', 'flag', 'type']);

function renderCell(col: ReportColumn, value: unknown, currency: string) {
  if (value === null || value === undefined || value === '') return <span className="text-muted-foreground">—</span>;
  if (STATUS_KEYS.has(col.key) && typeof value === 'string' && /^[A-Z_]+$/.test(value))
    return <StatusBadge status={value} />;
  switch (col.format) {
    case 'money':
      return formatMoney(Number(value), currency);
    case 'number':
      return formatNumber(Number(value), 2);
    case 'percent': {
      const n = Number(value);
      return (
        <span
          className={cn(
            'font-semibold',
            n < 80
              ? 'text-red-600 dark:text-red-400'
              : n < 90
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-emerald-600 dark:text-emerald-400',
          )}
        >
          {formatPercent(n, 1)}
        </span>
      );
    }
    case 'score': {
      // Mark percentages: red below the pass mark (50%), amber below 70%.
      const n = Number(value);
      return (
        <span
          className={cn(
            'font-semibold',
            n < 50
              ? 'text-red-600 dark:text-red-400'
              : n < 70
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-emerald-600 dark:text-emerald-400',
          )}
        >
          {formatPercent(n, 1)}
        </span>
      );
    }
    case 'date':
      return formatDate(String(value));
    default:
      return String(value);
  }
}

/** Renders any backend `Report` (title/columns/rows/summary) as a styled, printable table. */
export function ReportTable({
  report,
  loading,
  currency = 'RWF',
}: {
  report?: Report;
  loading?: boolean;
  currency?: string;
}) {
  if (loading || !report) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }
  return (
    <div>
      {report.summary && report.summary.length > 0 && (
        <div className="flex flex-wrap gap-3 p-4">
          {report.summary.map((s) => (
            <div key={s.label} className="min-w-[130px] rounded-xl bg-primary/5 px-4 py-2 ring-1 ring-primary/10">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="tabular font-heading text-lg font-extrabold">
                {typeof s.value === 'number' ? formatNumber(s.value) : s.value}
              </p>
            </div>
          ))}
        </div>
      )}
      {report.rows.length === 0 ? (
        <EmptyState
          title={t('No records for these filters')}
          description={t('Try a wider date range or another class.')}
        />
      ) : (
        <div className="scrollbar-thin max-h-[65vh] overflow-auto border-t">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted/90 backdrop-blur">
              <tr>
                {report.columns.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    className={cn(
                      'whitespace-nowrap px-4 py-2.5 text-left font-heading text-[11.5px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground',
                      ['money', 'number', 'percent', 'score'].includes(c.format ?? '') && 'text-right',
                    )}
                  >
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {report.rows.map((row, i) => (
                <tr key={i} className="hover:bg-muted/40">
                  {report.columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        'tabular px-4 py-2',
                        // Keep names, codes and figures on one line; only long free text wraps.
                        String(row[c.key] ?? '').length <= 40 && 'whitespace-nowrap',
                        ['money', 'number', 'percent', 'score'].includes(c.format ?? '') && 'text-right',
                      )}
                    >
                      {renderCell(c, row[c.key], currency)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
