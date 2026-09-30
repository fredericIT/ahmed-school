import cron from 'node-cron';
import { prisma } from '../config/prisma';
import { logger } from '../config/logger';
import { addDays, fmtDate, toDateOnly, todayIn } from '../utils/dates';
import { notifyAllStaff } from '../utils/notify';
import { getSettings } from '../utils/settings';
import { EXPIRY_WARNING_DAYS } from '../modules/inventory/service';
import { storedPlural } from '../i18n';
import { markOverdueLoans } from '../modules/library/service';

/** Low-stock and expiry sweep; complements the real-time alert raised on each stock movement. */
export async function inventoryAlerts(): Promise<{ lowStock: number; expiring: number }> {
  const { timezone } = await getSettings();
  const today = todayIn(timezone);
  const low = await prisma.$queryRaw<{ id: number; name: string; quantity: number }[]>`
    SELECT id, name, quantity FROM InventoryItem WHERE deletedAt IS NULL AND quantity <= reorderLevel`;
  if (low.length) {
    await notifyAllStaff({
      type: 'LOW_STOCK',
      title: storedPlural(
        low.length,
        '{count} item at or below reorder level',
        '{count} items at or below reorder level',
      ),
      message:
        low
          .slice(0, 6)
          .map((i) => `${i.name} (${i.quantity})`)
          .join(', ') + (low.length > 6 ? '…' : ''),
      link: '/inventory?lowStock=true',
      dedupeKey: `low-stock-daily:${today}`,
    });
  }
  const expiring = await prisma.inventoryItem.findMany({
    where: {
      deletedAt: null,
      quantity: { gt: 0 },
      expiryDate: { not: null, lte: toDateOnly(addDays(today, EXPIRY_WARNING_DAYS)) },
    },
    select: { name: true, expiryDate: true },
    orderBy: { expiryDate: 'asc' },
  });
  if (expiring.length) {
    await notifyAllStaff({
      type: 'EXPIRY',
      title: storedPlural(
        expiring.length,
        '{count} item expired or expiring soon',
        '{count} items expired or expiring soon',
      ),
      message: expiring
        .slice(0, 6)
        .map((i) => `${i.name} (${fmtDate(i.expiryDate)})`)
        .join(', '),
      link: '/inventory?expiring=true',
      dedupeKey: `expiry-daily:${today}`,
    });
  }
  return { lowStock: low.length, expiring: expiring.length };
}

async function runSafely(name: string, fn: () => Promise<unknown>) {
  try {
    const result = await fn();
    logger.info({ result }, `Job "${name}" completed`);
  } catch (err) {
    logger.error({ err }, `Job "${name}" failed`);
  }
}

export function startJobs(): void {
  void getSettings().then(({ timezone }) => {
    // 06:00 every day, school timezone.
    cron.schedule('0 6 * * *', () => void runSafely('overdue-loans', markOverdueLoans), { timezone });
    cron.schedule('5 6 * * *', () => void runSafely('inventory-alerts', inventoryAlerts), { timezone });
    logger.info(`Scheduled jobs registered (${timezone})`);
  });
  // Catch up on start so overdue status is correct even if the server was down at 06:00.
  void runSafely('overdue-loans (startup)', markOverdueLoans);
}
