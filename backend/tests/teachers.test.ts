import request from 'supertest';
import { ADMIN, SUPER, app, login, prisma, resetDb, seedBase, studentPayload, todayKigali } from './helpers';

let base: Awaited<ReturnType<typeof seedBase>>;
let math: number;
let english: number;

beforeEach(async () => {
  await resetDb();
  base = await seedBase({ allowWeekendAttendance: true });
  math = (await prisma.course.create({ data: { name: 'Mathematics', code: 'MATH' } })).id;
  english = (await prisma.course.create({ data: { name: 'English', code: 'ENG' } })).id;
});
afterAll(() => prisma.$disconnect());

const yy = () => todayKigali().slice(2, 4);

function teacherPayload(overrides: Record<string, unknown> = {}) {
  return {
    firstName: 'Alice',
    lastName: 'Uwase',
    email: 'alice.uwase@gmail.com',
    assignments: [{ courseId: math, classId: base.p1.id }],
    ...overrides,
  };
}

/** Creates a teacher as admin and activates the account; returns the reg number. */
async function createActiveTeacher(password = 'Teacher@123') {
  const admin = await login(ADMIN);
  const res = await admin.post('/api/v1/teachers').send(teacherPayload());
  const token = new URL(res.body.data.activation.link).searchParams.get('token');
  const regNumber = res.body.data.teacher.regNumber as string;
  await request(app)
    .post('/api/v1/auth/activate')
    .send({ token, regNumber, password, confirmPassword: password })
    .expect(200);
  return { regNumber, id: res.body.data.teacher.id as number, admin };
}

describe('Teachers', () => {
  it('admins and super admins add teachers with sequential registration numbers per post and year', async () => {
    const admin = await login(ADMIN);
    const a = await admin.post('/api/v1/teachers').send(teacherPayload());
    expect(a.status).toBe(201);
    expect(a.body.data.teacher).toMatchObject({
      regNumber: `${yy()}TR001`,
      role: 'TEACHER',
      status: 'PENDING',
    });
    expect(a.body.data.teacher.assignments[0]).toMatchObject({
      course: { code: 'MATH' },
      class: { id: base.p1.id },
    });
    expect(a.body.data.activation).toMatchObject({ sentTo: 'alice.uwase@gmail.com' });
    expect(JSON.stringify(a.body)).not.toMatch(/passwordHash/);

    const superAgent = await login(SUPER);
    const b = await superAgent
      .post('/api/v1/teachers')
      .send(teacherPayload({ email: 'bosco@gmail.com', assignments: [] }));
    expect(b.body.data.teacher.regNumber).toBe(`${yy()}TR002`);
    const c = await superAgent
      .post('/api/v1/teachers')
      .send(teacherPayload({ email: 'ta@gmail.com', post: 'TA' }));
    expect(c.body.data.teacher.regNumber).toBe(`${yy()}TA001`);
  });

  it('requires a Gmail address and valid courses/classes', async () => {
    const admin = await login(ADMIN);
    const notGmail = await admin.post('/api/v1/teachers').send(teacherPayload({ email: 'alice@yahoo.com' }));
    expect(notGmail.status).toBe(422);
    const badCourse = await admin
      .post('/api/v1/teachers')
      .send(teacherPayload({ assignments: [{ courseId: 9999, classId: base.p1.id }] }));
    expect(badCourse.status).toBe(400);
  });

  it('teacher activates with the emailed registration number, then signs in with it', async () => {
    const admin = await login(ADMIN);
    const res = await admin.post('/api/v1/teachers').send(teacherPayload());
    const token = new URL(res.body.data.activation.link).searchParams.get('token');
    const regNumber = res.body.data.teacher.regNumber;

    // Cannot sign in before activation.
    const early = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: regNumber, password: 'Whatever@1' });
    expect(early.status).toBe(403);
    expect((await request(app).get(`/api/v1/auth/activation?token=${token}`)).body.data.firstName).toBe(
      'Alice',
    );

    const wrongReg = await request(app)
      .post('/api/v1/auth/activate')
      .send({ token, regNumber: `${yy()}TR999`, password: 'Teacher@123', confirmPassword: 'Teacher@123' });
    expect(wrongReg.status).toBe(400);
    const mismatch = await request(app)
      .post('/api/v1/auth/activate')
      .send({ token, regNumber, password: 'Teacher@123', confirmPassword: 'Other@123' });
    expect(mismatch.status).toBe(422);

    await request(app)
      .post('/api/v1/auth/activate')
      .send({ token, regNumber, password: 'Teacher@123', confirmPassword: 'Teacher@123' })
      .expect(200);
    // The link is single-use.
    const reuse = await request(app)
      .post('/api/v1/auth/activate')
      .send({ token, regNumber, password: 'Teacher@456', confirmPassword: 'Teacher@456' });
    expect(reuse.status).toBe(400);

    // Registration number is case-insensitive at sign-in.
    const ok = await request(app)
      .post('/api/v1/auth/login')
      .send({ identifier: regNumber.toLowerCase(), password: 'Teacher@123' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.user).toMatchObject({ role: 'TEACHER', regNumber });
  });

  it('teachers only reach their own classes and cannot change their own password', async () => {
    const { regNumber } = await createActiveTeacher();
    const teacher = await login({ email: regNumber, password: 'Teacher@123' });

    for (const path of [
      '/api/v1/students',
      '/api/v1/dashboard',
      '/api/v1/teachers',
      '/api/v1/inventory/items',
      '/api/v1/users',
    ]) {
      expect((await teacher.get(path)).status).toBe(403);
    }
    expect(
      (
        await teacher
          .post('/api/v1/auth/change-password')
          .send({ currentPassword: 'Teacher@123', newPassword: 'Changed@123' })
      ).status,
    ).toBe(403);

    const classes = await teacher.get('/api/v1/classes');
    expect(classes.body.data.map((c: { id: number }) => c.id)).toEqual([base.p1.id]);

    const admin = await login(ADMIN);
    const kid = (await admin.post('/api/v1/students').send(studentPayload(base.p1.id))).body.data.id;
    const today = todayKigali();
    expect((await teacher.get(`/api/v1/attendance/sheet?classId=${base.p1.id}&date=${today}`)).status).toBe(
      200,
    );
    expect((await teacher.get(`/api/v1/attendance/sheet?classId=${base.top.id}&date=${today}`)).status).toBe(
      403,
    );
    const save = await teacher
      .post('/api/v1/attendance/sheet')
      .send({ classId: base.p1.id, date: today, records: [{ studentId: kid, status: 'PRESENT' }] });
    expect(save.status).toBe(200);

    const mine = await teacher.get('/api/v1/teachers/me');
    expect(mine.body.data.classes[0]).toMatchObject({
      id: base.p1.id,
      attendanceTakenToday: true,
      courses: [{ code: 'MATH' }],
    });
  });

  it('only administrators set a teacher password, which signs the teacher out', async () => {
    const { regNumber, id } = await createActiveTeacher();
    const teacher = await login({ email: regNumber, password: 'Teacher@123' });
    const admin = await login(ADMIN);

    const mismatch = await admin
      .post(`/api/v1/teachers/${id}/password`)
      .send({ newPassword: 'Newpass@123', confirmPassword: 'Nope@123' });
    expect(mismatch.status).toBe(422);
    await admin
      .post(`/api/v1/teachers/${id}/password`)
      .send({ newPassword: 'Newpass@123', confirmPassword: 'Newpass@123' })
      .expect(200);

    expect((await teacher.get('/api/v1/teachers/me')).status).toBe(401);
    expect(
      (await request(app).post('/api/v1/auth/login').send({ identifier: regNumber, password: 'Teacher@123' }))
        .status,
    ).toBe(401);
    expect(
      (await request(app).post('/api/v1/auth/login').send({ identifier: regNumber, password: 'Newpass@123' }))
        .status,
    ).toBe(200);
    // Teachers cannot change another teacher's password either.
    expect(
      (
        await teacher
          .post(`/api/v1/teachers/${id}/password`)
          .send({ newPassword: 'X@12345a', confirmPassword: 'X@12345a' })
      ).status,
    ).toBe(401);
  });

  it('keeps the session that changed the password signed in, and signs out the others', async () => {
    const other = await login(ADMIN);
    const admin = await login(ADMIN);
    await admin
      .post('/api/v1/auth/change-password')
      .send({ currentPassword: ADMIN.password, newPassword: 'Changed@123' })
      .expect(200);
    // Same second as the change: must still work for this session only.
    expect((await admin.get('/api/v1/auth/me')).status).toBe(200);
    expect((await other.get('/api/v1/auth/me')).status).toBe(401);
    await admin
      .post('/api/v1/auth/change-password')
      .send({ currentPassword: 'Changed@123', newPassword: ADMIN.password })
      .expect(200);
  });

  it('lets a teacher edit their own profile but nothing administrative', async () => {
    const { regNumber } = await createActiveTeacher();
    const teacher = await login({ email: regNumber, password: 'Teacher@123' });
    await teacher.patch('/api/v1/auth/profile').send({ phone: '0788000111' }).expect(200);
    expect((await teacher.put('/api/v1/auth/preferences').send({ widgets: [] })).status).toBe(403);
  });

  it('manages assignments and keeps teachers out of the staff Users list', async () => {
    const { id } = await createActiveTeacher();
    const admin = await login(ADMIN);
    const upd = await admin.put(`/api/v1/teachers/${id}/assignments`).send({
      assignments: [
        { courseId: english, classId: base.top.id },
        { courseId: english, classId: base.top.id },
      ],
    });
    expect(upd.body.data.assignments).toHaveLength(1);
    const superAgent = await login(SUPER);
    const users = await superAgent.get('/api/v1/users');
    expect(users.body.data.every((u: { role: string }) => u.role !== 'TEACHER')).toBe(true);
    expect((await superAgent.get(`/api/v1/users/${id}`)).status).toBe(404);
  });
});
