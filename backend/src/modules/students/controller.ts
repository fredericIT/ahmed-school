import { toPublicUrl } from '../../middlewares/upload';
import { badRequest } from '../../utils/errors';
import { sendFile, sendReport, XLSX_MIME, type Report } from '../../utils/export';
import type { Ctx, idParams } from '../../utils/router';
import type * as s from './schema';
import * as docs from './documents';
import * as service from './service';
import { t } from '../../i18n';
import { label } from '../../i18n/labels';

type Id = { params: typeof idParams };

export async function list({ query, res }: Ctx<{ query: typeof s.listStudentsQuery }>) {
  if (query.format === 'json') return service.list(query);
  const rows = await service.listAll(query);
  const report: Report = {
    title: t('Student List'),
    subtitle:
      [
        query.status !== 'ALL' && t('Status: {status}', { status: label(query.status) }),
        query.search && t('Search: "{search}"', { search: query.search }),
      ]
        .filter(Boolean)
        .join(' · ') || undefined,
    columns: [
      { key: 'admissionNumber', header: t('Adm. No'), width: 2 },
      { key: 'name', header: t('Name'), width: 3 },
      { key: 'gender', header: t('Gender'), width: 1 },
      { key: 'dateOfBirth', header: t('Date of birth'), width: 1.6, format: 'date' },
      { key: 'class', header: t('Class'), width: 1.6 },
      { key: 'status', header: t('Status'), width: 1.5 },
      { key: 'guardian', header: t('Primary guardian'), width: 3 },
      { key: 'phone', header: t('Phone'), width: 2 },
      { key: 'admissionDate', header: t('Admitted'), width: 1.6, format: 'date' },
    ],
    rows: rows.map(service.toExportRow),
    summary: [
      { label: t('Total'), value: rows.length },
      { label: t('Boys'), value: rows.filter((r) => r.gender === 'MALE').length },
      { label: t('Girls'), value: rows.filter((r) => r.gender === 'FEMALE').length },
    ],
  };
  return sendReport(res, report, query.format);
}

export const get = ({ params }: Ctx<Id>) => service.get(params.id);
export const nextNumber = () => service.previewAdmissionNumber();
export const ageSuggestion = ({ query }: Ctx<{ query: typeof s.ageQuery }>) =>
  service.ageSuggestion(query.dateOfBirth);
export const create = ({ body, req }: Ctx<{ body: typeof s.createStudentBody }>) => service.create(body, req);
export const update = ({ params, body, req }: Ctx<Id & { body: typeof s.updateStudentBody }>) =>
  service.update(params.id, body, req);
export const setStatus = ({ params, body, req }: Ctx<Id & { body: typeof s.statusBody }>) =>
  service.setStatus(params.id, body.status, body.reason, req);
export const remove = ({ params, query, req, user }: Ctx<Id & { query: typeof s.deleteQuery }>) => {
  if (query.hard && user.role !== 'SUPER_ADMIN')
    throw badRequest('Only a super admin can permanently delete records');
  return service.remove(params.id, query.hard ?? false, req);
};
export const restore = ({ params, req }: Ctx<Id>) => service.restore(params.id, req);
export const promote = ({ body, req }: Ctx<{ body: typeof s.promoteBody }>) => service.promote(body, req);

export async function uploadPhoto({ params, req }: Ctx<Id>) {
  if (!req.file) throw badRequest('No file uploaded');
  return service.setPhoto(params.id, toPublicUrl('students', req.file), req);
}

export const activities = ({ params }: Ctx<Id>) => service.activities(params.id);
export const loans = ({ params }: Ctx<Id>) => service.loans(params.id);

export const addGuardian = ({ params, body, req }: Ctx<Id & { body: typeof s.linkGuardianBody }>) =>
  service.addGuardian(params.id, body, req);
export const updateLink = ({
  params,
  body,
  req,
}: Ctx<{ params: typeof s.guardianParams; body: typeof s.updateLinkBody }>) =>
  service.updateLink(params.id, params.guardianId, body.isPrimary, req);
export const removeGuardian = ({ params, req }: Ctx<{ params: typeof s.guardianParams }>) =>
  service.removeGuardian(params.id, params.guardianId, req);
export const searchGuardians = ({ query }: Ctx<{ query: typeof s.guardianSearchQuery }>) =>
  service.searchGuardians(query.search);
export const updateGuardian = ({ params, body, req }: Ctx<Id & { body: typeof s.updateGuardianBody }>) =>
  service.updateGuardian(params.id, body, req);

export async function idCard({ params, res }: Ctx<Id>) {
  sendFile(res, await docs.idCard(params.id), `id-card-${params.id}.pdf`, 'application/pdf');
}
export async function registrationForm({ params, res }: Ctx<Id>) {
  sendFile(res, await docs.registrationForm(params.id), `registration-${params.id}.pdf`, 'application/pdf');
}
export async function importTemplate({ res }: Ctx<object>) {
  sendFile(res, await docs.importTemplate(), 'student-import-template.xlsx', XLSX_MIME);
}
export async function importStudents({ req, query }: Ctx<{ query: typeof s.importQuery }>) {
  if (!req.file) throw badRequest('No file uploaded');
  return docs.importStudents(req.file.buffer, query.dryRun ?? false, req);
}
