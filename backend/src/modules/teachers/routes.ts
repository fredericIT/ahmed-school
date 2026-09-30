import { ApiRouter, idParams, type Ctx } from '../../utils/router';
import { forbidden } from '../../utils/errors';
import * as s from './schema';
import * as service from './service';

type Id = { params: typeof idParams };

// Administrators (super admin and admin) manage teachers; teachers only see their own classes.
const r = new ApiRouter('/teachers', 'Teachers');

r.get('/posts', { summary: 'Teaching posts and their registration-number codes' }, async () =>
  Object.entries(s.POSTS).map(([code, label]) => ({ code, label })),
);
r.get(
  '/me',
  { summary: "Signed-in teacher's courses, classes and rosters", roles: ['TEACHER'] },
  ({ user }: Ctx<object>) => service.myClasses(user.id),
);
r.get(
  '/',
  { summary: 'List teachers', schemas: { query: s.listTeachersQuery } },
  ({ query }: Ctx<{ query: typeof s.listTeachersQuery }>) => service.list(query),
);
r.post(
  '/',
  {
    summary: 'Add a teacher with course assignments; emails the registration number and activation link',
    status: 201,
    schemas: { body: s.createTeacherBody },
  },
  ({ body, req }: Ctx<{ body: typeof s.createTeacherBody }>) => service.create(body, req),
);
r.get('/:id', { summary: 'Teacher details', schemas: { params: idParams } }, ({ params }: Ctx<Id>) =>
  service.get(params.id),
);
r.patch(
  '/:id',
  { summary: 'Update teacher details', schemas: { params: idParams, body: s.updateTeacherBody } },
  ({ params, body, req }: Ctx<Id & { body: typeof s.updateTeacherBody }>) =>
    service.update(params.id, body, req),
);
r.put(
  '/:id/assignments',
  { summary: 'Replace course/class assignments', schemas: { params: idParams, body: s.assignmentsBody } },
  ({ params, body, req }: Ctx<Id & { body: typeof s.assignmentsBody }>) =>
    service.setAssignments(params.id, body.assignments, req),
);
r.patch(
  '/:id/status',
  { summary: 'Activate / deactivate a teacher', schemas: { params: idParams, body: s.statusBody } },
  ({ params, body, req }: Ctx<Id & { body: typeof s.statusBody }>) =>
    service.setStatus(params.id, body.isActive, req),
);
r.post(
  '/:id/password',
  {
    summary: "Set a teacher's password (administrators only)",
    schemas: { params: idParams, body: s.setPasswordBody },
  },
  ({ params, body, req }: Ctx<Id & { body: typeof s.setPasswordBody }>) =>
    service.setPassword(params.id, body.newPassword, req),
);
r.post(
  '/:id/resend-activation',
  { summary: 'Email a new activation link', schemas: { params: idParams } },
  ({ params, req }: Ctx<Id>) => service.resendActivation(params.id, req),
);
r.delete(
  '/:id',
  {
    summary: 'Delete teacher (soft; ?hard=true super admin only)',
    schemas: { params: idParams, query: s.deleteQuery },
  },
  ({ params, query, req, user }: Ctx<Id & { query: typeof s.deleteQuery }>) => {
    if (query.hard && user.role !== 'SUPER_ADMIN')
      throw forbidden('Only a super admin can permanently delete records');
    return service.remove(params.id, query.hard ?? false, req);
  },
);

export default r;
