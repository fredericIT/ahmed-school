import { toPublicUrl } from '../../middlewares/upload';
import { badRequest } from '../../utils/errors';
import { sendFile, sendReport } from '../../utils/export';
import type { Ctx, idParams } from '../../utils/router';
import type * as s from './schema';
import * as service from './service';

type Id = { params: typeof idParams };

export async function list({ query, res }: Ctx<{ query: typeof s.listQuery }>) {
  if (query.format === 'json') return service.list(query);
  return sendReport(res, await service.listReport(query), query.format);
}
export const calendar = ({ query }: Ctx<{ query: typeof s.calendarQuery }>) =>
  service.calendar(query.from, query.to);
export const get = ({ params }: Ctx<Id>) => service.get(params.id);
export const create = ({ body, req }: Ctx<{ body: typeof s.createBody }>) => service.create(body, req);
export const update = ({ params, body, req }: Ctx<Id & { body: typeof s.updateBody }>) =>
  service.update(params.id, body, req);
export const complete = ({ params, body, req }: Ctx<Id & { body: typeof s.completeBody }>) =>
  service.complete(params.id, body, req);
export const setStatus = ({ params, body, req }: Ctx<Id & { body: typeof s.statusBody }>) =>
  service.setStatus(params.id, body.status, req);
export const remove = ({ params, query, req, user }: Ctx<Id & { query: typeof s.deleteQuery }>) => {
  if (query.hard && user.role !== 'SUPER_ADMIN')
    throw badRequest('Only a super admin can permanently delete records');
  return service.remove(params.id, query.hard ?? false, req);
};
export async function addPhotos({ params, body, req }: Ctx<Id & { body: typeof s.photoUploadBody }>) {
  const files = Array.isArray(req.files) ? req.files : [];
  if (!files.length) throw badRequest('No photos uploaded');
  return service.addPhotos(
    params.id,
    files.map((f) => toPublicUrl('activities', f)),
    body.caption,
    req,
  );
}
export const updatePhoto = ({
  params,
  body,
  req,
}: Ctx<{ params: typeof s.photoParams; body: typeof s.captionBody }>) =>
  service.updatePhoto(params.id, params.photoId, body.caption, req);
export const removePhoto = ({ params, req }: Ctx<{ params: typeof s.photoParams }>) =>
  service.removePhoto(params.id, params.photoId, req);
export async function pdf({ params, res }: Ctx<Id>) {
  sendFile(res, await service.activityPdf(params.id), `activity-${params.id}.pdf`, 'application/pdf');
}
