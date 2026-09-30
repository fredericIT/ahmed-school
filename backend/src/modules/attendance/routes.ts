import { ApiRouter, idParams } from '../../utils/router';
import * as c from './controller';
import * as s from './schema';

const r = new ApiRouter('/attendance', 'Attendance');
r.get(
  '/sheet',
  { summary: 'Daily class roster with recorded statuses', teachers: true, schemas: { query: s.sheetQuery } },
  c.sheet,
);
r.post(
  '/sheet',
  {
    summary: 'Save (create or edit) a daily class sheet',
    teachers: true,
    schemas: { body: s.saveSheetBody },
  },
  c.saveSheet,
);
r.get(
  '/monthly',
  { summary: 'Monthly calendar grid for a class', teachers: true, schemas: { query: s.monthlyQuery } },
  c.monthly,
);
r.get(
  '/students/:id',
  { summary: 'Attendance history for a student', schemas: { params: idParams, query: s.historyQuery } },
  c.studentHistory,
);
r.get(
  '/reports/students',
  { summary: 'Attendance rate per student (json|xlsx|pdf)', schemas: { query: s.reportQuery } },
  c.byStudent,
);
r.get(
  '/reports/classes',
  { summary: 'Attendance rate per class (json|xlsx|pdf)', schemas: { query: s.reportQuery } },
  c.byClass,
);
r.get(
  '/reports/chronic',
  { summary: 'Students below the attendance threshold (json|xlsx|pdf)', schemas: { query: s.reportQuery } },
  c.chronic,
);

export default r;
