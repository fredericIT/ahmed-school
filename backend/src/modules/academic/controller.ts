import type { Ctx, idParams } from '../../utils/router';
import type * as s from './schema';
import * as service from './service';

type Id = { params: typeof idParams };

export const current = () => service.getCurrent();
export const listYears = () => service.listYears();
export const createYear = ({ body, req }: Ctx<{ body: typeof s.yearBody }>) => service.createYear(body, req);
export const updateYear = ({ params, body, req }: Ctx<Id & { body: typeof s.yearUpdateBody }>) =>
  service.updateYear(params.id, body, req);
export const setCurrentYear = ({ params, req }: Ctx<Id>) => service.setCurrentYear(params.id, req);
export const deleteYear = ({ params, req }: Ctx<Id>) => service.deleteYear(params.id, req);

export const listTerms = ({ query }: Ctx<{ query: typeof s.termsQuery }>) =>
  service.listTerms(query.academicYearId);
export const createTerm = ({ body, req }: Ctx<{ body: typeof s.termBody }>) => service.createTerm(body, req);
export const updateTerm = ({ params, body, req }: Ctx<Id & { body: typeof s.termUpdateBody }>) =>
  service.updateTerm(params.id, body, req);
export const setCurrentTerm = ({ params, req }: Ctx<Id>) => service.setCurrentTerm(params.id, req);
export const deleteTerm = ({ params, req }: Ctx<Id>) => service.deleteTerm(params.id, req);

export const listHolidays = ({ query }: Ctx<{ query: typeof s.holidaysQuery }>) =>
  service.listHolidays(query.year);
export const createHoliday = ({ body, req }: Ctx<{ body: typeof s.holidayBody }>) =>
  service.createHoliday(body, req);
export const deleteHoliday = ({ params, req }: Ctx<Id>) => service.deleteHoliday(params.id, req);
