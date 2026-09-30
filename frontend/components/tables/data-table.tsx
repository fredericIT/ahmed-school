'use client';
import { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Columns3,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmptyState, ErrorState } from '@/components/shared/empty-state';
import type { PageMeta } from '@/lib/api';
import { cn } from '@/lib/utils';
import { t, tRich } from '@/lib/i18n';

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  /** Server-side sort field; omit for unsortable columns. */
  sortKey?: string;
  className?: string;
  headerClassName?: string;
  /** Hidden by default; user can re-enable via the column menu. */
  hidden?: boolean;
  /** Can't be hidden (e.g. name, actions). */
  fixed?: boolean;
  align?: 'left' | 'right' | 'center';
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[] | undefined;
  rowKey: (row: T) => string | number;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  meta?: PageMeta;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  onSortChange?: (sortBy: string, order: 'asc' | 'desc') => void;
  onRowClick?: (row: T) => void;
  empty?: {
    icon?: LucideIcon;
    title: string;
    description?: string;
    action?: React.ReactNode;
  };
  toolbar?: React.ReactNode;
  storageKey?: string;
  className?: string;
  dense?: boolean;
}

export function DataTable<T>({
  columns,
  data,
  rowKey,
  loading,
  error,
  onRetry,
  meta,
  onPageChange,
  onPageSizeChange,
  sortBy,
  sortOrder,
  onSortChange,
  onRowClick,
  empty,
  toolbar,
  storageKey,
  className,
  dense,
}: DataTableProps<T>) {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(columns.filter((c) => c.hidden).map((c) => c.key)));

  // Remember column choices per table.
  useEffect(() => {
    if (!storageKey) return;
    const saved = localStorage.getItem(`cols:${storageKey}`);
    if (saved) setHidden(new Set(JSON.parse(saved) as string[]));
  }, [storageKey]);
  const toggle = (key: string) => {
    const next = new Set(hidden);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setHidden(next);
    if (storageKey) localStorage.setItem(`cols:${storageKey}`, JSON.stringify([...next]));
  };

  const visible = columns.filter((c) => !hidden.has(c.key));
  const hideable = columns.filter((c) => !c.fixed && typeof c.header === 'string');
  const pad = dense ? 'px-3 py-2' : 'px-4 py-3';

  const sortIcon = (c: Column<T>) => {
    if (!c.sortKey) return null;
    if (sortBy !== c.sortKey) return <ArrowUpDown className="h-3.5 w-3.5 opacity-40" aria-hidden />;
    return sortOrder === 'asc' ? (
      <ArrowUp className="h-3.5 w-3.5" aria-hidden />
    ) : (
      <ArrowDown className="h-3.5 w-3.5" aria-hidden />
    );
  };

  return (
    <div className={cn('overflow-hidden rounded-2xl border bg-card shadow-soft', className)}>
      {(toolbar || hideable.length > 0) && (
        <div className="no-print flex flex-col gap-3 border-b p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-2">{toolbar}</div>
          {hideable.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="self-end sm:self-auto">
                  <Columns3 aria-hidden /> {t('Columns')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>{t('Show columns')}</DropdownMenuLabel>
                {hideable.map((c) => (
                  <DropdownMenuCheckboxItem
                    key={c.key}
                    checked={!hidden.has(c.key)}
                    onCheckedChange={() => toggle(c.key)}
                    onSelect={(e) => e.preventDefault()}
                  >
                    {c.header}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}

      <div className="scrollbar-thin max-h-[70vh] overflow-auto">
        <table className="w-full caption-bottom text-sm">
          <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur supports-[backdrop-filter]:bg-muted/60">
            <tr>
              {visible.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={
                    c.sortKey && sortBy === c.sortKey ? (sortOrder === 'asc' ? 'ascending' : 'descending') : undefined
                  }
                  className={cn(
                    'whitespace-nowrap text-left font-heading text-[11.5px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground',
                    pad,
                    c.align === 'right' && 'text-right',
                    c.align === 'center' && 'text-center',
                    c.headerClassName,
                  )}
                >
                  {c.sortKey && onSortChange ? (
                    <button
                      type="button"
                      className={cn(
                        'inline-flex items-center gap-1 rounded hover:text-foreground',
                        c.align === 'right' && 'flex-row-reverse',
                      )}
                      onClick={() =>
                        onSortChange(c.sortKey as string, sortBy === c.sortKey && sortOrder === 'asc' ? 'desc' : 'asc')
                      }
                    >
                      {c.header}
                      {sortIcon(c)}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={`sk-${i}`}>
                  {visible.map((c) => (
                    <td key={c.key} className={pad}>
                      <Skeleton className="h-5 w-full max-w-[160px]" />
                    </td>
                  ))}
                </tr>
              ))}
            {!loading &&
              data?.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={
                    onRowClick ? (e) => e.key === 'Enter' && e.target === e.currentTarget && onRowClick(row) : undefined
                  }
                  tabIndex={onRowClick ? 0 : undefined}
                  className={cn(
                    'transition-colors hover:bg-muted/40',
                    onRowClick && 'cursor-pointer focus-visible:bg-muted/50 focus-visible:outline-none',
                  )}
                >
                  {visible.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        pad,
                        'align-middle',
                        c.align === 'right' && 'whitespace-nowrap text-right',
                        c.align === 'center' && 'text-center',
                        c.className,
                      )}
                    >
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
        {!loading && !!error && (
          <ErrorState message={error instanceof Error ? error.message : undefined} onRetry={onRetry} />
        )}
        {!loading && !error && data?.length === 0 && (
          <EmptyState
            icon={empty?.icon}
            title={empty?.title ?? t('Nothing here yet')}
            description={empty?.description}
            action={empty?.action}
          />
        )}
      </div>

      {meta && onPageChange && (
        <Pagination meta={meta} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} />
      )}
    </div>
  );
}

export function Pagination({
  meta,
  onPageChange,
  onPageSizeChange,
}: {
  meta: PageMeta;
  onPageChange: (p: number) => void;
  onPageSizeChange?: (s: number) => void;
}) {
  const from = meta.total === 0 ? 0 : (meta.page - 1) * meta.pageSize + 1;
  const to = Math.min(meta.total, meta.page * meta.pageSize);
  return (
    <div className="no-print flex flex-col items-center justify-between gap-3 border-t px-4 py-3 text-sm sm:flex-row">
      <p className="text-muted-foreground">
        {tRich('Showing {from}–{to} of {total}', {
          from: <span className="tabular font-semibold text-foreground">{from}</span>,
          to: <span className="tabular font-semibold text-foreground">{to}</span>,
          total: <span className="tabular font-semibold text-foreground">{meta.total}</span>,
        })}
      </p>
      <div className="flex items-center gap-2">
        {onPageSizeChange && (
          <Select value={String(meta.pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
            <SelectTrigger className="h-8 w-[112px]" aria-label={t('Rows per page')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 20, 50, 100].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {t('{n} / page', { n })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onPageChange(1)}
          disabled={meta.page <= 1}
          aria-label={t('First page')}
        >
          <ChevronsLeft />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onPageChange(meta.page - 1)}
          disabled={meta.page <= 1}
          aria-label={t('Previous page')}
        >
          <ChevronLeft />
        </Button>
        <span className="tabular min-w-[72px] text-center font-medium">
          {meta.page} / {meta.totalPages}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onPageChange(meta.page + 1)}
          disabled={meta.page >= meta.totalPages}
          aria-label={t('Next page')}
        >
          <ChevronRight />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onPageChange(meta.totalPages)}
          disabled={meta.page >= meta.totalPages}
          aria-label={t('Last page')}
        >
          <ChevronsRight />
        </Button>
      </div>
    </div>
  );
}
