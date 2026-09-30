import { z } from 'zod';
import { ISO_DATE } from '../../utils/dates';
import { notFound } from '../../utils/errors';
import { sendReport, type Report } from '../../utils/export';
import { ApiRouter, type Ctx } from '../../utils/router';
import * as attendance from '../attendance/service';
import * as activities from '../activities/service';
import * as inventory from '../inventory/service';
import * as library from '../library/service';
import * as students from '../students/service';
import { fmtDate } from '../../utils/dates';
import { periodLabel, t } from '../../i18n';

const isoDate = z.string().regex(ISO_DATE);
const reportQuery = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  termId: z.coerce.number().int().positive().optional(),
  classId: z.coerce.number().int().positive().optional(),
  format: z.enum(['json', 'xlsx', 'pdf']).default('json'),
});
type Q = z.infer<typeof reportQuery>;
type Filter = 'dateRange' | 'term' | 'class';

interface ReportDef {
  key: string;
  group: 'Students' | 'Attendance' | 'Activities' | 'Inventory' | 'Library';
  title: string;
  description: string;
  filters: Filter[];
  build: (q: Q) => Promise<Report>;
}

const page = { page: 1, pageSize: 1, sortOrder: 'desc' as const, format: 'json' as const };

/** Every report in the system, so the Reports Center can list and run them generically. */
const REPORTS: ReportDef[] = [
  {
    key: 'students',
    group: 'Students',
    get title() {
      return t('Student list');
    },
    get description() {
      return t('All active students with class and primary guardian');
    },
    filters: ['class'],
    build: async (q) => {
      const rows = await students.listAll({ ...page, status: 'ACTIVE', classId: q.classId });
      return {
        title: t('Student List'),
        columns: [
          { key: 'admissionNumber', header: t('Adm. No'), width: 2 },
          { key: 'name', header: t('Name'), width: 3 },
          { key: 'gender', header: t('Gender'), width: 1 },
          { key: 'dateOfBirth', header: t('Date of birth'), format: 'date', width: 1.6 },
          { key: 'class', header: t('Class'), width: 1.6 },
          { key: 'guardian', header: t('Primary guardian'), width: 3 },
          { key: 'phone', header: t('Phone'), width: 2 },
        ],
        rows: rows.map(students.toExportRow),
        summary: [
          { label: t('Total'), value: rows.length },
          { label: t('Boys'), value: rows.filter((r) => r.gender === 'MALE').length },
          { label: t('Girls'), value: rows.filter((r) => r.gender === 'FEMALE').length },
        ],
      };
    },
  },
  {
    key: 'admissions',
    group: 'Students',
    get title() {
      return t('New admissions');
    },
    get description() {
      return t('Students admitted within a date range');
    },
    filters: ['dateRange', 'class'],
    build: async (q) => {
      const rows = (await students.listAll({ ...page, status: 'ALL', classId: q.classId })).filter(
        (s) => (!q.from || fmtDate(s.admissionDate) >= q.from) && (!q.to || fmtDate(s.admissionDate) <= q.to),
      );
      return {
        title: t('New Admissions'),
        subtitle: periodLabel(q.from, q.to) || t('All time'),
        columns: [
          { key: 'admissionDate', header: t('Admitted'), format: 'date', width: 1.6 },
          { key: 'admissionNumber', header: t('Adm. No'), width: 2 },
          { key: 'name', header: t('Name'), width: 3 },
          { key: 'gender', header: t('Gender'), width: 1 },
          { key: 'class', header: t('Class'), width: 1.6 },
          { key: 'guardian', header: t('Guardian'), width: 3 },
          { key: 'phone', header: t('Phone'), width: 2 },
        ],
        rows: rows.map(students.toExportRow).sort((a, b) => a.admissionDate.localeCompare(b.admissionDate)),
        summary: [{ label: t('Admissions'), value: rows.length }],
      };
    },
  },
  {
    key: 'attendance-classes',
    group: 'Attendance',
    get title() {
      return t('Attendance by class');
    },
    get description() {
      return t('Attendance rate for each class');
    },
    filters: ['dateRange', 'term'],
    build: (q) => attendance.classReport({ ...q }),
  },
  {
    key: 'attendance-students',
    group: 'Attendance',
    get title() {
      return t('Attendance by student');
    },
    get description() {
      return t('Present/absent counts and rate per student');
    },
    filters: ['dateRange', 'term', 'class'],
    build: (q) => attendance.studentReport({ ...q }),
  },
  {
    key: 'chronic-absentees',
    group: 'Attendance',
    get title() {
      return t('Chronic absentees');
    },
    get description() {
      return t('Students below the attendance threshold');
    },
    filters: ['dateRange', 'term', 'class'],
    build: (q) => attendance.chronicReport({ ...q }),
  },
  {
    key: 'activities',
    group: 'Activities',
    get title() {
      return t('Activities report');
    },
    get description() {
      return t('Activities with participants, budget and actual cost');
    },
    filters: ['dateRange', 'term', 'class'],
    build: (q) =>
      activities.listReport({ ...page, from: q.from, to: q.to, termId: q.termId, classId: q.classId }),
  },
  {
    key: 'stock-levels',
    group: 'Inventory',
    get title() {
      return t('Stock levels');
    },
    get description() {
      return t('Current quantity, reorder level and value of every item');
    },
    filters: [],
    build: () => inventory.itemsReport({ ...page }),
  },
  {
    key: 'low-stock',
    group: 'Inventory',
    get title() {
      return t('Low stock');
    },
    get description() {
      return t('Items at or below their reorder level');
    },
    filters: [],
    build: () => inventory.itemsReport({ ...page, lowStock: true }, t('Low Stock Items')),
  },
  {
    key: 'stock-movements',
    group: 'Inventory',
    get title() {
      return t('Stock movements');
    },
    get description() {
      return t('All stock in/out/adjustments in a date range');
    },
    filters: ['dateRange', 'class'],
    build: (q) => inventory.movementsReport({ ...page, from: q.from, to: q.to, classId: q.classId }),
  },
  {
    key: 'consumption-by-class',
    group: 'Inventory',
    get title() {
      return t('Consumption per class');
    },
    get description() {
      return t('Items issued to each class by category');
    },
    filters: ['dateRange'],
    build: (q) => inventory.consumptionByClassReport(q),
  },
  {
    key: 'stock-valuation',
    group: 'Inventory',
    get title() {
      return t('Stock valuation');
    },
    get description() {
      return t('Value of stock on hand per category');
    },
    filters: [],
    build: () => inventory.valuationReport(),
  },
  {
    key: 'library-catalogue',
    group: 'Library',
    get title() {
      return t('Library catalogue');
    },
    get description() {
      return t('All books with copies and availability');
    },
    filters: [],
    build: () => library.booksReport({ ...page }),
  },
  {
    key: 'most-borrowed',
    group: 'Library',
    get title() {
      return t('Most borrowed books');
    },
    get description() {
      return t('Top books by number of loans');
    },
    filters: ['dateRange'],
    build: (q) => library.mostBorrowedReport({ ...q, limit: 50 }),
  },
  {
    key: 'loans-by-class',
    group: 'Library',
    get title() {
      return t('Loans per class');
    },
    get description() {
      return t('Borrowing activity per class');
    },
    filters: ['dateRange'],
    build: (q) => library.loansByClassReport({ ...q, limit: 50 }),
  },
  {
    key: 'library-loans',
    group: 'Library',
    get title() {
      return t('Loan register');
    },
    get description() {
      return t('Every loan issued in a date range');
    },
    filters: ['dateRange', 'class'],
    build: (q) => library.loansReport({ ...page, from: q.from, to: q.to, classId: q.classId }),
  },
  {
    key: 'overdue-books',
    group: 'Library',
    get title() {
      return t('Overdue books');
    },
    get description() {
      return t('Books past their due date');
    },
    filters: [],
    build: (q) => library.overdueReport({ ...q, limit: 50 }),
  },
];

const catalogue = () => REPORTS.map(({ build: _b, ...meta }) => meta);

async function run({ params, query, res }: Ctx<{ params: typeof keyParams; query: typeof reportQuery }>) {
  const def = REPORTS.find((r) => r.key === params.key);
  if (!def) throw notFound('Report');
  return sendReport(res, await def.build(query), query.format);
}

const keyParams = z.object({ key: z.string().regex(/^[a-z-]+$/) });

const r = new ApiRouter('/reports', 'Reports');
r.get('/', { summary: 'List available reports and their filters' }, async () => catalogue());
r.get(
  '/:key',
  { summary: 'Run a report (format=json|xlsx|pdf)', schemas: { params: keyParams, query: reportQuery } },
  run,
);

export default r;
