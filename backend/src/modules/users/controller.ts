import type { Ctx } from '../../utils/router';
import type { idParams } from '../../utils/router';
import type * as s from './schema';
import * as service from './service';

type Id = { params: typeof idParams };

export const list = ({ query }: Ctx<{ query: typeof s.listUsersQuery }>) => service.list(query);
export const get = ({ params }: Ctx<Id>) => service.get(params.id);
export const create = ({ body, req }: Ctx<{ body: typeof s.createUserBody }>) => service.create(body, req);
export const update = ({ params, body, req }: Ctx<Id & { body: typeof s.updateUserBody }>) =>
  service.update(params.id, body, req);
export const setStatus = ({ params, body, req }: Ctx<Id & { body: typeof s.statusBody }>) =>
  service.setStatus(params.id, body.isActive, req);
export const resetPassword = ({ params, body, req }: Ctx<Id & { body: typeof s.resetPasswordBody }>) =>
  service.resetPassword(params.id, body.newPassword, req);
export const remove = ({ params, query, req }: Ctx<Id & { query: typeof s.deleteQuery }>) =>
  service.remove(params.id, query.hard ?? false, req);
