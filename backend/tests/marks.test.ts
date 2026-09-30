import bcrypt from 'bcryptjs';
import { ADMIN, SUPER, login, prisma, resetDb, seedBase, studentPayload } from './helpers';

let base: Awaited<ReturnType<typeof seedBase>>;
let math: number;
let english: number;
let pupils: { id: number; firstName: string }[];

beforeEach(async () => {
  await resetDb();
  base = await seedBase();
  math = (await prisma.course.create({ data: { name: 'Mathematics', code: 'MATH' } })).id;
  english = (await prisma.course.create({ data: { name: 'English', code: 'ENG' } })).id;
  const admin = await login(ADMIN);
  pupils = [];
  for (const firstName of ['Aline', 'Bruno', 'Cedric']) {
    const res = await admin.post('/api/v1/students').send(studentPayload(base.p1.id, { firstName }));
    pupils.push({ id: res.body.data.id, firstName });
  }
});
afterAll(() => prisma.$disconnect());

/** An activated teacher who teaches Mathematics in P1 A. */
async function mathTeacher() {
  const t = await prisma.user.create({
    data: {
      firstName: 'Alice',
      lastName: 'Uwase',
      email: 'alice.uwase@gmail.com',
      role: 'TEACHER',
      post: 'TR',
      regNumber: '26TR901',
      passwordHash: await bcrypt.hash('Teacher@123', 4),
      activatedAt: new Date(),
    },
  });
  await prisma.teacherAssignment.create({ data: { teacherId: t.id, courseId: math, classId: base.p1.id } });
  return login({ email: '26TR901', password: 'Teacher@123' });
}

const assessment = (overrides: Record<string, unknown> = {}) => ({
  termId: base.term.id,
  classId: base.p1.id,
  courseId: math,
  title: 'Addition test',
  type: 'TEST',
  date: '2026-09-20',
  maxScore: 20,
  ...overrides,
});

const [A, B, C] = [0, 1, 2];

describe('Marks', () => {
  it('teachers record marks only for the course and class they teach', async () => {
    const teacher = await mathTeacher();
    const opts = await teacher.get('/api/v1/marks/options').expect(200);
    expect(opts.body.data.pairs).toEqual([
      expect.objectContaining({ classId: base.p1.id, courseId: math, courseName: 'Mathematics' }),
    ]);
    expect(opts.body.data.currentTermId).toBe(base.term.id);

    const created = await teacher.post('/api/v1/marks/assessments').send(assessment()).expect(201);
    expect(created.body.data).toMatchObject({ title: 'Addition test', maxScore: 20, date: '2026-09-20' });

    expect(
      (await teacher.post('/api/v1/marks/assessments').send(assessment({ courseId: english }))).status,
    ).toBe(403);
    expect(
      (await teacher.post('/api/v1/marks/assessments').send(assessment({ classId: base.top.id }))).status,
    ).toBe(403);
    const query = { termId: base.term.id, classId: base.p1.id };
    expect((await teacher.get('/api/v1/marks/class-results').query(query)).status).toBe(403);
    expect((await teacher.get('/api/v1/marks/report-cards').query(query)).status).toBe(403);
    expect(
      (await teacher.get('/api/v1/marks/course-results').query({ ...query, courseId: english })).status,
    ).toBe(403);

    // The roster is the class's pupils.
    const sheet = await teacher.get(`/api/v1/marks/assessments/${created.body.data.id}`).expect(200);
    expect(sheet.body.data.students.map((s: { firstName: string }) => s.firstName)).toEqual([
      'Aline',
      'Bruno',
      'Cedric',
    ]);
  });

  it('validates marks against the maximum, the roster and the term', async () => {
    const teacher = await mathTeacher();
    const { id } = (await teacher.post('/api/v1/marks/assessments').send(assessment())).body.data;

    const tooHigh = await teacher
      .put(`/api/v1/marks/assessments/${id}/marks`)
      .send({ marks: [{ studentId: pupils[A].id, score: 21 }] });
    expect(tooHigh.status).toBe(400);
    expect(tooHigh.body.error.details[0]).toMatchObject({ studentId: pupils[A].id });

    const outsider = await prisma.student.create({
      data: {
        admissionNumber: 'X-1',
        firstName: 'Other',
        lastName: 'Pupil',
        gender: 'MALE',
        dateOfBirth: new Date('2021-01-01'),
        admissionDate: new Date('2026-01-10'),
        currentClassId: base.top.id,
      },
    });
    const wrongClass = await teacher
      .put(`/api/v1/marks/assessments/${id}/marks`)
      .send({ marks: [{ studentId: outsider.id, score: 5 }] });
    expect(wrongClass.status).toBe(400);

    expect(
      (await teacher.post('/api/v1/marks/assessments').send(assessment({ date: '2019-05-01' }))).status,
    ).toBe(400);

    const ok = await teacher.put(`/api/v1/marks/assessments/${id}/marks`).send({
      marks: [
        { studentId: pupils[A].id, score: 18 },
        { studentId: pupils[B].id, score: null, absent: true },
      ],
    });
    expect(ok.body.data).toEqual({ saved: 2, cleared: 0 });
    // The maximum cannot drop below a mark already given.
    expect((await teacher.patch(`/api/v1/marks/assessments/${id}`).send({ maxScore: 10 })).status).toBe(400);

    const cleared = await teacher
      .put(`/api/v1/marks/assessments/${id}/marks`)
      .send({ marks: [{ studentId: pupils[A].id, score: null }] });
    expect(cleared.body.data).toEqual({ saved: 0, cleared: 1 });
    const list = await teacher
      .get('/api/v1/marks/assessments')
      .query({ termId: base.term.id, classId: base.p1.id, courseId: math });
    expect(list.body.data[0]).toMatchObject({ markedCount: 1, rosterSize: 3 });
    expect(await prisma.auditLog.count({ where: { entity: 'Marks' } })).toBe(2);
  });

  it('computes course and class results, positions and report cards', async () => {
    const teacher = await mathTeacher();
    const admin = await login(ADMIN);
    const test = (await teacher.post('/api/v1/marks/assessments').send(assessment())).body.data.id;
    const exam = (
      await teacher
        .post('/api/v1/marks/assessments')
        .send(assessment({ title: 'Term exam', type: 'EXAM', maxScore: 50, date: '2026-10-01' }))
    ).body.data.id;
    await teacher.put(`/api/v1/marks/assessments/${test}/marks`).send({
      marks: [
        { studentId: pupils[A].id, score: 15 },
        { studentId: pupils[B].id, score: 10 },
        { studentId: pupils[C].id, score: 8 },
      ],
    });
    await teacher.put(`/api/v1/marks/assessments/${exam}/marks`).send({
      marks: [
        { studentId: pupils[A].id, score: 40 },
        // Excused: the exam is left out of Bruno's total.
        { studentId: pupils[B].id, score: null, absent: true },
        { studentId: pupils[C].id, score: 20 },
      ],
    });

    const course = await teacher
      .get('/api/v1/marks/course-results')
      .query({ termId: base.term.id, classId: base.p1.id, courseId: math })
      .expect(200);
    const byName = (rows: Record<string, unknown>[], name: string) =>
      rows.find((r) => String(r.student).startsWith(name)) as Record<string, unknown>;
    expect(byName(course.body.data.rows, 'Aline')).toMatchObject({ total: '55 / 70', pct: 78.6, grade: 'B' });
    expect(byName(course.body.data.rows, 'Bruno')).toMatchObject({ total: '10 / 20', pct: 50, grade: 'D' });
    expect(byName(course.body.data.rows, 'Bruno')[`a${exam}`]).toBe('ABS');

    // An administrator also enters English marks.
    const eng = (
      await admin.post('/api/v1/marks/assessments').send(assessment({ courseId: english, title: 'Reading' }))
    ).body.data.id;
    await admin.put(`/api/v1/marks/assessments/${eng}/marks`).send({
      marks: [
        { studentId: pupils[A].id, score: 20 },
        { studentId: pupils[B].id, score: 12 },
        { studentId: pupils[C].id, score: 14 },
      ],
    });

    const cls = await admin
      .get('/api/v1/marks/class-results')
      .query({ termId: base.term.id, classId: base.p1.id })
      .expect(200);
    const rows = cls.body.data.rows as Record<string, unknown>[];
    // Averages are the mean of course percentages: Aline (78.6 + 100) / 2, Bruno (50 + 60) / 2, Cedric (40 + 70) / 2.
    expect(byName(rows, 'Aline')).toMatchObject({ average: 89.3, grade: 'A', position: '1 / 3' });
    expect(byName(rows, 'Bruno')).toMatchObject({ average: 55, position: '2 / 3' });
    expect(byName(rows, 'Cedric')).toMatchObject({ average: 55, position: '2 / 3' });

    const pdf = await admin
      .get('/api/v1/marks/report-cards')
      .query({ termId: base.term.id, classId: base.p1.id })
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');

    const superAgent = await login(SUPER);
    const one = await superAgent
      .get('/api/v1/marks/report-cards')
      .query({ termId: base.term.id, classId: base.p1.id, studentId: pupils[A].id });
    expect(one.status).toBe(200);
    expect(one.headers['content-disposition']).toMatch(/report-card-/);

    const xlsx = await admin
      .get('/api/v1/marks/class-results')
      .query({ termId: base.term.id, classId: base.p1.id, format: 'xlsx' });
    expect(xlsx.status).toBe(200);
    expect(xlsx.headers['content-type']).toMatch(/spreadsheetml/);

    // The dashboard overview summarises the term per class; teachers cannot see it.
    const overview = await admin.get('/api/v1/marks/overview').expect(200);
    expect(overview.body.data.term).toMatchObject({ id: base.term.id });
    expect(overview.body.data.totals).toMatchObject({ assessments: 3, marksEntered: 9, belowPass: 0 });
    expect(overview.body.data.classes).toEqual([
      expect.objectContaining({ classId: base.p1.id, pupils: 3, courses: 2, average: 66.4, passRate: 100 }),
    ]);
    expect(overview.body.data.recent[0]).toMatchObject({ className: 'P1 A', markedCount: 3 });
    expect((await teacher.get('/api/v1/marks/overview')).status).toBe(403);

    // Deleted assessments drop out of results.
    await teacher.delete(`/api/v1/marks/assessments/${exam}`).expect(200);
    const after = await teacher
      .get('/api/v1/marks/course-results')
      .query({ termId: base.term.id, classId: base.p1.id, courseId: math });
    expect(byName(after.body.data.rows, 'Aline')).toMatchObject({ total: '15 / 20', pct: 75 });
  });
});
