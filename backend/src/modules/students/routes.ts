import { uploadImage, uploadSpreadsheet } from '../../middlewares/upload';
import { ApiRouter, idParams } from '../../utils/router';
import * as c from './controller';
import * as s from './schema';

const PDF = ['application/pdf'];
const r = new ApiRouter('/students', 'Students');
r.get(
  '/',
  {
    summary: 'List / search / export students (format=json|xlsx|pdf)',
    schemas: { query: s.listStudentsQuery },
  },
  c.list,
);
r.get('/next-admission-number', { summary: 'Preview the next admission number' }, c.nextNumber);
r.get(
  '/age-suggestion',
  { summary: 'Suggest a class for a date of birth', schemas: { query: s.ageQuery } },
  c.ageSuggestion,
);
r.get(
  '/import/template',
  {
    summary: 'Download the Excel import template',
    produces: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  },
  c.importTemplate,
);
r.post(
  '/import',
  {
    summary: 'Bulk import students from Excel (dryRun=true to validate only)',
    pre: [uploadSpreadsheet],
    multipart: { file: 'file' },
    schemas: { query: s.importQuery },
  },
  c.importStudents,
);
r.post(
  '/promote',
  { summary: 'Promote a class to the next grade (P2 graduates)', schemas: { body: s.promoteBody } },
  c.promote,
);
r.get(
  '/guardians/search',
  { summary: 'Search existing guardians (for siblings)', schemas: { query: s.guardianSearchQuery } },
  c.searchGuardians,
);
r.patch(
  '/guardians/:id',
  { summary: 'Update guardian details', schemas: { params: idParams, body: s.updateGuardianBody } },
  c.updateGuardian,
);

r.post(
  '/',
  { summary: 'Register a student with guardians', status: 201, schemas: { body: s.createStudentBody } },
  c.create,
);
r.get('/:id', { summary: 'Student profile', schemas: { params: idParams } }, c.get);
r.patch(
  '/:id',
  { summary: 'Update student', schemas: { params: idParams, body: s.updateStudentBody } },
  c.update,
);
r.patch(
  '/:id/status',
  { summary: 'Change status (transfer, withdraw…)', schemas: { params: idParams, body: s.statusBody } },
  c.setStatus,
);
r.delete(
  '/:id',
  {
    summary: 'Delete student (soft; ?hard=true super admin only)',
    schemas: { params: idParams, query: s.deleteQuery },
  },
  c.remove,
);
r.post(
  '/:id/restore',
  { summary: 'Restore a soft-deleted student', roles: ['SUPER_ADMIN'], schemas: { params: idParams } },
  c.restore,
);
r.post(
  '/:id/photo',
  {
    summary: 'Upload student photo',
    pre: [uploadImage('students')],
    multipart: { file: 'file' },
    schemas: { params: idParams },
  },
  c.uploadPhoto,
);
r.get(
  '/:id/activities',
  { summary: 'Activities the student took part in', schemas: { params: idParams } },
  c.activities,
);
r.get('/:id/loans', { summary: 'Library borrowing history', schemas: { params: idParams } }, c.loans);
r.get(
  '/:id/id-card',
  { summary: 'Printable ID card (PDF)', produces: PDF, schemas: { params: idParams } },
  c.idCard,
);
r.get(
  '/:id/registration-form',
  { summary: 'Printable registration form (PDF)', produces: PDF, schemas: { params: idParams } },
  c.registrationForm,
);
r.post(
  '/:id/guardians',
  { summary: 'Add or link a guardian', schemas: { params: idParams, body: s.linkGuardianBody } },
  c.addGuardian,
);
r.patch(
  '/:id/guardians/:guardianId',
  { summary: 'Set primary guardian', schemas: { params: s.guardianParams, body: s.updateLinkBody } },
  c.updateLink,
);
r.delete(
  '/:id/guardians/:guardianId',
  { summary: 'Unlink a guardian', schemas: { params: s.guardianParams } },
  c.removeGuardian,
);

export default r;
