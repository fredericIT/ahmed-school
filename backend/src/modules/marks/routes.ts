import { ApiRouter, idParams, type Ctx } from '../../utils/router';
import { sendFile, sendReport } from '../../utils/export';
import { reportCards } from './report-card';
import * as s from './schema';
import * as service from './service';

type Id = { params: typeof idParams };

// Teachers record marks for the courses and classes they are assigned to;
// administrators see every class's results and print report cards.
const r = new ApiRouter('/marks', 'Marks');

r.get(
  '/options',
  { summary: 'Terms and the class/course pairs I can mark', teachers: true },
  ({ user }: Ctx<object>) => service.options(user),
);

r.get(
  '/overview',
  {
    summary: 'School-wide marks summary for a term: averages and pass rates per class, latest assessments',
    schemas: { query: s.overviewQuery },
  },
  ({ query }: Ctx<{ query: typeof s.overviewQuery }>) => service.overview(query.termId),
);

r.get(
  '/assessments',
  {
    summary: 'Assessments of a course in a class for a term',
    teachers: true,
    schemas: { query: s.assessmentsQuery },
  },
  ({ user, query }: Ctx<{ query: typeof s.assessmentsQuery }>) => service.listAssessments(user, query),
);
r.post(
  '/assessments',
  {
    summary: 'Create an assessment (classwork, test, exam…)',
    teachers: true,
    status: 201,
    schemas: { body: s.assessmentBody },
  },
  ({ user, body, req }: Ctx<{ body: typeof s.assessmentBody }>) => service.createAssessment(user, body, req),
);
r.get(
  '/assessments/:id',
  { summary: 'Assessment with the class roster and marks', teachers: true, schemas: { params: idParams } },
  ({ user, params }: Ctx<Id>) => service.getAssessment(user, params.id),
);
r.patch(
  '/assessments/:id',
  {
    summary: 'Update an assessment',
    teachers: true,
    schemas: { params: idParams, body: s.assessmentUpdateBody },
  },
  ({ user, params, body, req }: Ctx<Id & { body: typeof s.assessmentUpdateBody }>) =>
    service.updateAssessment(user, params.id, body, req),
);
r.delete(
  '/assessments/:id',
  {
    summary: 'Delete an assessment and its marks from results',
    teachers: true,
    schemas: { params: idParams },
  },
  ({ user, params, req }: Ctx<Id>) => service.deleteAssessment(user, params.id, req),
);
r.put(
  '/assessments/:id/marks',
  {
    summary: 'Save marks (a null score that is not absent clears the mark)',
    teachers: true,
    schemas: { params: idParams, body: s.marksBody },
  },
  ({ user, params, body, req }: Ctx<Id & { body: typeof s.marksBody }>) =>
    service.saveMarks(user, params.id, body, req),
);

r.get(
  '/course-results',
  {
    summary: 'Marks of one course in a class for a term (json, xlsx or pdf)',
    teachers: true,
    schemas: { query: s.courseResultsQuery },
    produces: ['application/json', 'application/pdf'],
  },
  async ({ user, query, res }: Ctx<{ query: typeof s.courseResultsQuery }>) =>
    sendReport(res, await service.courseResults(user, query), query.format),
);
r.get(
  '/class-results',
  {
    summary: 'Every course result of a class for a term, with averages and positions',
    schemas: { query: s.classResultsQuery },
    produces: ['application/json', 'application/pdf'],
  },
  async ({ query, res }: Ctx<{ query: typeof s.classResultsQuery }>) =>
    sendReport(res, await service.classResults(query), query.format),
);
r.get(
  '/report-cards',
  {
    summary: 'Report cards (bulletins) for a class, or one pupil, as PDF',
    schemas: { query: s.reportCardsQuery },
    produces: ['application/pdf'],
  },
  async ({ query, res }: Ctx<{ query: typeof s.reportCardsQuery }>) => {
    const { buffer, filename } = await reportCards(query.termId, query.classId, query.studentId);
    sendFile(res, buffer, filename, 'application/pdf');
  },
);

export default r;
