'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { ExportMenu } from '@/components/shared/export-menu';
import { DataTable, type Column } from '@/components/tables/data-table';
import { SearchInput } from '@/components/forms/search-input';
import { FilterSelect } from '@/components/forms/field';
import { InventoryNav, MovementDialog } from '@/components/forms/inventory-dialogs';
import { useListParams } from '@/hooks/use-list-params';
import { useClasses, useCurrency, useInventoryCategories } from '@/hooks/use-lookups';
import { api } from '@/lib/api';
import { enumLabel } from '@/lib/labels';
import { cn, formatDate, formatMoney } from '@/lib/utils';
import type { StockMovement } from '@/types';
import { t } from '@/lib/i18n';

const FILTERS = ['type', 'classId', 'categoryId', 'from', 'to'] as const;

function MovementsInner() {
  const qc = useQueryClient();
  const sp = useSearchParams();
  const currency = useCurrency();
  const list = useListParams(FILTERS, { pageSize: 25 });
  const { data: classes } = useClasses();
  const { data: categories } = useInventoryCategories();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (sp.get('new')) setOpen(true);
  }, [sp]);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['stock-movements', list.query],
    queryFn: () => api.list<StockMovement>('/inventory/movements', list.query),
    placeholderData: (p) => p,
  });

  const columns: Column<StockMovement>[] = [
    { key: 'date', header: t('Date'), cell: (m) => formatDate(m.date) },
    {
      key: 'item',
      header: t('Item'),
      fixed: true,
      cell: (m) => (
        <Link
          href={`/inventory/items/${m.item?.id}`}
          className="font-semibold hover:text-primary"
          onClick={(e) => e.stopPropagation()}
        >
          {m.item?.name}
          <span className="block text-xs font-normal text-muted-foreground">{m.item?.sku}</span>
        </Link>
      ),
    },
    {
      key: 'type',
      header: t('Type'),
      cell: (m) => <StatusBadge status={m.type} label={enumLabel(m.type)} />,
    },
    {
      key: 'qty',
      header: t('Quantity'),
      align: 'right',
      cell: (m) => {
        const signed =
          m.type === 'ADJUSTMENT' ? m.quantity : m.type === 'IN' || m.type === 'RETURN' ? m.quantity : -m.quantity;
        return (
          <span className={cn('tabular font-bold', signed >= 0 ? 'text-emerald-600' : 'text-red-600')}>
            {signed > 0 ? `+${signed}` : signed}
          </span>
        );
      },
    },
    {
      key: 'balance',
      header: t('Balance'),
      align: 'right',
      cell: (m) => <span className="tabular">{m.balanceAfter}</span>,
    },
    {
      key: 'value',
      header: t('Value'),
      align: 'right',
      cell: (m) => (
        <span className="tabular">{formatMoney(Math.abs(m.quantity) * Number(m.unitCost ?? 0), currency)}</span>
      ),
    },
    {
      key: 'party',
      header: t('Supplier / issued to'),
      cell: (m) => [m.supplier?.name, m.issuedClass?.name, m.issuedTo].filter(Boolean).join(' · ') || '—',
    },
    {
      key: 'reason',
      header: t('Reason'),
      cell: (m) => (
        <span className="text-muted-foreground">{[m.reason, m.reference].filter(Boolean).join(' · ') || '—'}</span>
      ),
    },
    {
      key: 'user',
      header: t('Recorded by'),
      hidden: true,
      cell: (m) => (m.user ? `${m.user.firstName} ${m.user.lastName}` : '—'),
    },
  ];

  return (
    <>
      <PageHeader
        title={t('Stock movements')}
        description={t('Every stock in, stock out, adjustment and write-off.')}
        icon={<Package />}
        breadcrumbs={[{ label: t('Inventory'), href: '/inventory' }, { label: t('Movements') }]}
        actions={
          <>
            <ExportMenu path="/inventory/movements" query={list.query} />
            <Button onClick={() => setOpen(true)}>
              <ArrowLeftRight aria-hidden /> {t('Record movement')}
            </Button>
          </>
        }
      />
      <InventoryNav />
      <DataTable
        storageKey="movements"
        columns={columns}
        data={data?.data}
        rowKey={(m) => m.id}
        loading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        meta={data?.meta}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        empty={{
          icon: ArrowLeftRight,
          title: t('No movements for these filters'),
        }}
        toolbar={
          <>
            <SearchInput
              value={list.search}
              onChange={list.setSearch}
              placeholder={t('Item name or SKU…')}
              className="sm:w-56"
            />
            <FilterSelect
              value={list.filters.type}
              onChange={(v) => list.setFilter('type', v)}
              placeholder={t('Type')}
              allLabel={t('All types')}
              options={['IN', 'OUT', 'RETURN', 'DAMAGED', 'ADJUSTMENT'].map((type) => ({
                value: type,
                label: enumLabel(type),
              }))}
              className="sm:w-36"
            />
            <FilterSelect
              value={list.filters.categoryId}
              onChange={(v) => list.setFilter('categoryId', v)}
              placeholder={t('Category')}
              allLabel={t('All categories')}
              options={(categories ?? []).map((c) => ({
                value: String(c.id),
                label: c.name,
              }))}
            />
            <FilterSelect
              value={list.filters.classId}
              onChange={(v) => list.setFilter('classId', v)}
              placeholder={t('Class')}
              allLabel={t('All classes')}
              options={(classes ?? []).map((c) => ({
                value: String(c.id),
                label: c.name,
              }))}
              className="sm:w-36"
            />
            <Input
              type="date"
              value={list.filters.from ?? ''}
              onChange={(e) => list.setFilter('from', e.target.value || undefined)}
              className="w-40"
              aria-label={t('From date')}
            />
            <Input
              type="date"
              value={list.filters.to ?? ''}
              onChange={(e) => list.setFilter('to', e.target.value || undefined)}
              className="w-40"
              aria-label={t('To date')}
            />
          </>
        }
      />
      <MovementDialog
        open={open}
        onOpenChange={setOpen}
        onSaved={() => {
          void qc.invalidateQueries({ queryKey: ['stock-movements'] });
          void qc.invalidateQueries({ queryKey: ['inventory-items'] });
        }}
      />
    </>
  );
}

export default function MovementsPage() {
  return (
    <Suspense>
      <MovementsInner />
    </Suspense>
  );
}
