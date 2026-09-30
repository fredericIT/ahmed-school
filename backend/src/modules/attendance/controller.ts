import { sendReport } from '../../utils/export';
import type { Ctx, idParams } from '../../utils/router';
import type * as s from './schema';
import * as service from './service';
import { assertCanUseClass } from '../teachers/access';

type Report = { query: typeof s.reportQuery };

export async function sheet({ query, user }: Ctx<{ query: typeof s.sheetQuery }>) {
  await assertCanUseClass(user, query.classId);
  return service.sheet(query.classId, query.date);
}
export async function saveSheet({ body, req, user }: Ctx<{ body: typeof s.saveSheetBody }>) {
  await assertCanUseClass(user, body.classId);
  return service.saveSheet(body, req);
}
export async function monthly({ query, user }: Ctx<{ query: typeof s.monthlyQuery }>) {
  await assertCanUseClass(user, query.classId);
  return service.monthly(query.classId, query.month);
}
export const studentHistory = ({
  params,
  query,
}: Ctx<{ params: typeof idParams; query: typeof s.historyQuery }>) =>
  service.studentHistory(params.id, query);
export const byStudent = async ({ query, res }: Ctx<Report>) =>
  sendReport(res, await service.studentReport(query), query.format);
export const byClass = async ({ query, res }: Ctx<Report>) =>
  sendReport(res, await service.classReport(query), query.format);
export const chronic = async ({ query, res }: Ctx<Report>) =>
  sendReport(res, await service.chronicReport(query), query.format);
