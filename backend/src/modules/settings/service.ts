import type { Request } from 'express';
import type { z } from 'zod';
import { prisma } from '../../config/prisma';
import { audit, diff } from '../../utils/audit';
import { removeUpload } from '../../utils/files';
import { getSettings, invalidateSettings } from '../../utils/settings';
import type * as s from './schema';

export const get = getSettings;

export async function getPublic() {
  const { name, logo, motto, address, phone, email, website, currency, timezone, locale } =
    await getSettings();
  return { name, logo, motto, address, phone, email, website, currency, timezone, locale };
}

export async function update(data: z.infer<typeof s.updateSettingsBody>, req: Request) {
  const before = await getSettings();
  const after = await prisma.schoolSettings.update({ where: { id: before.id }, data });
  invalidateSettings();
  await audit(req, {
    action: 'UPDATE',
    entity: 'SchoolSettings',
    entityId: before.id,
    ...diff(before, after),
  });
  return after;
}

export async function setLogo(url: string, req: Request) {
  const before = await getSettings();
  const after = await prisma.schoolSettings.update({ where: { id: before.id }, data: { logo: url } });
  invalidateSettings();
  removeUpload(before.logo);
  await audit(req, {
    action: 'UPDATE',
    entity: 'SchoolSettings',
    entityId: before.id,
    oldValues: { logo: before.logo },
    newValues: { logo: url },
  });
  return after;
}
