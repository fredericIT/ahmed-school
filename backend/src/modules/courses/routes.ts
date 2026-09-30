import { ApiRouter, idParams, type Ctx } from '../../utils/router';
import * as s from './schema';
import * as service from './service';

type Id = { params: typeof idParams };

const r = new ApiRouter('/courses', 'Courses');
r.get(
  '/',
  { summary: 'List courses (subjects)', schemas: { query: s.listCoursesQuery } },
  ({ query }: Ctx<{ query: typeof s.listCoursesQuery }>) => service.list(query),
);
r.post(
  '/',
  { summary: 'Create course', status: 201, schemas: { body: s.courseBody } },
  ({ body, req }: Ctx<{ body: typeof s.courseBody }>) => service.create(body, req),
);
r.patch(
  '/:id',
  { summary: 'Update course', schemas: { params: idParams, body: s.courseUpdateBody } },
  ({ params, body, req }: Ctx<Id & { body: typeof s.courseUpdateBody }>) =>
    service.update(params.id, body, req),
);
r.delete(
  '/:id',
  { summary: 'Delete course (removes its teacher assignments)', schemas: { params: idParams } },
  ({ params, req }: Ctx<Id>) => service.remove(params.id, req),
);

export default r;
