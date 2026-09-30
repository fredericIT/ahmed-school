'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Ban, RotateCcw, Scale } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, SelectField } from '@/components/forms/field';
import { useClasses, useCurrency, useInventoryCategories, useSuppliers } from '@/hooks/use-lookups';
import { api, errorMessage } from '@/lib/api';
import { cn, dateOnly, todayKigali } from '@/lib/utils';
import type { InventoryItem, MovementType } from '@/types';
import { msg, t, tRich } from '@/lib/i18n';
import { enumLabel } from '@/lib/labels';

export const UNITS = [
  {
    value: 'PCS',
    get label() {
      return t('Pieces');
    },
  },
  {
    value: 'BOX',
    get label() {
      return t('Boxes');
    },
  },
  {
    value: 'PACK',
    get label() {
      return t('Packs');
    },
  },
  {
    value: 'KG',
    get label() {
      return t('Kilograms');
    },
  },
  {
    value: 'LITRE',
    get label() {
      return t('Litres');
    },
  },
];

export function InventoryNav() {
  const pathname = usePathname();
  const tabs = [
    { href: '/inventory', label: t('Items') },
    { href: '/inventory/movements', label: t('Stock movements') },
    { href: '/inventory/categories', label: t('Categories') },
    { href: '/inventory/suppliers', label: t('Suppliers') },
  ];
  return (
    <nav
      className="mb-4 inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-muted p-1"
      aria-label={t('Inventory sections')}
    >
      {tabs.map((tab) => {
        const active =
          tab.href === '/inventory'
            ? pathname === '/inventory' || pathname.startsWith('/inventory/items')
            : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-semibold text-muted-foreground transition',
              active && 'bg-card text-foreground shadow-sm',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

// ─── Item create / edit ───

const itemSchema = z.object({
  name: z.string().trim().min(2, msg('Name is required')).max(150),
  description: z.string().max(255).optional(),
  categoryId: z.number({
    get required_error() {
      return t('Choose a category');
    },
    get invalid_type_error() {
      return t('Choose a category');
    },
  }),
  unit: z.enum(['PCS', 'BOX', 'KG', 'LITRE', 'PACK']),
  reorderLevel: z.coerce.number().int().min(0),
  unitCost: z.coerce.number().min(0),
  location: z.string().max(100).optional(),
  condition: z.enum(['NEW', 'GOOD', 'DAMAGED']),
  expiryDate: z.string().optional(),
  supplierId: z.number().nullable().optional(),
  openingQuantity: z.coerce.number().int().min(0),
});
type ItemValues = z.infer<typeof itemSchema>;

export function ItemDialog({
  item,
  open,
  onOpenChange,
  onSaved,
}: {
  item?: InventoryItem | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: (i: InventoryItem) => void;
}) {
  const currency = useCurrency();
  const { data: categories } = useInventoryCategories();
  const { data: suppliers } = useSuppliers();
  const { register, handleSubmit, control, formState, reset } = useForm<ItemValues>({
    resolver: zodResolver(itemSchema),
  });
  useEffect(() => {
    if (open)
      reset({
        name: item?.name ?? '',
        description: item?.description ?? '',
        categoryId: item?.categoryId,
        unit: item?.unit ?? 'PCS',
        reorderLevel: item?.reorderLevel ?? 5,
        unitCost: item?.unitCost ?? 0,
        location: item?.location ?? '',
        condition: item?.condition ?? 'NEW',
        expiryDate: dateOnly(item?.expiryDate),
        supplierId: item?.supplierId ?? null,
        openingQuantity: 0,
      });
  }, [open, item, reset]);
  const e = formState.errors;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{item ? t('Edit {name}', { name: item.name }) : t('New inventory item')}</DialogTitle>
          {!item && (
            <DialogDescription>
              {t('An SKU is generated automatically. Opening stock is recorded as a stock-in movement.')}
            </DialogDescription>
          )}
        </DialogHeader>
        <form
          noValidate
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          onSubmit={handleSubmit(async (v) => {
            const { openingQuantity, ...rest } = v;
            const body = {
              ...rest,
              description: v.description || null,
              location: v.location || null,
              expiryDate: v.expiryDate || null,
            };
            try {
              const saved = item
                ? await api.patch<InventoryItem>(`/inventory/items/${item.id}`, body)
                : await api.post<InventoryItem>('/inventory/items', {
                    ...body,
                    openingQuantity,
                  });
              toast.success(item ? t('Item updated') : t('Item created'));
              onSaved(saved);
              onOpenChange(false);
            } catch (err) {
              toast.error(errorMessage(err));
            }
          })}
        >
          <Field label={t('Name')} htmlFor="i-name" required error={e.name} className="sm:col-span-2">
            <Input id="i-name" {...register('name')} />
          </Field>
          <SelectField
            control={control}
            name="categoryId"
            label={t('Category')}
            required
            numeric
            error={e.categoryId}
            options={(categories ?? []).map((c) => ({
              value: String(c.id),
              label: c.name,
            }))}
          />
          <SelectField control={control} name="unit" label={t('Unit')} options={UNITS} />
          {!item && (
            <Field label={t('Opening quantity')} htmlFor="i-open" error={e.openingQuantity}>
              <Input id="i-open" type="number" min={0} {...register('openingQuantity')} />
            </Field>
          )}
          <Field
            label={t('Reorder level')}
            htmlFor="i-reorder"
            hint={t('Alert when stock falls to this level')}
            error={e.reorderLevel}
          >
            <Input id="i-reorder" type="number" min={0} {...register('reorderLevel')} />
          </Field>
          <Field label={t('Unit cost ({currency})', { currency })} htmlFor="i-cost" error={e.unitCost}>
            <Input id="i-cost" type="number" min={0} step="any" {...register('unitCost')} />
          </Field>
          <SelectField
            control={control}
            name="supplierId"
            label={t('Supplier')}
            numeric
            allowEmpty={t('No supplier')}
            options={(suppliers ?? []).map((s) => ({
              value: String(s.id),
              label: s.name,
            }))}
          />
          <Field label={t('Storage location')} htmlFor="i-loc">
            <Input id="i-loc" placeholder={t('e.g. Store A-1')} {...register('location')} />
          </Field>
          <SelectField
            control={control}
            name="condition"
            label={t('Condition')}
            options={[
              { value: 'NEW', label: t('New') },
              { value: 'GOOD', label: t('Good') },
              { value: 'DAMAGED', label: t('Damaged') },
            ]}
          />
          <Field label={t('Expiry date')} htmlFor="i-exp" hint={t('For food and medical items')}>
            <Input id="i-exp" type="date" {...register('expiryDate')} />
          </Field>
          <Field label={t('Description')} htmlFor="i-desc" className="sm:col-span-2">
            <Textarea id="i-desc" rows={2} {...register('description')} />
          </Field>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('Cancel')}
            </Button>
            <Button type="submit" loading={formState.isSubmitting}>
              {t('Save item')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Stock movement ───

export const MOVEMENT_TYPES: {
  value: MovementType;
  label: string;
  description: string;
  icon: typeof ArrowDownToLine;
  cls: string;
}[] = [
  {
    value: 'IN',
    get label() {
      return t('Stock in');
    },
    get description() {
      return t('Purchase or donation');
    },
    icon: ArrowDownToLine,
    cls: 'text-emerald-600 bg-emerald-500/10',
  },
  {
    value: 'OUT',
    get label() {
      return t('Stock out');
    },
    get description() {
      return t('Issue to a class or person');
    },
    icon: ArrowUpFromLine,
    cls: 'text-sky-600 bg-sky-500/10',
  },
  {
    value: 'RETURN',
    get label() {
      return t('Return');
    },
    get description() {
      return t('Items given back');
    },
    icon: RotateCcw,
    cls: 'text-royal bg-royal/10',
  },
  {
    value: 'DAMAGED',
    get label() {
      return t('Damaged');
    },
    get description() {
      return t('Write off broken items');
    },
    icon: Ban,
    cls: 'text-amber-600 bg-amber-500/10',
  },
  {
    value: 'ADJUSTMENT',
    get label() {
      return t('Adjust');
    },
    get description() {
      return t('Correct after a physical count');
    },
    icon: Scale,
    cls: 'text-violet-600 bg-violet-500/10',
  },
];

export function MovementDialog({
  open,
  onOpenChange,
  item: presetItem,
  defaultType = 'OUT',
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  item?: InventoryItem | null;
  defaultType?: MovementType;
  onSaved: () => void;
}) {
  const currency = useCurrency();
  const { data: classes } = useClasses();
  const { data: suppliers } = useSuppliers();
  const [type, setType] = useState<MovementType>(defaultType);
  const [itemId, setItemId] = useState<number | undefined>(presetItem?.id);
  const [q, setQ] = useState('');
  const [form, setForm] = useState({
    quantity: '',
    countedQuantity: '',
    unitCost: '',
    reason: '',
    reference: '',
    issuedTo: '',
    issuedClassId: '',
    supplierId: '',
    date: todayKigali(),
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setType(defaultType);
      setItemId(presetItem?.id);
      setQ('');
      setForm({
        quantity: '',
        countedQuantity: '',
        unitCost: '',
        reason: '',
        reference: '',
        issuedTo: '',
        issuedClassId: '',
        supplierId: presetItem?.supplierId ? String(presetItem.supplierId) : '',
        date: todayKigali(),
      });
    }
  }, [open, defaultType, presetItem]);

  const { data: found } = useQuery({
    queryKey: ['item-picker', q],
    queryFn: () => api.list<InventoryItem>('/inventory/items', { search: q, pageSize: 8 }),
    enabled: open && !presetItem && q.length >= 2,
  });
  const { data: selected } = useQuery({
    queryKey: ['inventory-item', itemId],
    queryFn: () => api.get<InventoryItem>(`/inventory/items/${itemId}`),
    enabled: open && !!itemId,
    initialData: presetItem ?? undefined,
  });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const qty = Number(form.quantity || 0);
  const decreases = type === 'OUT' || type === 'DAMAGED';
  const insufficient = !!selected && decreases && qty > selected.quantity;

  const submit = async () => {
    if (!itemId) return toast.error(t('Choose an item'));
    setBusy(true);
    try {
      await api.post('/inventory/movements', {
        itemId,
        type,
        quantity: type === 'ADJUSTMENT' ? undefined : qty || undefined,
        countedQuantity: type === 'ADJUSTMENT' ? Number(form.countedQuantity) : undefined,
        unitCost: form.unitCost ? Number(form.unitCost) : undefined,
        reason: form.reason || undefined,
        reference: form.reference || undefined,
        issuedTo: form.issuedTo || undefined,
        issuedClassId: form.issuedClassId ? Number(form.issuedClassId) : undefined,
        supplierId: form.supplierId ? Number(form.supplierId) : undefined,
        date: form.date,
      });
      toast.success(t('Stock movement recorded'));
      onSaved();
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('Record stock movement')}</DialogTitle>
          <DialogDescription>
            {t('Stock can never go below zero. Every movement is logged with who recorded it.')}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" role="radiogroup" aria-label={t('Movement type')}>
          {MOVEMENT_TYPES.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={type === option.value}
              onClick={() => setType(option.value)}
              className={cn(
                'flex flex-col items-center gap-1 rounded-xl border p-3 text-center transition',
                type === option.value ? 'border-primary bg-primary/5 ring-2 ring-primary/20' : 'hover:bg-accent',
              )}
            >
              <span className={cn('grid h-8 w-8 place-items-center rounded-lg', option.cls)}>
                <option.icon className="h-4 w-4" aria-hidden />
              </span>
              <span className="text-xs font-bold">{option.label}</span>
            </button>
          ))}
        </div>
        <p className="-mt-2 text-xs text-muted-foreground">
          {MOVEMENT_TYPES.find((m) => m.value === type)?.description}
        </p>

        {!presetItem && (
          <Field label={t('Item')} htmlFor="m-item" required>
            <Input
              id="m-item"
              value={selected && !q ? `${selected.name} (${selected.sku})` : q}
              onChange={(e) => {
                setQ(e.target.value);
                setItemId(undefined);
              }}
              placeholder={t('Search by name or SKU…')}
            />
            {found && q.length >= 2 && !itemId && (
              <ul className="max-h-48 divide-y overflow-auto rounded-xl border">
                {found.data.map((i) => (
                  <li key={i.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setItemId(i.id);
                        setQ('');
                      }}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                    >
                      <span className="font-medium">{i.name}</span>
                      <span className="tabular text-xs text-muted-foreground">
                        {i.quantity} {enumLabel(i.unit)} · {i.sku}
                      </span>
                    </button>
                  </li>
                ))}
                {!found.data.length && (
                  <li className="px-3 py-2 text-sm text-muted-foreground">{t('No items found')}</li>
                )}
              </ul>
            )}
          </Field>
        )}
        {selected && (
          <div className="tabular flex items-center justify-between rounded-xl bg-muted/60 px-4 py-2 text-sm">
            <span className="font-semibold">{selected.name}</span>
            <span>
              {tRich('In stock: {quantity} {unit} · reorder at {reorderLevel}', {
                quantity: <strong>{selected.quantity}</strong>,
                unit: enumLabel(selected.unit),
                reorderLevel: selected.reorderLevel,
              })}
            </span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {type === 'ADJUSTMENT' ? (
            <Field
              label={t('Counted quantity')}
              htmlFor="m-count"
              required
              hint={selected ? t('Currently recorded: {quantity}', { quantity: selected.quantity }) : undefined}
            >
              <Input
                id="m-count"
                type="number"
                min={0}
                value={form.countedQuantity}
                onChange={(e) => set('countedQuantity', e.target.value)}
              />
            </Field>
          ) : (
            <Field
              label={t('Quantity')}
              htmlFor="m-qty"
              required
              error={insufficient ? t('Only {quantity} available', { quantity: selected?.quantity ?? 0 }) : undefined}
            >
              <Input
                id="m-qty"
                type="number"
                min={1}
                value={form.quantity}
                onChange={(e) => set('quantity', e.target.value)}
                aria-invalid={insufficient}
              />
            </Field>
          )}
          <Field label={t('Date')} htmlFor="m-date">
            <Input
              id="m-date"
              type="date"
              max={todayKigali()}
              value={form.date}
              onChange={(e) => set('date', e.target.value)}
            />
          </Field>
          {type === 'IN' && (
            <>
              <Field
                label={t('Unit cost ({currency})', { currency })}
                htmlFor="m-cost"
                hint={t('Updates the weighted average cost')}
              >
                <Input
                  id="m-cost"
                  type="number"
                  min={0}
                  value={form.unitCost}
                  onChange={(e) => set('unitCost', e.target.value)}
                />
              </Field>
              <Field label={t('Supplier')} htmlFor="m-sup">
                <select
                  id="m-sup"
                  value={form.supplierId}
                  onChange={(e) => set('supplierId', e.target.value)}
                  className="h-10 w-full rounded-xl border border-input bg-card px-3 text-sm"
                >
                  <option value="">{t('— Donation / none —')}</option>
                  {suppliers?.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('Reference')} htmlFor="m-ref" hint={t('Invoice / delivery note no.')}>
                <Input id="m-ref" value={form.reference} onChange={(e) => set('reference', e.target.value)} />
              </Field>
            </>
          )}
          {(type === 'OUT' || type === 'RETURN') && (
            <>
              <Field label={type === 'OUT' ? t('Issue to class') : t('Returned by class')} htmlFor="m-class">
                <select
                  id="m-class"
                  value={form.issuedClassId}
                  onChange={(e) => set('issuedClassId', e.target.value)}
                  className="h-10 w-full rounded-xl border border-input bg-card px-3 text-sm"
                >
                  <option value="">{t('— None —')}</option>
                  {classes?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label={type === 'OUT' ? t('Issued to (person)') : t('Returned by (person)')}
                htmlFor="m-to"
                required={type === 'OUT' && !form.issuedClassId}
              >
                <Input
                  id="m-to"
                  value={form.issuedTo}
                  onChange={(e) => set('issuedTo', e.target.value)}
                  placeholder={t('e.g. Kitchen, Mrs. Uwera')}
                />
              </Field>
            </>
          )}
          <Field
            label={t('Reason / notes')}
            htmlFor="m-reason"
            required={type === 'ADJUSTMENT' || type === 'DAMAGED'}
            className="sm:col-span-2"
          >
            <Input id="m-reason" value={form.reason} onChange={(e) => set('reason', e.target.value)} />
          </Field>
        </div>
        {selected && decreases && qty > 0 && !insufficient && selected.quantity - qty <= selected.reorderLevel && (
          <p className="flex items-center gap-2 rounded-xl bg-sunny/15 px-3 py-2 text-sm font-medium text-sunny-700 dark:text-sunny">
            <AlertTriangle className="h-4 w-4" aria-hidden />{' '}
            {t('Stock will drop to {quantity} — staff will get a low-stock alert.', {
              quantity: selected.quantity - qty,
            })}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button onClick={() => void submit()} loading={busy} disabled={!itemId || insufficient}>
            {t('Record movement')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
