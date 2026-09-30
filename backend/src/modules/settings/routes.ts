import { uploadImage } from '../../middlewares/upload';
import { ApiRouter } from '../../utils/router';
import * as c from './controller';
import * as s from './schema';

const r = new ApiRouter('/settings', 'Settings');
r.get('/public', { summary: 'Public school branding (name, logo, motto)', public: true }, c.getPublic);
r.get('/', { summary: 'Full school settings', teachers: true }, c.get);
r.patch(
  '/',
  { summary: 'Update school settings', roles: ['SUPER_ADMIN'], schemas: { body: s.updateSettingsBody } },
  c.update,
);
r.post(
  '/logo',
  {
    summary: 'Upload school logo',
    roles: ['SUPER_ADMIN'],
    pre: [uploadImage('school')],
    multipart: { file: 'file' },
  },
  c.uploadLogo,
);

export default r;
