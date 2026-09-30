import { ApiRouter, idParams } from '../../utils/router';
import * as c from './controller';
import * as s from './schema';

const SA = ['SUPER_ADMIN' as const];
const r = new ApiRouter('/users', 'Users');
r.get('/', { summary: 'List staff users', roles: SA, schemas: { query: s.listUsersQuery } }, c.list);
r.get('/:id', { summary: 'Get a user', roles: SA, schemas: { params: idParams } }, c.get);
r.post(
  '/',
  { summary: 'Create a user', roles: SA, status: 201, schemas: { body: s.createUserBody } },
  c.create,
);
r.patch(
  '/:id',
  { summary: 'Update a user', roles: SA, schemas: { params: idParams, body: s.updateUserBody } },
  c.update,
);
r.patch(
  '/:id/status',
  { summary: 'Activate / deactivate a user', roles: SA, schemas: { params: idParams, body: s.statusBody } },
  c.setStatus,
);
r.post(
  '/:id/reset-password',
  { summary: "Reset a user's password", roles: SA, schemas: { params: idParams, body: s.resetPasswordBody } },
  c.resetPassword,
);
r.delete(
  '/:id',
  {
    summary: 'Delete a user (soft by default, ?hard=true for permanent)',
    roles: SA,
    schemas: { params: idParams, query: s.deleteQuery },
  },
  c.remove,
);

export default r;
