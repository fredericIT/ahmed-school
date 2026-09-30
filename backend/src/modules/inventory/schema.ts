import { z } from 'zod';
import { ISO_DATE } from '../../utils/dates';
import { paginationQuery } from '../../utils/pagination';
import { t } from '../../i18n';

const isoDate = z.string().regex(ISO_DATE, 'Use YYYY-MM-DD');
const text = (max: number) => z.string().trim().max(max).nullable().optional();
const bool = z.enum(['true', 'false']).transform((v) => v === 'true');
const format = z.enum(['json', 'xlsx', 'pdf']).default('json');

export const categoryBody = z.object({
  name: z.string().trim().min(2).max(100),
  description: text(255),
  perishable: z.boolean().default(false),
});
export const categoryUpdateBody = categoryBody.partial();

export const supplierBody = z.object({
  name: z.string().trim().min(2).max(150),
  contactPerson: text(150),
  phone: text(30),
  email: z
    .union([z.string().trim().email().max(191), z.literal('')])
    .nullable()
    .optional()
    .transform((v) => v || null),
  address: text(255),
});
export const supplierUpdateBody = supplierBody.partial();
export const supplierListQuery = paginationQuery;

const unit = z.enum(['PCS', 'BOX', 'KG', 'LITRE', 'PACK']);
const condition = z.enum(['NEW', 'GOOD', 'DAMAGED']);

export const itemBody = z.object({
  name: z.string().trim().min(2).max(150),
  description: text(255),
  categoryId: z.number().int().positive(),
  unit: unit.default('PCS'),
  reorderLevel: z.number().int().min(0).max(1_000_000).default(0),
  unitCost: z.number().min(0).max(100_000_000).default(0),
  location: text(100),
  condition: condition.default('NEW'),
  expiryDate: isoDate.nullable().optional(),
  supplierId: z.number().int().positive().nullable().optional(),
  /** Opening stock, recorded as an IN movement. */
  openingQuantity: z.number().int().min(0).max(1_000_000).default(0),
});
export const itemUpdateBody = itemBody.omit({ openingQuantity: true }).partial();

export const itemListQuery = paginationQuery.extend({
  categoryId: z.coerce.number().int().positive().optional(),
  supplierId: z.coerce.number().int().positive().optional(),
  condition: condition.optional(),
  lowStock: bool.optional(),
  expiring: bool.optional(),
  format,
});

export const movementBody = z
  .object({
    itemId: z.number().int().positive(),
    type: z.enum(['IN', 'OUT', 'ADJUSTMENT', 'DAMAGED', 'RETURN']),
    /** Quantity moved. For ADJUSTMENT use `countedQuantity` instead. */
    quantity: z.number().int().positive().max(1_000_000).optional(),
    /** ADJUSTMENT only: the physically counted stock level. */
    countedQuantity: z.number().int().min(0).max(1_000_000).optional(),
    unitCost: z.number().min(0).max(100_000_000).nullable().optional(),
    reason: text(255),
    reference: text(100),
    issuedTo: text(150),
    issuedClassId: z.number().int().positive().nullable().optional(),
    supplierId: z.number().int().positive().nullable().optional(),
    date: isoDate.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.type === 'ADJUSTMENT' && v.countedQuantity === undefined)
      ctx.addIssue({
        code: 'custom',
        path: ['countedQuantity'],
        message: t('Counted quantity is required for an adjustment'),
      });
    if (v.type !== 'ADJUSTMENT' && !v.quantity)
      ctx.addIssue({ code: 'custom', path: ['quantity'], message: t('Quantity is required') });
    if (v.type === 'OUT' && !v.issuedTo && !v.issuedClassId)
      ctx.addIssue({
        code: 'custom',
        path: ['issuedTo'],
        message: t('Say who the items were issued to (class or person)'),
      });
    if ((v.type === 'ADJUSTMENT' || v.type === 'DAMAGED') && !v.reason)
      ctx.addIssue({ code: 'custom', path: ['reason'], message: t('A reason is required') });
  });

export const movementListQuery = paginationQuery.extend({
  itemId: z.coerce.number().int().positive().optional(),
  type: z.enum(['IN', 'OUT', 'ADJUSTMENT', 'DAMAGED', 'RETURN']).optional(),
  classId: z.coerce.number().int().positive().optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  format,
});

export const deleteQuery = z.object({ hard: bool.optional() });
