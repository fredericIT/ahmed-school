import { ApiRouter, idParams } from '../../utils/router';
import * as c from './controller';
import * as s from './schema';

const SA = ['SUPER_ADMIN' as const];
const r = new ApiRouter('/classes', 'Classes');
r.get(
  '/',
  {
    summary: 'List classes with enrolment counts (teachers: only their classes)',
    teachers: true,
    schemas: { query: s.listClassesQuery },
  },
  c.list,
);
r.get('/:id', { summary: 'Class details with roster', schemas: { params: idParams } }, c.get);
r.post('/', { summary: 'Create class', roles: SA, status: 201, schemas: { body: s.classBody } }, c.create);
r.patch(
  '/:id',
  { summary: 'Update class', roles: SA, schemas: { params: idParams, body: s.classUpdateBody } },
  c.update,
);
r.delete('/:id', { summary: 'Delete an empty class', roles: SA, schemas: { params: idParams } }, c.remove);

export default r;
