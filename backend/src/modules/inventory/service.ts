import type { Request } from 'express';
import { Prisma, type InventoryItem, type MovementType } from '@prisma/client';
import type { z } from 'zod';
import { prisma } from '../../config/prisma';
import { audit, diff } from '../../utils/audit';
import { addDays, fmtDate, toDateOnly, todayIn } from '../../utils/dates';
import { badRequest, conflict, notFound } from '../../utils/errors';
import type { Report } from '../../utils/export';
import { removeUpload } from '../../utils/files';
import { notifyAllStaff } from '../../utils/notify';
import { orderBy, paged, skipTake } from '../../utils/pagination';
import { getSettings } from '../../utils/settings';
import type * as s from './schema';
import { periodLabel, plural, storedText, t } from '../../i18n';
import { label, UNIT_LABELS } from '../../i18n/labels';

export const EXPIRY_WARNING_DAYS = 30;

// ─── Categories ───

export async function listCategories() {
  const cats = await prisma.inventoryCategory.findMany({
    where: { deletedAt: null },
    orderBy: { name: 'asc' },
    include: { _count: { select: { items: { where: { deletedAt: null } } } } },
  });
  return cats.map(({ _count, ...c }) => ({ ...c, itemCount: _count.items }));
}

export async function createCategory(data: z.infer<typeof s.categoryBody>, req: Request) {
  const c = await prisma.inventoryCategory.create({ data });
  await audit(req, { action: 'CREATE', entity: 'InventoryCategory', entityId: c.id, newValues: c });
  return c;
}

export async function updateCategory(id: number, data: z.infer<typeof s.categoryUpdateBody>, req: Request) {
  const before = await prisma.inventoryCategory.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw notFound('Category');
  const after = await prisma.inventoryCategory.update({ where: { id }, data });
  await audit(req, { action: 'UPDATE', entity: 'InventoryCategory', entityId: id, ...diff(before, after) });
  return after;
}

export async function deleteCategory(id: number, req: Request) {
  const before = await prisma.inventoryCategory.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw notFound('Category');
  const items = await prisma.inventoryItem.count({ where: { categoryId: id, deletedAt: null } });
  if (items)
    throw conflict(
      plural(items, 'This category still has {count} item', 'This category still has {count} items'),
    );
  await prisma.inventoryCategory.update({
    where: { id },
    data: { deletedAt: new Date(), name: `${before.name}#deleted-${id}` },
  });
  await audit(req, { action: 'DELETE', entity: 'InventoryCategory', entityId: id, oldValues: before });
  return { deleted: true };
}

// ─── Suppliers ───

export async function listSuppliers(q: z.infer<typeof s.supplierListQuery>) {
  const where: Prisma.SupplierWhereInput = {
    deletedAt: null,
    ...(q.search && {
      OR: [
        { name: { contains: q.search } },
        { contactPerson: { contains: q.search } },
        { phone: { contains: q.search } },
      ],
    }),
  };
  const [data, total] = await Promise.all([
    prisma.supplier.findMany({
      where,
      orderBy: orderBy(q, ['name', 'createdAt'] as const, 'name'),
      include: { _count: { select: { items: { where: { deletedAt: null } } } } },
      ...skipTake(q),
    }),
    prisma.supplier.count({ where }),
  ]);
  return paged(
    data.map(({ _count, ...sup }) => ({ ...sup, itemCount: _count.items })),
    total,
    q,
  );
}

export async function createSupplier(data: z.infer<typeof s.supplierBody>, req: Request) {
  const sup = await prisma.supplier.create({ data });
  await audit(req, { action: 'CREATE', entity: 'Supplier', entityId: sup.id, newValues: sup });
  return sup;
}

export async function updateSupplier(id: number, data: z.infer<typeof s.supplierUpdateBody>, req: Request) {
  const before = await prisma.supplier.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw notFound('Supplier');
  const after = await prisma.supplier.update({ where: { id }, data });
  await audit(req, { action: 'UPDATE', entity: 'Supplier', entityId: id, ...diff(before, after) });
  return after;
}

export async function deleteSupplier(id: number, req: Request) {
  const before = await prisma.supplier.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw notFound('Supplier');
  await prisma.supplier.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit(req, { action: 'DELETE', entity: 'Supplier', entityId: id, oldValues: before });
  return { deleted: true };
}

// ─── Items ───

const itemInclude = {
  category: { select: { id: true, name: true, perishable: true } },
  supplier: { select: { id: true, name: true } },
} satisfies Prisma.InventoryItemInclude;

type ItemWithRels = Prisma.InventoryItemGetPayload<{ include: typeof itemInclude }>;

async function withFlags(items: ItemWithRels[]) {
  const { timezone } = await getSettings();
  const today = todayIn(timezone);
  const soon = addDays(today, EXPIRY_WARNING_DAYS);
  return items.map((i) => {
    const expiry = fmtDate(i.expiryDate);
    return {
      ...i,
      stockValue: Math.round(i.quantity * Number(i.unitCost) * 100) / 100,
      isLowStock: i.quantity <= i.reorderLevel,
      isExpired: !!expiry && expiry < today,
      isExpiringSoon: !!expiry && expiry >= today && expiry <= soon,
    };
  });
}

async function itemWhere(q: z.infer<typeof s.itemListQuery>): Promise<Prisma.InventoryItemWhereInput> {
  const where: Prisma.InventoryItemWhereInput = {
    deletedAt: null,
    categoryId: q.categoryId,
    supplierId: q.supplierId,
    condition: q.condition,
    ...(q.search && {
      OR: [
        { name: { contains: q.search } },
        { sku: { contains: q.search } },
        { location: { contains: q.search } },
      ],
    }),
  };
  if (q.lowStock) {
    // Prisma can't compare two columns, so fetch the ids with a raw query.
    const rows = await prisma.$queryRaw<
      { id: number }[]
    >`SELECT id FROM InventoryItem WHERE deletedAt IS NULL AND quantity <= reorderLevel`;
    where.id = { in: rows.map((r) => Number(r.id)) };
  }
  if (q.expiring) {
    const { timezone } = await getSettings();
    where.expiryDate = { not: null, lte: toDateOnly(addDays(todayIn(timezone), EXPIRY_WARNING_DAYS)) };
  }
  return where;
}

export async function listItems(q: z.infer<typeof s.itemListQuery>) {
  const where = await itemWhere(q);
  const [rows, total] = await Promise.all([
    prisma.inventoryItem.findMany({
      where,
      include: itemInclude,
      orderBy: orderBy(
        q,
        ['name', 'sku', 'quantity', 'unitCost', 'createdAt', 'expiryDate'] as const,
        'name',
      ),
      ...skipTake(q),
    }),
    prisma.inventoryItem.count({ where }),
  ]);
  return paged(await withFlags(rows), total, q);
}

export async function itemsReport(
  q: z.infer<typeof s.itemListQuery>,
  title = t('Stock Levels'),
): Promise<Report> {
  const rows = await withFlags(
    await prisma.inventoryItem.findMany({
      where: await itemWhere(q),
      include: itemInclude,
      orderBy: [{ categoryId: 'asc' }, { name: 'asc' }],
    }),
  );
  const total = rows.reduce((a, r) => a + r.stockValue, 0);
  return {
    title,
    subtitle:
      [q.lowStock && t('Low stock only'), q.expiring && t('Expiring / expired only')]
        .filter(Boolean)
        .join(' · ') || undefined,
    columns: [
      { key: 'sku', header: 'SKU', width: 1.5 },
      { key: 'name', header: t('Item'), width: 3 },
      { key: 'category', header: t('Category'), width: 2 },
      { key: 'quantity', header: t('Qty'), format: 'number', width: 1 },
      { key: 'unit', header: t('Unit'), width: 1 },
      { key: 'reorderLevel', header: t('Reorder at'), format: 'number', width: 1.2 },
      { key: 'unitCost', header: t('Unit cost'), format: 'money', width: 1.6 },
      { key: 'stockValue', header: t('Value'), format: 'money', width: 1.8 },
      { key: 'expiryDate', header: t('Expiry'), format: 'date', width: 1.4 },
      { key: 'flag', header: t('Status'), width: 1.4 },
    ],
    rows: rows.map((r) => ({
      sku: r.sku,
      name: r.name,
      category: r.category.name,
      quantity: r.quantity,
      unit: r.unit,
      reorderLevel: r.reorderLevel,
      unitCost: Number(r.unitCost),
      stockValue: r.stockValue,
      expiryDate: fmtDate(r.expiryDate),
      flag: r.isExpired
        ? 'EXPIRED'
        : r.quantity === 0
          ? 'OUT'
          : r.isLowStock
            ? 'LOW'
            : r.isExpiringSoon
              ? 'EXPIRING'
              : 'OK',
    })),
    summary: [
      { label: t('Items'), value: rows.length },
      { label: t('Low / out of stock'), value: rows.filter((r) => r.isLowStock).length },
      { label: t('Total value'), value: Math.round(total) },
    ],
  };
}

export async function valuationReport(): Promise<Report> {
  const cats = await prisma.inventoryCategory.findMany({
    where: { deletedAt: null },
    include: { items: { where: { deletedAt: null } } },
    orderBy: { name: 'asc' },
  });
  const rows = cats.map((c) => ({
    category: c.name,
    items: c.items.length,
    units: c.items.reduce((a, i) => a + i.quantity, 0),
    value: Math.round(c.items.reduce((a, i) => a + i.quantity * Number(i.unitCost), 0)),
    low: c.items.filter((i) => i.quantity <= i.reorderLevel).length,
  }));
  const total = rows.reduce((a, r) => a + r.value, 0);
  return {
    title: t('Stock Valuation'),
    subtitle: t('Current quantity × unit cost (weighted average)'),
    columns: [
      { key: 'category', header: t('Category'), width: 3 },
      { key: 'items', header: t('Items'), format: 'number', width: 1 },
      { key: 'units', header: t('Units in stock'), format: 'number', width: 1.5 },
      { key: 'low', header: t('Low stock'), format: 'number', width: 1.2 },
      { key: 'value', header: t('Value'), format: 'money', width: 2 },
    ],
    rows,
    summary: [{ label: t('Total stock value'), value: Math.round(total) }],
  };
}

export async function getItem(id: number) {
  const item = await prisma.inventoryItem.findFirst({ where: { id, deletedAt: null }, include: itemInclude });
  if (!item) throw notFound('Item');
  const [flagged] = await withFlags([item]);
  const movements = await prisma.stockMovement.findMany({
    where: { itemId: id },
    orderBy: [{ date: 'desc' }, { id: 'desc' }],
    take: 200,
    include: { user: { select: { firstName: true, lastName: true } }, supplier: { select: { name: true } } },
  });
  const classIds = [...new Set(movements.map((m) => m.issuedClassId).filter((x): x is number => !!x))];
  const classes = await prisma.class.findMany({
    where: { id: { in: classIds } },
    select: { id: true, name: true },
  });
  return {
    ...flagged,
    movements: movements.map((m) => ({
      ...m,
      date: fmtDate(m.date),
      issuedClass: classes.find((c) => c.id === m.issuedClassId) ?? null,
    })),
  };
}

export async function createItem(data: z.infer<typeof s.itemBody>, req: Request) {
  const { openingQuantity, expiryDate, ...fields } = data;
  const cat = await prisma.inventoryCategory.findFirst({ where: { id: data.categoryId, deletedAt: null } });
  if (!cat) throw badRequest('Category not found');
  const { timezone } = await getSettings();
  const item = await prisma.$transaction(async (tx) => {
    // SKU derives from the id, so create with a placeholder then set it.
    const created = await tx.inventoryItem.create({
      data: {
        ...fields,
        sku: `TMP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        quantity: openingQuantity,
        expiryDate: expiryDate ? toDateOnly(expiryDate) : null,
        createdById: req.user?.id,
      },
    });
    const withSku = await tx.inventoryItem.update({
      where: { id: created.id },
      data: { sku: `INV-${String(created.id).padStart(5, '0')}` },
    });
    if (openingQuantity > 0) {
      await tx.stockMovement.create({
        data: {
          itemId: created.id,
          type: 'IN',
          quantity: openingQuantity,
          balanceAfter: openingQuantity,
          unitCost: fields.unitCost,
          reason: 'Opening stock',
          supplierId: fields.supplierId ?? null,
          date: toDateOnly(todayIn(timezone)),
          userId: req.user?.id,
        },
      });
    }
    await audit(
      req,
      { action: 'CREATE', entity: 'InventoryItem', entityId: created.id, newValues: withSku },
      tx,
    );
    return withSku;
  });
  return getItem(item.id);
}

export async function updateItem(id: number, data: z.infer<typeof s.itemUpdateBody>, req: Request) {
  const before = await prisma.inventoryItem.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw notFound('Item');
  const { expiryDate, ...fields } = data;
  const after = await prisma.inventoryItem.update({
    where: { id },
    data: {
      ...fields,
      ...(expiryDate !== undefined && { expiryDate: expiryDate ? toDateOnly(expiryDate) : null }),
    },
  });
  await audit(req, { action: 'UPDATE', entity: 'InventoryItem', entityId: id, ...diff(before, after) });
  await checkLowStock(after);
  return getItem(id);
}

export async function setItemImage(id: number, url: string, req: Request) {
  const before = await prisma.inventoryItem.findFirst({ where: { id, deletedAt: null } });
  if (!before) {
    removeUpload(url);
    throw notFound('Item');
  }
  await prisma.inventoryItem.update({ where: { id }, data: { image: url } });
  removeUpload(before.image);
  await audit(req, {
    action: 'UPDATE',
    entity: 'InventoryItem',
    entityId: id,
    oldValues: { image: before.image },
    newValues: { image: url },
  });
  return getItem(id);
}

export async function deleteItem(id: number, hard: boolean, req: Request) {
  const before = await prisma.inventoryItem.findFirst({ where: { id, deletedAt: hard ? undefined : null } });
  if (!before) throw notFound('Item');
  if (hard) {
    await prisma.inventoryItem.delete({ where: { id } });
    removeUpload(before.image);
  } else {
    await prisma.inventoryItem.update({
      where: { id },
      data: { deletedAt: new Date(), sku: `${before.sku}-D${id}`.slice(0, 30) },
    });
  }
  await audit(req, {
    action: 'DELETE',
    entity: 'InventoryItem',
    entityId: id,
    oldValues: before,
    newValues: { hard },
  });
  return { deleted: true };
}

// ─── Stock movements ───

export async function checkLowStock(
  item: Pick<InventoryItem, 'id' | 'name' | 'quantity' | 'reorderLevel' | 'unit'>,
) {
  if (item.quantity > item.reorderLevel) return;
  const { timezone } = await getSettings();
  await notifyAllStaff({
    type: 'LOW_STOCK',
    title: storedText(item.quantity === 0 ? 'Out of stock: {name}' : 'Low stock: {name}', {
      name: item.name,
    }),
    message: storedText('Only {quantity} {unit} left (reorder level {reorderLevel}).', {
      quantity: item.quantity,
      unit: UNIT_LABELS[item.unit],
      reorderLevel: item.reorderLevel,
    }),
    link: `/inventory/items/${item.id}`,
    // One alert per item per day at most.
    dedupeKey: `low-stock:${item.id}:${todayIn(timezone)}`,
  });
}

const INCREASES: MovementType[] = ['IN', 'RETURN'];

export async function recordMovement(data: z.infer<typeof s.movementBody>, req: Request) {
  const { timezone } = await getSettings();
  const today = todayIn(timezone);
  const date = data.date ?? today;
  if (date > today) throw badRequest('Movement date cannot be in the future');
  if (data.issuedClassId) {
    const cls = await prisma.class.findFirst({ where: { id: data.issuedClassId, deletedAt: null } });
    if (!cls) throw badRequest('Class not found');
  }

  const result = await prisma.$transaction(async (tx) => {
    const item = await tx.inventoryItem.findFirst({ where: { id: data.itemId, deletedAt: null } });
    if (!item) throw notFound('Item');

    let delta: number;
    if (data.type === 'ADJUSTMENT') {
      delta = (data.countedQuantity as number) - item.quantity;
      if (delta === 0) throw badRequest('Counted quantity equals current stock; nothing to adjust');
    } else {
      const qty = data.quantity as number;
      delta = INCREASES.includes(data.type) ? qty : -qty;
    }

    // Conditional atomic update: the WHERE clause guarantees stock never goes negative,
    // even when two requests race.
    const updateData: Prisma.InventoryItemUpdateManyMutationInput = { quantity: { increment: delta } };
    if (data.type === 'IN' && data.unitCost != null && data.unitCost > 0) {
      // Weighted average cost keeps stock valuation accurate across purchases at different prices.
      const newQty = item.quantity + delta;
      const avg = (item.quantity * Number(item.unitCost) + delta * data.unitCost) / newQty;
      updateData.unitCost = new Prisma.Decimal(avg.toFixed(2));
    }
    const res = await tx.inventoryItem.updateMany({
      where: { id: item.id, ...(delta < 0 && { quantity: { gte: -delta } }) },
      data: updateData,
    });
    if (res.count === 0) {
      throw badRequest(
        t('Insufficient stock: only {quantity} {unit} of {name} available', {
          quantity: item.quantity,
          unit: label(item.unit),
          name: item.name,
        }),
        {
          available: item.quantity,
        },
      );
    }
    const updated = await tx.inventoryItem.findUniqueOrThrow({ where: { id: item.id } });

    const movement = await tx.stockMovement.create({
      data: {
        itemId: item.id,
        type: data.type,
        quantity: data.type === 'ADJUSTMENT' ? delta : (data.quantity as number),
        balanceAfter: updated.quantity,
        unitCost: data.unitCost ?? item.unitCost,
        reason: data.reason ?? null,
        reference: data.reference ?? null,
        issuedTo: data.issuedTo ?? null,
        issuedClassId: data.issuedClassId ?? null,
        supplierId: data.supplierId ?? null,
        date: toDateOnly(date),
        userId: req.user?.id,
      },
    });
    await audit(
      req,
      {
        action: 'STOCK_MOVEMENT',
        entity: 'InventoryItem',
        entityId: item.id,
        oldValues: { quantity: item.quantity, unitCost: item.unitCost },
        newValues: { quantity: updated.quantity, unitCost: updated.unitCost, movement },
      },
      tx,
    );
    return { movement, item: updated };
  });

  if (signedQty(result.movement) < 0) await checkLowStock(result.item);
  return result;
}

function signedQty(m: { type: MovementType; quantity: number }) {
  return m.type === 'ADJUSTMENT' ? m.quantity : INCREASES.includes(m.type) ? m.quantity : -m.quantity;
}

function movementWhere(q: z.infer<typeof s.movementListQuery>): Prisma.StockMovementWhereInput {
  return {
    itemId: q.itemId,
    type: q.type,
    issuedClassId: q.classId,
    date:
      q.from || q.to
        ? { gte: q.from ? toDateOnly(q.from) : undefined, lte: q.to ? toDateOnly(q.to) : undefined }
        : undefined,
    item: {
      deletedAt: null,
      categoryId: q.categoryId,
      ...(q.search && { OR: [{ name: { contains: q.search } }, { sku: { contains: q.search } }] }),
    },
  };
}

const movementInclude = {
  item: { select: { id: true, name: true, sku: true, unit: true } },
  user: { select: { firstName: true, lastName: true } },
  supplier: { select: { name: true } },
} satisfies Prisma.StockMovementInclude;

export async function listMovements(q: z.infer<typeof s.movementListQuery>) {
  const where = movementWhere(q);
  const [rows, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      include: movementInclude,
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      ...skipTake(q),
    }),
    prisma.stockMovement.count({ where }),
  ]);
  const classes = await prisma.class.findMany({ select: { id: true, name: true } });
  return paged(
    rows.map((m) => ({
      ...m,
      date: fmtDate(m.date),
      issuedClass: classes.find((c) => c.id === m.issuedClassId) ?? null,
    })),
    total,
    q,
  );
}

export async function movementsReport(q: z.infer<typeof s.movementListQuery>): Promise<Report> {
  const rows = await prisma.stockMovement.findMany({
    where: movementWhere(q),
    include: movementInclude,
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
    take: 10_000,
  });
  const classes = await prisma.class.findMany({ select: { id: true, name: true } });
  const data = rows.map((m) => ({
    date: fmtDate(m.date),
    sku: m.item.sku,
    item: m.item.name,
    type: m.type,
    quantity: m.quantity,
    balanceAfter: m.balanceAfter,
    value: Math.abs(m.quantity) * Number(m.unitCost ?? 0),
    party:
      m.type === 'IN'
        ? (m.supplier?.name ?? '')
        : [classes.find((c) => c.id === m.issuedClassId)?.name, m.issuedTo].filter(Boolean).join(' · '),
    reason: [m.reason, m.reference].filter(Boolean).join(' · '),
    by: m.user ? `${m.user.firstName} ${m.user.lastName}` : '',
  }));
  const sum = (type: MovementType) => data.filter((d) => d.type === type).reduce((a, d) => a + d.value, 0);
  return {
    title: t('Stock Movements'),
    subtitle:
      [periodLabel(q.from, q.to), q.type && label(q.type)].filter(Boolean).join(' · ') || t('All dates'),
    columns: [
      { key: 'date', header: t('Date'), format: 'date', width: 1.4 },
      { key: 'sku', header: 'SKU', width: 1.4 },
      { key: 'item', header: t('Item'), width: 2.6 },
      { key: 'type', header: t('Type'), width: 1.4 },
      { key: 'quantity', header: t('Qty'), format: 'number', width: 0.9 },
      { key: 'balanceAfter', header: t('Balance'), format: 'number', width: 1.1 },
      { key: 'value', header: t('Value'), format: 'money', width: 1.6 },
      { key: 'party', header: t('Supplier / issued to'), width: 2.4 },
      { key: 'reason', header: t('Reason / ref'), width: 2.4 },
      { key: 'by', header: 'By', width: 1.6 },
    ],
    rows: data,
    summary: [
      { label: t('Movements'), value: data.length },
      { label: t('Value in'), value: Math.round(sum('IN')) },
      { label: t('Value out'), value: Math.round(sum('OUT')) },
      { label: t('Written off'), value: Math.round(sum('DAMAGED')) },
    ],
  };
}

export async function consumptionByClassReport(q: { from?: string; to?: string }): Promise<Report> {
  const where: Prisma.StockMovementWhereInput = {
    type: 'OUT',
    issuedClassId: { not: null },
    date:
      q.from || q.to
        ? { gte: q.from ? toDateOnly(q.from) : undefined, lte: q.to ? toDateOnly(q.to) : undefined }
        : undefined,
  };
  const rows = await prisma.stockMovement.findMany({
    where,
    include: { item: { include: { category: true } } },
  });
  const classes = await prisma.class.findMany({ select: { id: true, name: true } });
  const map = new Map<
    string,
    { className: string; category: string; quantity: number; value: number; movements: number }
  >();
  for (const m of rows) {
    const className = classes.find((c) => c.id === m.issuedClassId)?.name ?? `#${m.issuedClassId}`;
    const key = `${className}|${m.item.category.name}`;
    const e = map.get(key) ?? {
      className,
      category: m.item.category.name,
      quantity: 0,
      value: 0,
      movements: 0,
    };
    e.quantity += m.quantity;
    e.value += m.quantity * Number(m.unitCost ?? 0);
    e.movements++;
    map.set(key, e);
  }
  const data = [...map.values()].sort((a, b) => a.className.localeCompare(b.className) || b.value - a.value);
  return {
    title: t('Consumption per Class'),
    subtitle: periodLabel(q.from, q.to) || t('All dates'),
    columns: [
      { key: 'className', header: t('Class'), width: 2 },
      { key: 'category', header: t('Category'), width: 2.5 },
      { key: 'movements', header: t('Issues'), format: 'number', width: 1 },
      { key: 'quantity', header: t('Units'), format: 'number', width: 1 },
      { key: 'value', header: t('Value'), format: 'money', width: 2 },
    ],
    rows: data,
    summary: [
      {
        label: t('Total value issued'),
        value: Math.round(data.reduce((a, d) => a + d.value, 0)),
      },
    ],
  };
}

export async function alerts() {
  const { timezone } = await getSettings();
  const lowIds = await prisma.$queryRaw<
    { id: number }[]
  >`SELECT id FROM InventoryItem WHERE deletedAt IS NULL AND quantity <= reorderLevel`;
  const [low, expiring] = await Promise.all([
    prisma.inventoryItem.findMany({
      where: { id: { in: lowIds.map((r) => Number(r.id)) } },
      include: itemInclude,
      orderBy: { quantity: 'asc' },
    }),
    prisma.inventoryItem.findMany({
      where: {
        deletedAt: null,
        quantity: { gt: 0 },
        expiryDate: { not: null, lte: toDateOnly(addDays(todayIn(timezone), EXPIRY_WARNING_DAYS)) },
      },
      include: itemInclude,
      orderBy: { expiryDate: 'asc' },
    }),
  ]);
  return { lowStock: await withFlags(low), expiring: await withFlags(expiring) };
}
