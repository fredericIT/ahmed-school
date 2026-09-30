'use client';
import { Suspense, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ArrowLeftRight, Package, PackageSearch, Plus, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/misc';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { ExportMenu } from '@/components/shared/export-menu';
import { KpiCard } from '@/components/shared/kpi-card';
import { DataTable, type Column } from '@/components/tables/data-table';
import { SearchInput } from '@/components/forms/search-input';
import { FilterSelect } from '@/components/forms/field';
import { InventoryNav, ItemDialog, MovementDialog } from '@/components/forms/inventory-dialogs';
import { useListParams } from '@/hooks/use-list-params';
import { useCurrency, useInventoryCategories, useSuppliers } from '@/hooks/use-lookups';
import { api } from '@/lib/api';
import { cn, formatDate, formatMoney } from '@/lib/utils';
import type { InventoryItem } from '@/types';
import { t } from '@/lib/i18n';
import { enumLabel } from '@/lib/labels';

const FILTERS = ['categoryId', 'supplierId', 'lowStock', 'expiring'] as const;

function InventoryInner() {
  const router = useRouter();
  const qc = useQueryClient();
  const currency = useCurrency();
  const list = useListParams(FILTERS, { sortBy: 'name', sortOrder: 'asc' });
  const { data: categories } = useInventoryCategories();
  const { data: suppliers } = useSuppliers();
  const [itemOpen, setItemOpen] = useState(false);
  const [moveItem, setMoveItem] = useState<InventoryItem | null | undefined>(undefined);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['inventory-items', list.query],
    queryFn: () => api.list<InventoryItem>('/inventory/items', list.query),
    placeholderData: (p) => p,
  });
  const { data: alerts } = useQuery({
    queryKey: ['inventory-alerts'],
    queryFn: () => api.get<{ lowStock: InventoryItem[]; expiring: InventoryItem[] }>('/inventory/alerts'),
  });
  const { data: valuation } = useQuery({
    queryKey: ['stock-valuation'],
    queryFn: () => api.get<{ summary: { label: string; value: string }[] }>('/reports/stock-valuation'),
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['inventory-items'] });
    void qc.invalidateQueries({ queryKey: ['inventory-alerts'] });
    void qc.invalidateQueries({ queryKey: ['stock-valuation'] });
    void qc.invalidateQueries({ queryKey: ['nav-badges'] });
  };

  const columns: Column<InventoryItem>[] = [
    {
      key: 'name',
      header: t('Item'),
      sortKey: 'name',
      fixed: true,
      cell: (i) => (
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-royal/10 text-royal">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {i.image ? (
              <img src={i.image} alt="" className="h-full w-full object-cover" />
            ) : (
              <Package className="h-5 w-5" aria-hidden />
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold">{i.name}</p>
            <p className="text-xs text-muted-foreground">{i.sku}</p>
          </div>
        </div>
      ),
    },
    { key: 'category', header: t('Category'), cell: (i) => i.category.name },
    {
      key: 'quantity',
      header: t('In stock'),
      sortKey: 'quantity',
      align: 'right',
      cell: (i) => (
        <span className={cn('tabular font-bold', i.quantity === 0 ? 'text-red-600' : i.isLowStock && 'text-amber-600')}>
          {i.quantity} <span className="text-xs font-medium text-muted-foreground">{enumLabel(i.unit)}</span>
        </span>
      ),
    },
    {
      key: 'reorder',
      header: t('Reorder at'),
      align: 'right',
      cell: (i) => <span className="tabular">{i.reorderLevel}</span>,
    },
    {
      key: 'cost',
      header: t('Unit cost'),
      sortKey: 'unitCost',
      align: 'right',
      cell: (i) => <span className="tabular">{formatMoney(i.unitCost, currency)}</span>,
    },
    {
      key: 'value',
      header: t('Stock value'),
      align: 'right',
      cell: (i) => <span className="tabular font-semibold">{formatMoney(i.stockValue, currency)}</span>,
    },
    {
      key: 'location',
      header: t('Location'),
      hidden: true,
      cell: (i) => i.location ?? '—',
    },
    {
      key: 'supplier',
      header: t('Supplier'),
      hidden: true,
      cell: (i) => i.supplier?.name ?? '—',
    },
    {
      key: 'expiry',
      header: t('Expiry'),
      sortKey: 'expiryDate',
      cell: (i) =>
        i.expiryDate ? (
          <span
            className={cn(
              'whitespace-nowrap',
              i.isExpired && 'font-semibold text-red-600',
              i.isExpiringSoon && 'font-semibold text-amber-600',
            )}
          >
            {formatDate(i.expiryDate)}
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: 'status',
      header: t('Status'),
      cell: (i) =>
        i.isExpired ? (
          <StatusBadge status="EXPIRED" />
        ) : i.quantity === 0 ? (
          <StatusBadge status="EXPIRED" label={t('Out of stock')} />
        ) : i.isLowStock ? (
          <StatusBadge status="LOW" label={t('Low stock')} />
        ) : i.isExpiringSoon ? (
          <StatusBadge status="EXPIRING" label={t('Expiring')} />
        ) : (
          <StatusBadge status="OK" label={t('In stock')} />
        ),
    },
    {
      key: 'actions',
      header: <span className="sr-only">{t('Actions')}</span>,
      fixed: true,
      align: 'right',
      cell: (i) => (
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            setMoveItem(i);
          }}
        >
          <ArrowLeftRight aria-hidden /> {t('Move')}
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t('Inventory')}
        description={t('Stationery, toys, food, uniforms and more.')}
        icon={<Package />}
        actions={
          <>
            <ExportMenu path="/inventory/items" query={list.query} />
            <Button variant="secondary" onClick={() => setMoveItem(null)}>
              <ArrowLeftRight aria-hidden /> {t('Stock in / out')}
            </Button>
            <Button onClick={() => setItemOpen(true)}>
              <Plus aria-hidden /> {t('New item')}
            </Button>
          </>
        }
      />
      <InventoryNav />
      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <KpiCard
          label={t('Stock value')}
          value={valuation ? `${valuation.summary[0]?.value}` : '—'}
          hint={currency}
          icon={Wallet}
          tone="royal"
          loading={!valuation}
        />
        <KpiCard
          label={t('Low / out of stock')}
          value={alerts?.lowStock.length ?? '—'}
          hint={t('At or below reorder level')}
          icon={PackageSearch}
          tone="sunny"
          href="/inventory?lowStock=true"
          loading={!alerts}
          index={1}
        />
        <KpiCard
          label={t('Expiring within 30 days')}
          value={alerts?.expiring.length ?? '—'}
          hint={t('Food & medical')}
          icon={AlertTriangle}
          tone="coral"
          href="/inventory?expiring=true"
          loading={!alerts}
          index={2}
        />
      </div>
      <DataTable
        storageKey="inventory"
        columns={columns}
        data={data?.data}
        rowKey={(i) => i.id}
        loading={isLoading}
        error={error}
        onRetry={() => void refetch()}
        meta={data?.meta}
        onPageChange={list.setPage}
        onPageSizeChange={list.setPageSize}
        sortBy={list.sortBy}
        sortOrder={list.sortOrder}
        onSortChange={list.setSort}
        onRowClick={(i) => router.push(`/inventory/items/${i.id}`)}
        empty={{
          icon: Package,
          title: t('No items found'),
          description: t('Add an item or change the filters.'),
        }}
        toolbar={
          <>
            <SearchInput value={list.search} onChange={list.setSearch} placeholder={t('Name, SKU or location…')} />
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
              value={list.filters.supplierId}
              onChange={(v) => list.setFilter('supplierId', v)}
              placeholder={t('Supplier')}
              allLabel={t('All suppliers')}
              options={(suppliers ?? []).map((s) => ({
                value: String(s.id),
                label: s.name,
              }))}
            />
            <label className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium">
              <Checkbox
                checked={list.filters.lowStock === 'true'}
                onCheckedChange={(v) => list.setFilter('lowStock', v ? 'true' : undefined)}
              />
              {t('Low stock')}
            </label>
            <label className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium">
              <Checkbox
                checked={list.filters.expiring === 'true'}
                onCheckedChange={(v) => list.setFilter('expiring', v ? 'true' : undefined)}
              />
              {t('Expiring')}
            </label>
          </>
        }
      />
      <ItemDialog
        open={itemOpen}
        onOpenChange={setItemOpen}
        onSaved={(i) => {
          refresh();
          router.push(`/inventory/items/${i.id}`);
        }}
      />
      <MovementDialog
        open={moveItem !== undefined}
        onOpenChange={(o) => !o && setMoveItem(undefined)}
        item={moveItem ?? null}
        onSaved={refresh}
      />
    </>
  );
}

export default function InventoryPage() {
  return (
    <Suspense>
      <InventoryInner />
    </Suspense>
  );
}
