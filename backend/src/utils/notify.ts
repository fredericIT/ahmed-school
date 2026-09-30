import { prisma } from '../config/prisma';
import { logger } from '../config/logger';

interface NotifyInput {
  title: string;
  message: string;
  type?: 'INFO' | 'LOW_STOCK' | 'EXPIRY' | 'OVERDUE' | 'SYSTEM';
  link?: string;
  /** When set, a user never receives two notifications with the same key. */
  dedupeKey?: string;
}

/** Sends a notification to every active staff member. */
export async function notifyAllStaff(input: NotifyInput): Promise<number> {
  try {
    const users = await prisma.user.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true },
    });
    const result = await prisma.notification.createMany({
      data: users.map((u) => ({ userId: u.id, type: input.type ?? 'INFO', ...input })),
      skipDuplicates: true,
    });
    return result.count;
  } catch (err) {
    logger.error({ err }, 'Failed to create notifications');
    return 0;
  }
}
