'use client';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownToLine, ArrowUpFromLine, Edit, MapPin, Package, Scale, Trash2, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/misc';
import { Skeleton } from '@/components/ui/skeleton';
import { Breadcrumbs } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState, ErrorState } from '@/components/shared/empty-state';
import { ImageUpload } from '@/components/forms/image-upload';
import { ItemDialog, MOVEMENT_TYPES, MovementDialog } from '@/components/forms/inventory-dialogs';
import { useCurrency } from '@/hooks/use-lookups';
import { useAuth } from '@/lib/auth';
import { api, errorMessage } from '@/lib/api';
import { cn, formatDate, formatDateTime, formatMoney } from '@/lib/utils';
import type { InventoryItem, MovementType, StockMovement } from '@/types';
import { t } from '@/lib/i18n';
import { enumLabel } from '@/lib/labels';

type ItemDetail = InventoryItem & { movements: StockMovement[] };

export default function ItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const currency = useCurrency();
  const { can } = useAuth();
  const [editOpen, setEditOpen] = useState(false);
  const [moveType, setMoveType] = useState<MovementType | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const {
    data: item,
    error,
    refetch,
  } = useQuery({
    queryKey: ['inventory-item-detail', id],
    queryFn: () => api.get<ItemDetail>(`/inventory/items/${id}`),
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['inventory-item-detail', id] });
    void qc.invalidateQueries({ queryKey: ['inventory-item', Number(id)] });
    void qc.invalidateQueries({ queryKey: ['inventory-items'] });
    void qc.invalidateQueries({ queryKey: ['inventory-alerts'] });
  };
  if (error) return <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />;
  if (!item) return <Skeleton className="h-96 rounded-2xl" />;
  const fill = Math.min(100, (item.quantity / Math.max(1, item.reorderLevel * 3)) * 100);

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: t('Inventory'), href: '/inventory' }, { label: item.name }]} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_380px]">
        <Card>
          <CardContent className="flex flex-col gap-6 p-6 sm:flex-row">
            <ImageUpload
              value={item.image}
              label={t('Add image')}
              onUpload={async (file) => {
                const form = new FormData();
                form.append('file', file);
                try {
                  await api.upload(`/inventory/items/${item.id}/image`, form);
                  toast.success(t('Image updated'));
                  refresh();
                } catch (e) {
                  toast.error(errorMessage(e));
                  throw e;
                }
              }}
            />
            <div className="min-w-0 flex-1">
              <p className="tabular text-sm font-semibold text-muted-foreground">{item.sku}</p>
              <h1 className="font-heading text-3xl font-black">{item.name}</h1>
              <div className="mt-2 flex flex-wrap gap-2">
                <StatusBadge status="RETURN" label={item.category.name} />
                <StatusBadge status={item.condition} />
                {item.isLowStock && (
                  <StatusBadge status="LOW" label={item.quantity === 0 ? t('Out of stock') : t('Low stock')} />
                )}
                {item.isExpired && <StatusBadge status="EXPIRED" />}
                {item.isExpiringSoon && (
                  <StatusBadge status="EXPIRING" label={t('Expires {date}', { date: formatDate(item.expiryDate) })} />
                )}
              </div>
              {item.description && <p className="mt-3 text-sm text-muted-foreground">{item.description}</p>}
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <MapPin className="h-4 w-4" aria-hidden /> {item.location ?? t('No location')}
                </span>
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Truck className="h-4 w-4" aria-hidden /> {item.supplier?.name ?? t('No supplier')}
                </span>
              </div>
              <div className="no-print mt-5 flex flex-wrap gap-2">
                <Button variant="mint" onClick={() => setMoveType('IN')}>
                  <ArrowDownToLine aria-hidden /> {t('Stock in')}
                </Button>
                <Button onClick={() => setMoveType('OUT')}>
                  <ArrowUpFromLine aria-hidden /> {t('Stock out')}
                </Button>
                <Button variant="outline" onClick={() => setMoveType('ADJUSTMENT')}>
                  <Scale aria-hidden /> {t('Adjust')}
                </Button>
                <Button variant="outline" onClick={() => setEditOpen(true)}>
                  <Edit aria-hidden /> {t('Edit')}
                </Button>
                <Button variant="ghost" className="text-destructive" onClick={() => setDeleteOpen(true)}>
                  <Trash2 aria-hidden /> {t('Delete')}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="p-6">
          <p className="text-sm text-muted-foreground">{t('Current stock')}</p>
          <p className="tabular font-heading text-5xl font-black">
            {item.quantity} <span className="text-lg font-bold text-muted-foreground">{enumLabel(item.unit)}</span>
          </p>
          <Progress
            value={fill}
            className="mt-4 h-3"
            indicatorClassName={item.quantity === 0 ? 'bg-destructive' : item.isLowStock ? 'bg-sunny' : 'bg-mint'}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {t('Reorder level: {reorderLevel}', { reorderLevel: item.reorderLevel })}
          </p>
          <dl className="mt-5 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t('Unit cost (avg.)')}</dt>
              <dd className="tabular font-semibold">{formatMoney(item.unitCost, currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t('Stock value')}</dt>
              <dd className="tabular font-heading text-lg font-extrabold text-primary">
                {formatMoney(item.stockValue, currency)}
              </dd>
            </div>
            {item.expiryDate && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t('Expiry date')}</dt>
                <dd className={cn('font-semibold', item.isExpired && 'text-red-600')}>{formatDate(item.expiryDate)}</dd>
              </div>
            )}
          </dl>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('Movement history')}</CardTitle>
        </CardHeader>
        <CardContent>
          {item.movements.length === 0 ? (
            <EmptyState icon={Package} title={t('No movements yet')} />
          ) : (
            <ol className="relative space-y-4 border-l-2 border-border pl-6">
              {item.movements.map((m) => {
                const kind = MOVEMENT_TYPES.find((x) => x.value === m.type) ?? MOVEMENT_TYPES[0];
                const signed =
                  m.type === 'ADJUSTMENT'
                    ? m.quantity
                    : m.type === 'IN' || m.type === 'RETURN'
                      ? m.quantity
                      : -m.quantity;
                return (
                  <li key={m.id} className="relative">
                    <span
                      className={cn(
                        'absolute -left-[37px] grid h-7 w-7 place-items-center rounded-full ring-4 ring-card',
                        kind.cls,
                      )}
                    >
                      <kind.icon className="h-3.5 w-3.5" aria-hidden />
                    </span>
                    <div className="flex flex-wrap items-start justify-between gap-2 rounded-xl border bg-muted/20 p-3">
                      <div>
                        <p className="text-sm font-semibold">
                          {kind.label}{' '}
                          <span className={cn('tabular', signed >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                            {signed >= 0 ? '+' : ''}
                            {signed} {enumLabel(item.unit)}
                          </span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {[m.issuedClass?.name, m.issuedTo, m.supplier?.name, m.reason, m.reference]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </p>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        <p className="tabular font-semibold text-foreground">
                          {t('Balance {balanceAfter}', { balanceAfter: m.balanceAfter })}
                        </p>
                        <p>
                          {formatDate(m.date)} · {m.user ? `${m.user.firstName} ${m.user.lastName}` : t('System')}
                        </p>
                        <p className="opacity-70">{formatDateTime(m.createdAt)}</p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>

      <ItemDialog item={item} open={editOpen} onOpenChange={setEditOpen} onSaved={refresh} />
      <MovementDialog
        open={moveType !== null}
        onOpenChange={(o) => !o && setMoveType(null)}
        item={item}
        defaultType={moveType ?? 'OUT'}
        onSaved={refresh}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t('Delete {name}?', { name: item.name })}
        description={
          can('records.hardDelete')
            ? t('The item is archived; its movement history stays in reports.')
            : t('The item will be archived.')
        }
        confirmLabel={t('Delete')}
        onConfirm={async () => {
          try {
            await api.delete(`/inventory/items/${item.id}`);
            toast.success(t('Item deleted'));
            void qc.invalidateQueries({ queryKey: ['inventory-items'] });
            router.replace('/inventory');
          } catch (e) {
            toast.error(errorMessage(e));
          }
        }}
      />
    </div>
  );
}
