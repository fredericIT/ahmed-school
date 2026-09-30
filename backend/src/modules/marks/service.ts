import type { Request } from 'express';
import type { Assessment, AssessmentType, Mark, Prisma } from '@prisma/client';
import type { z } from 'zod';
import { prisma } from '../../config/prisma';
import type { AuthUser } from '../../types/express';
import { audit, diff } from '../../utils/audit';
import { fmtDate, toDateOnly } from '../../utils/dates';
import { badRequest, forbidden, notFound } from '../../utils/errors';
import type { Report } from '../../utils/export';
import { GRADE_ORDER } from '../../utils/grades';
import type * as s from './schema';
import { formatDate, formatPercent, t } from '../../i18n';

// ─── Grading ───

export const PASS_MARK = 50;
export const GRADE_SCALE = [
  {
    min: 80,
    grade: 'A',
    get remark() {
      return t('Grade remark|Excellent');
    },
  },
  {
    min: 70,
    grade: 'B',
    get remark() {
      return t('Grade remark|Very good');
    },
  },
  {
    min: 60,
    grade: 'C',
    get remark() {
      return t('Grade remark|Good');
    },
  },
  {
    min: 50,
    grade: 'D',
    get remark() {
      return t('Grade remark|Fair');
    },
  },
  {
    min: 0,
    grade: 'E',
    get remark() {
      return t('Grade remark|Needs improvement');
    },
  },
] as const;

export function gradeFor(pct: number | null) {
  if (pct === null) return null;
  return GRADE_SCALE.find((g) => pct >= g.min) ?? GRADE_SCALE[GRADE_SCALE.length - 1];
}

const round = (n: number, digits = 1) => Math.round(n * 10 ** digits) / 10 ** digits;
const num = (n: number) => String(round(n, 2));

export const TYPE_LABELS: Record<AssessmentType, string> = {
  get CLASSWORK() {
    return t('Classwork');
  },
  get HOMEWORK() {
    return t('Homework');
  },
  get QUIZ() {
    return t('Quiz');
  },
  get TEST() {
    return t('Test');
  },
  get PROJECT() {
    return t('Project');
  },
  get EXAM() {
    return t('Exam');
  },
};

// ─── Access and context ───

/** Administrators may mark any class; teachers only the course/class pairs they are assigned to. */
async function assertCanTeach(user: AuthUser, classId: number, courseId: number) {
  if (user.role !== 'TEACHER') return;
  const assigned = await prisma.teacherAssignment.findFirst({
    where: { teacherId: user.id, classId, courseId },
  });
  if (!assigned) throw forbidden('You do not teach this course in this class');
}

async function loadTerm(termId: number) {
  const term = await prisma.term.findFirst({
    where: { id: termId, deletedAt: null },
    include: { academicYear: { select: { id: true, name: true, isCurrent: true } } },
  });
  if (!term) throw notFound('Term');
  return term;
}
type TermCtx = Awaited<ReturnType<typeof loadTerm>>;

async function loadClass(classId: number) {
  const cls = await prisma.class.findFirst({ where: { id: classId, deletedAt: null } });
  if (!cls) throw notFound('Class');
  return cls;
}

async function loadCourse(courseId: number, classLevel: string) {
  const course = await prisma.course.findFirst({ where: { id: courseId, deletedAt: null } });
  if (!course) throw notFound('Course');
  if (course.level && course.level !== classLevel)
    throw badRequest('This course is not taught at this class level');
  return course;
}

/**
 * Pupils marked in a class for a term: the class's active pupils during the current year,
 * plus anyone who already has a mark there (pupils who moved or left keep their results).
 */
async function roster(classId: number, term: TermCtx) {
  return prisma.student.findMany({
    where: {
      deletedAt: null,
      OR: [
        ...(term.academicYear.isCurrent
          ? [{ currentClassId: classId, status: 'ACTIVE' as const } satisfies Prisma.StudentWhereInput]
          : []),
        { marks: { some: { assessment: { classId, termId: term.id, deletedAt: null } } } },
      ],
    },
    select: { id: true, admissionNumber: true, firstName: true, lastName: true, gender: true, photo: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });
}
type RosterStudent = Awaited<ReturnType<typeof roster>>[number];

const fullName = (st: { firstName: string; lastName: string }) => `${st.firstName} ${st.lastName}`;

function assertDateInTerm(date: string, term: TermCtx) {
  if (date < fmtDate(term.startDate) || date > fmtDate(term.endDate))
    throw badRequest(
      t('The date must fall within {term} ({from} to {to})', {
        term: term.name,
        from: formatDate(term.startDate),
        to: formatDate(term.endDate),
      }),
    );
}

// ─── Options ───

/** Terms plus the class/course pairs the user can mark (a teacher's assignments, or everything for administrators). */
export async function options(user: AuthUser) {
  const terms = await prisma.term.findMany({
    where: { deletedAt: null, academicYear: { deletedAt: null } },
    include: { academicYear: { select: { name: true, isCurrent: true } } },
    orderBy: { startDate: 'desc' },
  });

  let pairs: {
    classId: number;
    className: string;
    grade: string;
    courseId: number;
    courseName: string;
    courseCode: string;
  }[];
  if (user.role === 'TEACHER') {
    const rows = await prisma.teacherAssignment.findMany({
      where: { teacherId: user.id, class: { deletedAt: null }, course: { deletedAt: null } },
      include: { class: true, course: true },
    });
    pairs = rows.map((a) => ({
      classId: a.classId,
      className: a.class.name,
      grade: a.class.grade,
      courseId: a.courseId,
      courseName: a.course.name,
      courseCode: a.course.code,
    }));
  } else {
    const [classes, courses] = await Promise.all([
      prisma.class.findMany({ where: { deletedAt: null } }),
      prisma.course.findMany({ where: { deletedAt: null } }),
    ]);
    pairs = classes.flatMap((c) =>
      courses
        .filter((co) => !co.level || co.level === c.level)
        .map((co) => ({
          classId: c.id,
          className: c.name,
          grade: c.grade,
          courseId: co.id,
          courseName: co.name,
          courseCode: co.code,
        })),
    );
  }
  pairs.sort(
    (a, b) =>
      GRADE_ORDER.indexOf(a.grade as never) - GRADE_ORDER.indexOf(b.grade as never) ||
      a.className.localeCompare(b.className) ||
      a.courseName.localeCompare(b.courseName),
  );

  return {
    terms: terms.map((term) => ({
      id: term.id,
      name: term.name,
      yearName: term.academicYear.name,
      isCurrent: term.isCurrent,
      startDate: fmtDate(term.startDate),
      endDate: fmtDate(term.endDate),
    })),
    currentTermId: (terms.find((term) => term.isCurrent) ?? terms[0])?.id ?? null,
    pairs: pairs.map(({ grade: _grade, ...p }) => p),
    typeLabels: TYPE_LABELS,
    gradeScale: GRADE_SCALE,
    passMark: PASS_MARK,
  };
}

// ─── Assessments ───

function presentAssessment(a: Assessment & { marks: Pick<Mark, 'score' | 'absent'>[] }, rosterSize: number) {
  const scored = a.marks.filter((m) => m.score !== null && !m.absent);
  const average = scored.length
    ? round((scored.reduce((sum, m) => sum + (m.score ?? 0), 0) / scored.length / a.maxScore) * 100)
    : null;
  const { marks: _marks, ...rest } = a;
  return {
    ...rest,
    date: fmtDate(a.date),
    markedCount: a.marks.filter((m) => m.score !== null || m.absent).length,
    rosterSize,
    averagePct: average,
  };
}

export async function listAssessments(user: AuthUser, q: z.infer<typeof s.assessmentsQuery>) {
  await assertCanTeach(user, q.classId, q.courseId);
  const [term, cls] = await Promise.all([loadTerm(q.termId), loadClass(q.classId)]);
  await loadCourse(q.courseId, cls.level);
  const [assessments, pupils] = await Promise.all([
    prisma.assessment.findMany({
      where: { termId: q.termId, classId: q.classId, courseId: q.courseId, deletedAt: null },
      include: { marks: { select: { score: true, absent: true } } },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
    }),
    roster(q.classId, term),
  ]);
  return assessments.map((a) => presentAssessment(a, pupils.length));
}

export async function createAssessment(user: AuthUser, data: z.infer<typeof s.assessmentBody>, req: Request) {
  await assertCanTeach(user, data.classId, data.courseId);
  const [term, cls] = await Promise.all([loadTerm(data.termId), loadClass(data.classId)]);
  await loadCourse(data.courseId, cls.level);
  assertDateInTerm(data.date, term);
  const a = await prisma.assessment.create({
    data: { ...data, maxScore: round(data.maxScore, 2), date: toDateOnly(data.date), createdById: user.id },
  });
  await audit(req, { action: 'CREATE', entity: 'Assessment', entityId: a.id, newValues: a });
  return presentAssessment({ ...a, marks: [] }, 0);
}

async function getRow(id: number) {
  const a = await prisma.assessment.findFirst({
    where: { id, deletedAt: null },
    include: {
      class: true,
      course: true,
      term: { include: { academicYear: { select: { id: true, name: true, isCurrent: true } } } },
    },
  });
  if (!a) throw notFound('Assessment');
  return a;
}

export async function getAssessment(user: AuthUser, id: number) {
  const a = await getRow(id);
  await assertCanTeach(user, a.classId, a.courseId);
  const [pupils, marks] = await Promise.all([
    roster(a.classId, a.term),
    prisma.mark.findMany({ where: { assessmentId: id } }),
  ]);
  const byStudent = new Map(marks.map((m) => [m.studentId, m]));
  return {
    ...presentAssessment({ ...a, marks }, pupils.length),
    className: a.class.name,
    courseName: a.course.name,
    termName: `${a.term.name} ${a.term.academicYear.name}`,
    students: pupils.map((st) => {
      const m = byStudent.get(st.id);
      return { ...st, mark: m ? { score: m.score, absent: m.absent, remark: m.remark } : null };
    }),
  };
}

export async function updateAssessment(
  user: AuthUser,
  id: number,
  data: z.infer<typeof s.assessmentUpdateBody>,
  req: Request,
) {
  const before = await getRow(id);
  await assertCanTeach(user, before.classId, before.courseId);
  if (data.date) assertDateInTerm(data.date, before.term);
  if (data.maxScore !== undefined) {
    const top = await prisma.mark.aggregate({ where: { assessmentId: id }, _max: { score: true } });
    if ((top._max.score ?? 0) > data.maxScore)
      throw badRequest(
        t('A pupil already has {score}; the maximum cannot be lower than that', {
          score: Number(top._max.score),
        }),
      );
  }
  const { class: _c, course: _co, term: _t, ...plain } = before;
  const after = await prisma.assessment.update({
    where: { id },
    data: {
      ...data,
      ...(data.maxScore !== undefined && { maxScore: round(data.maxScore, 2) }),
      ...(data.date && { date: toDateOnly(data.date) }),
    },
  });
  await audit(req, { action: 'UPDATE', entity: 'Assessment', entityId: id, ...diff(plain, after) });
  return presentAssessment({ ...after, marks: [] }, 0);
}

export async function deleteAssessment(user: AuthUser, id: number, req: Request) {
  const before = await getRow(id);
  await assertCanTeach(user, before.classId, before.courseId);
  await prisma.assessment.update({ where: { id }, data: { deletedAt: new Date() } });
  const { class: _c, course: _co, term: _t, ...plain } = before;
  await audit(req, { action: 'DELETE', entity: 'Assessment', entityId: id, oldValues: plain });
  return { deleted: true };
}

// ─── Marks entry ───

export async function saveMarks(user: AuthUser, id: number, body: z.infer<typeof s.marksBody>, req: Request) {
  const a = await getRow(id);
  await assertCanTeach(user, a.classId, a.courseId);
  const pupils = new Set((await roster(a.classId, a.term)).map((st) => st.id));

  const problems: { studentId: number; message: string }[] = [];
  for (const m of body.marks) {
    if (!pupils.has(m.studentId))
      problems.push({ studentId: m.studentId, message: t('Not a pupil of this class') });
    else if (m.score !== null && !m.absent && m.score > a.maxScore)
      problems.push({
        studentId: m.studentId,
        message: t('Above the maximum of {max}', { max: Number(a.maxScore) }),
      });
  }
  if (problems.length) throw badRequest('Some marks are invalid', problems);

  const existing = new Map(
    (await prisma.mark.findMany({ where: { assessmentId: id } })).map((m) => [m.studentId, m]),
  );
  const changes: { studentId: number; before: unknown; after: unknown }[] = [];
  let saved = 0;
  let cleared = 0;

  await prisma.$transaction(async (tx) => {
    for (const m of body.marks) {
      const score = m.absent || m.score === null ? null : round(m.score, 2);
      const remark = m.remark || null;
      const prev = existing.get(m.studentId);
      const prevValue = prev ? { score: prev.score, absent: prev.absent, remark: prev.remark } : null;

      if (score === null && !m.absent && !remark) {
        if (prev) {
          await tx.mark.delete({ where: { id: prev.id } });
          changes.push({ studentId: m.studentId, before: prevValue, after: null });
          cleared++;
        }
        continue;
      }
      const next = { score, absent: m.absent, remark };
      if (prev && prev.score === score && prev.absent === m.absent && prev.remark === remark) continue;
      await tx.mark.upsert({
        where: { assessmentId_studentId: { assessmentId: id, studentId: m.studentId } },
        create: { assessmentId: id, studentId: m.studentId, ...next, recordedById: user.id },
        update: { ...next, recordedById: user.id },
      });
      changes.push({ studentId: m.studentId, before: prevValue, after: next });
      saved++;
    }
    if (changes.length)
      await audit(
        req,
        {
          action: 'UPDATE',
          entity: 'Marks',
          entityId: id,
          oldValues: Object.fromEntries(changes.map((c) => [c.studentId, c.before])),
          newValues: Object.fromEntries(changes.map((c) => [c.studentId, c.after])),
        },
        tx,
      );
  });
  return { saved, cleared };
}

// ─── Results ───

interface Tally {
  obtained: number;
  possible: number;
  caObtained: number;
  caPossible: number;
  examObtained: number;
  examPossible: number;
}
const emptyTally = (): Tally => ({
  obtained: 0,
  possible: 0,
  caObtained: 0,
  caPossible: 0,
  examObtained: 0,
  examPossible: 0,
});
export const pctOf = (tally: Tally | undefined) =>
  tally && tally.possible > 0 ? round((tally.obtained / tally.possible) * 100) : null;

type AssessmentWithMarks = Assessment & { marks: Mark[] };

/**
 * Every marked assessment counts: a course result is total obtained ÷ total possible.
 * Blank marks (not entered yet) and excused absences are left out of that pupil's total.
 */
function tally(assessments: AssessmentWithMarks[]) {
  const out = new Map<number, Map<number, Tally>>(); // studentId → courseId → tally
  for (const a of assessments) {
    for (const m of a.marks) {
      if (m.absent || m.score === null) continue;
      const perCourse = out.get(m.studentId) ?? new Map<number, Tally>();
      const tally = perCourse.get(a.courseId) ?? emptyTally();
      tally.obtained += m.score;
      tally.possible += a.maxScore;
      if (a.type === 'EXAM') {
        tally.examObtained += m.score;
        tally.examPossible += a.maxScore;
      } else {
        tally.caObtained += m.score;
        tally.caPossible += a.maxScore;
      }
      perCourse.set(a.courseId, tally);
      out.set(m.studentId, perCourse);
    }
  }
  return out;
}

function withPositions<T extends { average: number | null }>(rows: T[]): (T & { position: number | null })[] {
  const ranked = rows
    .filter((r) => r.average !== null)
    .map((r) => r.average as number)
    .sort((a, b) => b - a);
  // Equal averages share a position (1, 2, 2, 4…).
  return rows.map((r) => ({ ...r, position: r.average === null ? null : ranked.indexOf(r.average) + 1 }));
}

function summarize(values: (number | null)[]) {
  const v = values.filter((x): x is number => x !== null);
  return {
    average: v.length ? round(v.reduce((a, b) => a + b, 0) / v.length) : null,
    passRate: v.length ? round((v.filter((x) => x >= PASS_MARK).length / v.length) * 100) : null,
  };
}

export async function courseResults(
  user: AuthUser,
  q: z.infer<typeof s.courseResultsQuery>,
): Promise<Report> {
  await assertCanTeach(user, q.classId, q.courseId);
  const [term, cls] = await Promise.all([loadTerm(q.termId), loadClass(q.classId)]);
  const course = await loadCourse(q.courseId, cls.level);
  const [assessments, pupils] = await Promise.all([
    prisma.assessment.findMany({
      where: { termId: q.termId, classId: q.classId, courseId: q.courseId, deletedAt: null },
      include: { marks: true },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
    }),
    roster(q.classId, term),
  ]);
  const tallies = tally(assessments);
  const rows = pupils.map((st) => {
    const tally = tallies.get(st.id)?.get(course.id);
    const pct = pctOf(tally);
    const row: Record<string, unknown> = {
      student: fullName(st),
      admissionNumber: st.admissionNumber,
      total: tally ? `${num(tally.obtained)} / ${num(tally.possible)}` : '',
      pct,
      grade: gradeFor(pct)?.grade ?? '',
    };
    for (const a of assessments) {
      const m = a.marks.find((x) => x.studentId === st.id);
      row[`a${a.id}`] = !m ? '' : m.absent ? 'ABS' : m.score === null ? '' : num(m.score);
    }
    return row;
  });
  const stats = summarize(rows.map((r) => r.pct as number | null));
  return {
    title: `${course.name} results · ${cls.name}`,
    subtitle: `${term.name} ${term.academicYear.name}`,
    columns: [
      { key: 'student', header: t('Pupil'), width: 3 },
      { key: 'admissionNumber', header: t('Adm. no'), width: 2 },
      ...assessments.map((a) => ({
        key: `a${a.id}`,
        header: `${a.title} (/${num(a.maxScore)})`,
        width: 1.5,
      })),
      { key: 'total', header: t('Total'), width: 1.6 },
      { key: 'pct', header: '%', format: 'score' as const, width: 1.2 },
      { key: 'grade', header: t('Grade'), width: 1 },
    ],
    rows,
    summary: [
      { label: t('Assessments'), value: assessments.length },
      { label: t('Class average'), value: stats.average === null ? '—' : formatPercent(stats.average) },
      {
        label: t('Pass rate (≥ {percent})', { percent: formatPercent(PASS_MARK) }),
        value: stats.passRate === null ? '—' : formatPercent(stats.passRate),
      },
    ],
  };
}

/** Per-pupil results for every course of a class in a term, with average and position. */
export async function classSheet(termId: number, classId: number) {
  const [term, cls] = await Promise.all([loadTerm(termId), loadClass(classId)]);
  const [assessments, pupils] = await Promise.all([
    prisma.assessment.findMany({
      where: { termId, classId, deletedAt: null, course: { deletedAt: null } },
      include: { marks: true, course: true },
    }),
    roster(classId, term),
  ]);
  const courses = [...new Map(assessments.map((a) => [a.courseId, a.course])).values()].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const tallies = tally(assessments);
  const students = withPositions(
    pupils.map((st: RosterStudent) => {
      const perCourse = tallies.get(st.id) ?? new Map<number, Tally>();
      const pcts = courses.map((c) => pctOf(perCourse.get(c.id))).filter((x): x is number => x !== null);
      const average = pcts.length ? round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
      return { student: st, perCourse, average };
    }),
  );
  return { term, cls, courses, students };
}

export async function classResults(q: z.infer<typeof s.classResultsQuery>): Promise<Report> {
  const { term, cls, courses, students } = await classSheet(q.termId, q.classId);
  const rows = students.map((r) => {
    const row: Record<string, unknown> = {
      studentId: r.student.id,
      student: fullName(r.student),
      admissionNumber: r.student.admissionNumber,
      average: r.average,
      grade: gradeFor(r.average)?.grade ?? '',
      position:
        r.position === null ? '' : `${r.position} / ${students.filter((x) => x.position !== null).length}`,
    };
    for (const c of courses) row[`c${c.id}`] = pctOf(r.perCourse.get(c.id));
    return row;
  });
  const stats = summarize(students.map((r) => r.average));
  return {
    title: t('Class results · {className}', { className: cls.name }),
    subtitle: `${term.name} ${term.academicYear.name}`,
    columns: [
      { key: 'student', header: t('Pupil'), width: 3 },
      { key: 'admissionNumber', header: t('Adm. no'), width: 2 },
      ...courses.map((c) => ({ key: `c${c.id}`, header: c.name, format: 'score' as const, width: 1.4 })),
      { key: 'average', header: t('Average'), format: 'score' as const, width: 1.3 },
      { key: 'grade', header: t('Grade'), width: 1 },
      { key: 'position', header: t('Position'), width: 1.3 },
    ],
    rows,
    summary: [
      { label: t('Pupils'), value: students.length },
      { label: t('Courses with marks'), value: courses.length },
      { label: t('Class average'), value: stats.average === null ? '—' : formatPercent(stats.average) },
      {
        label: t('Pass rate (≥ {percent})', { percent: formatPercent(PASS_MARK) }),
        value: stats.passRate === null ? '—' : formatPercent(stats.passRate),
      },
    ],
  };
}

/** School-wide marks summary for a term (current term by default), for the Marks overview on the dashboard. */
export async function overview(termId?: number) {
  const term = termId
    ? await loadTerm(termId)
    : await prisma.term.findFirst({
        where: { deletedAt: null, isCurrent: true },
        include: { academicYear: { select: { id: true, name: true, isCurrent: true } } },
      });
  if (!term) return { term: null, totals: null, classes: [], recent: [] };

  const classes = await prisma.class.findMany({ where: { deletedAt: null } });
  classes.sort(
    (a, b) => GRADE_ORDER.indexOf(a.grade) - GRADE_ORDER.indexOf(b.grade) || a.name.localeCompare(b.name),
  );

  const perClass = [];
  const allAverages: (number | null)[] = [];
  for (const c of classes) {
    const sheet = await classSheet(term.id, c.id);
    if (!sheet.students.length) continue;
    const averages = sheet.students.map((st) => st.average);
    allAverages.push(...averages);
    const stats = summarize(averages);
    perClass.push({
      classId: c.id,
      name: c.name,
      pupils: sheet.students.length,
      courses: sheet.courses.length,
      average: stats.average,
      passRate: stats.passRate,
      belowPass: averages.filter((a) => a !== null && a < PASS_MARK).length,
    });
  }

  const [assessments, marksEntered, recentRows] = await Promise.all([
    prisma.assessment.count({ where: { termId: term.id, deletedAt: null } }),
    prisma.mark.count({ where: { assessment: { termId: term.id, deletedAt: null } } }),
    prisma.assessment.findMany({
      where: { termId: term.id, deletedAt: null },
      include: { class: true, course: true, marks: { select: { score: true, absent: true } } },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      take: 6,
    }),
  ]);
  const rosterSizes = new Map(perClass.map((c) => [c.classId, c.pupils]));
  const stats = summarize(allAverages);

  return {
    term: { id: term.id, name: term.name, yearName: term.academicYear.name },
    totals: {
      assessments,
      marksEntered,
      average: stats.average,
      passRate: stats.passRate,
      belowPass: allAverages.filter((a) => a !== null && a < PASS_MARK).length,
    },
    classes: perClass,
    recent: recentRows.map(({ class: cls, course, ...a }) => ({
      ...presentAssessment(a, rosterSizes.get(a.classId) ?? 0),
      className: cls.name,
      courseName: course.name,
    })),
  };
}
