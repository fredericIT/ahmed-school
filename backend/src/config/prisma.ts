import { Prisma, PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  log: process.env.PRISMA_LOG === 'true' ? ['query', 'warn', 'error'] : ['warn', 'error'],
});

export type Tx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

// Money columns are Decimal(12,2); JSON numbers are exact at that size and far easier for clients.
Prisma.Decimal.prototype.toJSON = function toJSON(this: Prisma.Decimal) {
  return this.toNumber() as unknown as string;
};
