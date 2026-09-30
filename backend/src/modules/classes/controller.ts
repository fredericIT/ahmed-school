import type { Ctx, idParams } from '../../utils/router';
import type * as s from './schema';
import * as service from './service';
import { teacherClassIds } from '../teachers/access';

type Id = { params: typeof idParams };

export async function list({ query, user }: Ctx<{ query: typeof s.listClassesQuery }>) {
  const classes = await service.list(query);
  if (user.role !== 'TEACHER') return classes;
  const mine = await teacherClassIds(user.id);
  return classes.filter((c) => mine.includes(c.id));
}
export const get = ({ params }: Ctx<Id>) => service.get(params.id);
export const create = ({ body, req }: Ctx<{ body: typeof s.classBody }>) => service.create(body, req);
export const update = ({ params, body, req }: Ctx<Id & { body: typeof s.classUpdateBody }>) =>
  service.update(params.id, body, req);
export const remove = ({ params, req }: Ctx<Id>) => service.remove(params.id, req);
