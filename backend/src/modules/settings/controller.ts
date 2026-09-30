import { toPublicUrl } from '../../middlewares/upload';
import { badRequest } from '../../utils/errors';
import type { Ctx } from '../../utils/router';
import type * as s from './schema';
import * as service from './service';

export const getPublic = () => service.getPublic();
export const get = () => service.get();
export const update = ({ body, req }: Ctx<{ body: typeof s.updateSettingsBody }>) =>
  service.update(body, req);
export async function uploadLogo({ req }: Ctx<object>) {
  if (!req.file) throw badRequest('No file uploaded');
  return service.setLogo(toPublicUrl('school', req.file), req);
}
