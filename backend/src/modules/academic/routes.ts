import { ApiRouter, idParams } from '../../utils/router';
import * as c from './controller';
import * as s from './schema';

const SA = ['SUPER_ADMIN' as const];
const r = new ApiRouter('/academic', 'Academic calendar');
r.get('/current', { summary: 'Current academic year and term', teachers: true }, c.current);

r.get('/years', { summary: 'List academic years with terms' }, c.listYears);
r.post(
  '/years',
  { summary: 'Create academic year', roles: SA, status: 201, schemas: { body: s.yearBody } },
  c.createYear,
);
r.patch(
  '/years/:id',
  { summary: 'Update academic year', roles: SA, schemas: { params: idParams, body: s.yearUpdateBody } },
  c.updateYear,
);
r.post(
  '/years/:id/set-current',
  { summary: 'Mark academic year as current', roles: SA, schemas: { params: idParams } },
  c.setCurrentYear,
);
r.delete(
  '/years/:id',
  { summary: 'Delete academic year', roles: SA, schemas: { params: idParams } },
  c.deleteYear,
);

r.get('/terms', { summary: 'List terms', teachers: true, schemas: { query: s.termsQuery } }, c.listTerms);
r.post(
  '/terms',
  { summary: 'Create term', roles: SA, status: 201, schemas: { body: s.termBody } },
  c.createTerm,
);
r.patch(
  '/terms/:id',
  { summary: 'Update term', roles: SA, schemas: { params: idParams, body: s.termUpdateBody } },
  c.updateTerm,
);
r.post(
  '/terms/:id/set-current',
  { summary: 'Mark term as current', roles: SA, schemas: { params: idParams } },
  c.setCurrentTerm,
);
r.delete('/terms/:id', { summary: 'Delete term', roles: SA, schemas: { params: idParams } }, c.deleteTerm);

r.get('/holidays', { summary: 'List holidays', schemas: { query: s.holidaysQuery } }, c.listHolidays);
r.post(
  '/holidays',
  { summary: 'Add holiday', roles: SA, status: 201, schemas: { body: s.holidayBody } },
  c.createHoliday,
);
r.delete(
  '/holidays/:id',
  { summary: 'Remove holiday', roles: SA, schemas: { params: idParams } },
  c.deleteHoliday,
);

export default r;
