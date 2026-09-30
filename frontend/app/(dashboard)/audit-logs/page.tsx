'use client';
import { Suspense, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Eye, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { UserAvatar } from '@/components/ui/misc';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { PageHeader } from '@/components/shared/page-header';
import { RequirePermission } from '@/components/shared/require';
import { DataTable, type Column } from '@/components/tables/data-table';
import { SearchInput } from '@/components/forms/search-input';
import { FilterSelect } from '@/components/forms/field';
import { useListParams } from '@/hooks/use-list-params';
import { api } from '@/lib/api';
import { enumLabel } from '@/lib/labels';
import { cn, formatDateTime, fullName } from '@/lib/utils';
import type { AuditLog } from '@/types';
import { t } from '@/lib/i18n';

const FILTERS = ['action', 'entity', 'userId', 'from', 'to'] as const;

const ACTION_VARIANT: Record<string, NonNullable<BadgeProps['variant']>> = {
  CREATE: 'green',
  UPDATE: 'blue',
  DELETE: 'red',
  RESTORE: 'purple',
  LOGIN: 'gray',
  LOGOUT: 'gray',
  LOGIN_FAILED: 'amber',
  PASSWORD_CHANGE: 'purple',
  PASSWORD_RESET: 'purple',
  STATUS_CHANGE: 'amber',
  PROMOTE: 'purple',
  IMPORT: 'green',
  STOCK_MOVEMENT: 'blue',
  ISSUE: 'blue',
  RETURN: 'green',
};

function AuditInner() {
  const list = useListParams(FILTERS, { pageSize: 25 });
  const [open, setOpen] = useState<AuditLog | null>(null);
  const { data: filters } = useQuery({
    queryKey: ['audit-filters'],
    queryFn: () =>
      api.get<{
        entities: string[];
        actions: string[];
        users: { id: number; firstName: string; lastName: string }[];
      }>('/audit-logs/filters'),
  });
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['audit', list.query],
    queryFn: () => api.list<AuditLog>('/audit-logs', list.query),
    placeholderData: (p) => p,
  });

  const columns: Column<AuditLog>[] = [
    {
      key: 'when',
      header: t('When'),
      cell: (l) => <span className="tabular whitespace-nowrap text-sm">{formatDateTime(l.createdAt)}</span>,
    },
    {
      key: 'user',
      header: t('User'),
      cell: (l) =>
        l.user ? (
          <span className="flex items-center gap-2">
            <UserAvatar name={fullName(l.user)} size="xs" />
            <span className="text-sm">{fullName(l.user)}</span>
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">{t('System')}</span>
        ),
    },
    {
      key: 'action',
      header: t('Action'),
      fixed: true,
      cell: (l) => <Badge variant={ACTION_VARIANT[l.action] ?? 'gray'}>{enumLabel(l.action)}</Badge>,
    },
    {
      key: 'entity',
      header: t('Entity'),
      cell: (l) => (
        <span className="font-medium">
          {enumLabel(l.entity)}
          {l.entityId && <span className="tabular text-muted-foreground"> #{l.entityId}</span>}
        </span>
      ),
    },
    {
      key: 'changes',
      header: t('Changes'),
      cell: (l) => <span className="text-xs text-muted-foreground">{summarize(l)}</span>,
    },
    {
      key: 'ip',
      header: t('IP'),
      hidden: true,
      cell: (l) => <span className="tabular text-xs">{l.ip ?? '—'}</span>,
    },
    {
      key: 'view',
      header: <span className="sr-only">{t('View')}</span>,
      fixed: true,
      align: 'right',
      cell: (l) => (
        <Button variant="ghost" size="icon-sm" onClick={() => setOpen(l)} aria-label={t('View details')}>
          <Eye />
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t('Audit logs')}
        description={t('Every create, update, delete and sign-in, with before/after values.')}
        icon={<ShieldCheck />}
      />
      <DataTable
        storageKey="audit"
        columns={columns}
        data={data?.data}
        rowKey={(l) => l.id}
        loading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        meta={data?.meta}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        onRowClick={setOpen}
        dense
        empty={{ icon: ShieldCheck, title: t('No log entries match') }}
        toolbar={
          <>
            <SearchInput
              value={list.search}
              onChange={list.setSearch}
              placeholder={t('Entity, id or IP…')}
              className="sm:w-52"
            />
            <FilterSelect
              value={list.filters.action}
              onChange={(v) => list.setFilter('action', v)}
              placeholder={t('Action')}
              allLabel={t('All actions')}
              options={(filters?.actions ?? []).map((a) => ({
                value: a,
                label: enumLabel(a),
              }))}
            />
            <FilterSelect
              value={list.filters.entity}
              onChange={(v) => list.setFilter('entity', v)}
              placeholder={t('Entity')}
              allLabel={t('All entities')}
              options={(filters?.entities ?? []).map((e) => ({
                value: e,
                label: enumLabel(e),
              }))}
            />
            <FilterSelect
              value={list.filters.userId}
              onChange={(v) => list.setFilter('userId', v)}
              placeholder={t('User')}
              allLabel={t('All users')}
              options={(filters?.users ?? []).map((u) => ({
                value: String(u.id),
                label: fullName(u),
              }))}
            />
            <Input
              type="date"
              value={list.filters.from ?? ''}
              onChange={(e) => list.setFilter('from', e.target.value || undefined)}
              className="w-40"
              aria-label={t('From')}
            />
            <Input
              type="date"
              value={list.filters.to ?? ''}
              onChange={(e) => list.setFilter('to', e.target.value || undefined)}
              className="w-40"
              aria-label={t('To')}
            />
          </>
        }
      />
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-3xl">
          {open && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Badge variant={ACTION_VARIANT[open.action] ?? 'gray'}>{enumLabel(open.action)}</Badge>{' '}
                  {enumLabel(open.entity)}
                  {open.entityId && <span className="tabular text-muted-foreground">#{open.entityId}</span>}
                </DialogTitle>
                <DialogDescription>
                  {open.user ? `${fullName(open.user)} (${open.user.email})` : t('System')} ·{' '}
                  {formatDateTime(open.createdAt)} · {open.ip ?? t('No IP address')}
                </DialogDescription>
              </DialogHeader>
              <DiffView oldValues={open.oldValues} newValues={open.newValues} />
              {open.userAgent && <p className="truncate text-xs text-muted-foreground">{open.userAgent}</p>}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function summarize(l: AuditLog): string {
  const keys = Object.keys(l.newValues ?? l.oldValues ?? {}).filter(
    (k) => !['id', 'createdAt', 'updatedAt'].includes(k),
  );
  if (!keys.length) return '—';
  return keys.slice(0, 4).join(', ') + (keys.length > 4 ? ` +${keys.length - 4}` : '');
}

function show(v: unknown): string {
  if (v === undefined) return '';
  if (v === null) return 'null';
  if (typeof v === 'object') return JSON.stringify(v, null, 2);
  return String(v);
}

/** Side-by-side before/after table; changed rows are highlighted. */
function DiffView({
  oldValues,
  newValues,
}: {
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
}) {
  const keys = [...new Set([...Object.keys(oldValues ?? {}), ...Object.keys(newValues ?? {})])];
  if (!keys.length)
    return <p className="text-sm text-muted-foreground">{t('No field values were recorded for this action.')}</p>;
  return (
    <div className="max-h-[60vh] overflow-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-muted">
          <tr>
            <th className="px-3 py-2 text-left text-xs font-bold uppercase text-muted-foreground">{t('Field')}</th>
            <th className="px-3 py-2 text-left text-xs font-bold uppercase text-muted-foreground">{t('Before')}</th>
            <th className="px-3 py-2 text-left text-xs font-bold uppercase text-muted-foreground">{t('After')}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {keys.map((k) => {
            const a = show(oldValues?.[k]);
            const b = show(newValues?.[k]);
            const changed = oldValues && newValues && a !== b;
            return (
              <tr key={k} className={cn(changed && 'bg-sunny/10')}>
                <td className="px-3 py-2 align-top font-semibold">{k}</td>
                <td className="px-3 py-2 align-top">
                  <pre
                    className={cn(
                      'whitespace-pre-wrap break-all font-mono text-xs',
                      changed && 'text-red-600 line-through decoration-red-400/60',
                    )}
                  >
                    {a || '—'}
                  </pre>
                </td>
                <td className="px-3 py-2 align-top">
                  <pre
                    className={cn(
                      'whitespace-pre-wrap break-all font-mono text-xs',
                      changed && 'font-semibold text-emerald-700 dark:text-emerald-400',
                    )}
                  >
                    {b || '—'}
                  </pre>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function AuditLogsPage() {
  return (
    <RequirePermission permission="audit.view">
      <Suspense>
        <AuditInner />
      </Suspense>
    </RequirePermission>
  );
}
