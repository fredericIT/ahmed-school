import type { SchoolSettings } from '@prisma/client';
import { prisma } from '../config/prisma';

let cache: { value: SchoolSettings; at: number } | null = null;
const TTL_MS = 60_000;

export async function getSettings(): Promise<SchoolSettings> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  let value = await prisma.schoolSettings.findFirst({ orderBy: { id: 'asc' } });
  if (!value) value = await prisma.schoolSettings.create({ data: { name: 'My School' } });
  cache = { value, at: Date.now() };
  return value;
}

export function invalidateSettings(): void {
  cache = null;
}
