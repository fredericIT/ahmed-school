import { toPublicUrl } from '../../middlewares/upload';
import { badRequest } from '../../utils/errors';
import { sendReport } from '../../utils/export';
import type { Ctx, idParams } from '../../utils/router';
import type * as s from './schema';
import * as service from './service';

type Id = { params: typeof idParams };

export const listCategories = () => service.listCategories();
export const createCategory = ({ body, req }: Ctx<{ body: typeof s.categoryBody }>) =>
  service.createCategory(body, req);
export const updateCategory = ({ params, body, req }: Ctx<Id & { body: typeof s.categoryUpdateBody }>) =>
  service.updateCategory(params.id, body, req);
export const deleteCategory = ({ params, req }: Ctx<Id>) => service.deleteCategory(params.id, req);

export const listSuppliers = ({ query }: Ctx<{ query: typeof s.supplierListQuery }>) =>
  service.listSuppliers(query);
export const createSupplier = ({ body, req }: Ctx<{ body: typeof s.supplierBody }>) =>
  service.createSupplier(body, req);
export const updateSupplier = ({ params, body, req }: Ctx<Id & { body: typeof s.supplierUpdateBody }>) =>
  service.updateSupplier(params.id, body, req);
export const deleteSupplier = ({ params, req }: Ctx<Id>) => service.deleteSupplier(params.id, req);

export async function listItems({ query, res }: Ctx<{ query: typeof s.itemListQuery }>) {
  if (query.format === 'json') return service.listItems(query);
  return sendReport(res, await service.itemsReport(query), query.format);
}
export const getItem = ({ params }: Ctx<Id>) => service.getItem(params.id);
export const createItem = ({ body, req }: Ctx<{ body: typeof s.itemBody }>) => service.createItem(body, req);
export const updateItem = ({ params, body, req }: Ctx<Id & { body: typeof s.itemUpdateBody }>) =>
  service.updateItem(params.id, body, req);
export const deleteItem = ({ params, query, req, user }: Ctx<Id & { query: typeof s.deleteQuery }>) => {
  if (query.hard && user.role !== 'SUPER_ADMIN')
    throw badRequest('Only a super admin can permanently delete records');
  return service.deleteItem(params.id, query.hard ?? false, req);
};
export async function uploadImage({ params, req }: Ctx<Id>) {
  if (!req.file) throw badRequest('No file uploaded');
  return service.setItemImage(params.id, toPublicUrl('inventory', req.file), req);
}

export const recordMovement = ({ body, req }: Ctx<{ body: typeof s.movementBody }>) =>
  service.recordMovement(body, req);
export async function listMovements({ query, res }: Ctx<{ query: typeof s.movementListQuery }>) {
  if (query.format === 'json') return service.listMovements(query);
  return sendReport(res, await service.movementsReport(query), query.format);
}
export const alerts = () => service.alerts();
