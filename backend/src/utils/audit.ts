import type { AuditAction, Prisma } from '@prisma/client';
import type { Request } from 'express';
import { prisma, type Tx } from '../config/prisma';
import { logger } from '../config/logger';
import { stripSensitive } from './sanitize';

export interface AuditEntry {
  action: AuditAction;
  entity: string;
  entityId?: string | number | null;
  oldValues?: unknown;
  newValues?: unknown;
  userId?: number | null;
}

function toJson(v: unknown): Prisma.InputJsonValue | undefined {
  if (v === undefined || v === null) return undefined;
  // Round-trip through JSON so Dates/Decimals become plain values.
  return JSON.parse(JSON.stringify(stripSensitive(v))) as Prisma.InputJsonValue;
}

/** Keeps only the fields that actually changed, for compact before/after diffs. */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};
  for (const key of Object.keys(after)) {
    if (key === 'updatedAt') continue;
    const a = JSON.stringify(before[key] ?? null);
    const b = JSON.stringify(after[key] ?? null);
    if (a !== b) {
      oldValues[key] = before[key] ?? null;
      newValues[key] = after[key] ?? null;
    }
  }
  return { oldValues, newValues };
}

export async function audit(req: Request | null, entry: AuditEntry, tx: Tx = prisma): Promise<void> {
  try {
    await tx.auditLog.create({
      data: {
        userId: entry.userId !== undefined ? entry.userId : (req?.user?.id ?? null),
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId != null ? String(entry.entityId) : null,
        oldValues: toJson(entry.oldValues),
        newValues: toJson(entry.newValues),
        ip: req ? (req.ip ?? null) : null,
        userAgent: req ? (req.get('user-agent')?.slice(0, 255) ?? null) : null,
      },
    });
  } catch (err) {
    // Inside a transaction the error must propagate so the whole operation rolls back.
    if (tx !== prisma) throw err;
    logger.error({ err }, 'Failed to write audit log');
  }
}
