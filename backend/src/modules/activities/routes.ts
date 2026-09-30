import { uploadImages } from '../../middlewares/upload';
import { ApiRouter, idParams } from '../../utils/router';
import * as c from './controller';
import * as s from './schema';

const r = new ApiRouter('/activities', 'Activities');
r.get(
  '/',
  { summary: 'List / export activities (format=json|xlsx|pdf)', schemas: { query: s.listQuery } },
  c.list,
);
r.get(
  '/calendar',
  { summary: 'Activities in a date range for calendar views', schemas: { query: s.calendarQuery } },
  c.calendar,
);
r.post('/', { summary: 'Plan a new activity', status: 201, schemas: { body: s.createBody } }, c.create);
r.get('/:id', { summary: 'Activity details', schemas: { params: idParams } }, c.get);
r.patch('/:id', { summary: 'Update activity', schemas: { params: idParams, body: s.updateBody } }, c.update);
r.post(
  '/:id/complete',
  {
    summary: 'Mark as completed with outcome & actual cost',
    schemas: { params: idParams, body: s.completeBody },
  },
  c.complete,
);
r.patch(
  '/:id/status',
  { summary: 'Change activity status', schemas: { params: idParams, body: s.statusBody } },
  c.setStatus,
);
r.delete(
  '/:id',
  {
    summary: 'Delete activity (soft; ?hard=true super admin only)',
    schemas: { params: idParams, query: s.deleteQuery },
  },
  c.remove,
);
r.get(
  '/:id/report',
  { summary: 'Activity report (PDF)', produces: ['application/pdf'], schemas: { params: idParams } },
  c.pdf,
);
r.post(
  '/:id/photos',
  {
    summary: 'Upload gallery photos (field "files", up to 10)',
    pre: [uploadImages('activities')],
    multipart: { files: 'files', caption: 'string' },
    schemas: { params: idParams, body: s.photoUploadBody },
  },
  c.addPhotos,
);
r.patch(
  '/:id/photos/:photoId',
  { summary: 'Edit photo caption', schemas: { params: s.photoParams, body: s.captionBody } },
  c.updatePhoto,
);
r.delete(
  '/:id/photos/:photoId',
  { summary: 'Delete photo', schemas: { params: s.photoParams } },
  c.removePhoto,
);

export default r;
