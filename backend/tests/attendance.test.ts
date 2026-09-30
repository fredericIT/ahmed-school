import { ADMIN, login, prisma, resetDb, seedBase, studentPayload, todayKigali } from './helpers';
import { invalidateSettings } from '../src/utils/settings';

let base: Awaited<ReturnType<typeof seedBase>>;
let ids: number[];
let agent: Awaited<ReturnType<typeof login>>;

beforeEach(async () => {
  await resetDb();
  base = await seedBase({ allowWeekendAttendance: true });
  agent = await login(ADMIN);
  ids = [];
  for (const n of ['Keza', 'Ganza', 'Teta'])
    ids.push(
      (await agent.post('/api/v1/students').send(studentPayload(base.top.id, { firstName: n }))).body.data.id,
    );
});
afterAll(() => prisma.$disconnect());

const sheet = (date: string, statuses: string[]) => ({
  classId: base.top.id,
  date,
  records: ids.map((studentId, i) => ({ studentId, status: statuses[i] ?? 'PRESENT' })),
});

describe('Attendance', () => {
  it('returns a roster and saves a daily sheet', async () => {
    const today = todayKigali();
    const roster = await agent.get(`/api/v1/attendance/sheet?classId=${base.top.id}&date=${today}`);
    expect(roster.body.data.rows).toHaveLength(3);
    expect(roster.body.data.taken).toBe(false);

    const save = await agent
      .post('/api/v1/attendance/sheet')
      .send(sheet(today, ['PRESENT', 'ABSENT', 'LATE']));
    expect(save.status).toBe(200);
    expect(save.body.data).toMatchObject({ created: 3, updated: 0 });

    const after = await agent.get(`/api/v1/attendance/sheet?classId=${base.top.id}&date=${today}`);
    expect(after.body.data.summary).toMatchObject({ PRESENT: 1, ABSENT: 1, LATE: 1, recorded: 3 });
    expect(after.body.data.summary.rate).toBeCloseTo(66.7, 1);
    const rec = await prisma.attendance.findFirstOrThrow({ where: { studentId: ids[0] } });
    expect(rec.termId).toBe(base.term.id);
  });

  it('rejects future dates', async () => {
    const res = await agent.post('/api/v1/attendance/sheet').send(sheet('2099-01-05', []));
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/future/);
  });

  it('rejects weekends and holidays when configured', async () => {
    await prisma.schoolSettings.updateMany({ data: { allowWeekendAttendance: false } });
    invalidateSettings();
    const weekend = await agent.post('/api/v1/attendance/sheet').send(sheet('2024-06-01', [])); // Saturday
    expect(weekend.status).toBe(400);
    await prisma.holiday.create({ data: { name: 'Heroes Day', date: new Date('2024-02-01') } });
    const holiday = await agent.post('/api/v1/attendance/sheet').send(sheet('2024-02-01', []));
    expect(holiday.status).toBe(400);
    expect(holiday.body.error.message).toMatch(/Heroes Day/);
  });

  it('edits are upserts (one record per student per day) and are audit-logged with before/after', async () => {
    const day = '2024-06-03';
    await agent
      .post('/api/v1/attendance/sheet')
      .send(sheet(day, ['PRESENT', 'PRESENT', 'PRESENT']))
      .expect(200);
    const edit = await agent
      .post('/api/v1/attendance/sheet')
      .send(sheet(day, ['PRESENT', 'SICK', 'PRESENT']));
    expect(edit.body.data).toMatchObject({ created: 0, updated: 1, unchanged: 2 });
    expect(await prisma.attendance.count({ where: { date: new Date(`${day}T00:00:00Z`) } })).toBe(3);

    const log = await prisma.auditLog.findFirstOrThrow({ where: { entity: 'Attendance', action: 'UPDATE' } });
    expect(log.oldValues).toMatchObject({
      pastEdit: true,
      records: [{ studentId: ids[1], status: 'PRESENT' }],
    });
    expect(log.newValues).toMatchObject({ records: [{ studentId: ids[1], status: 'SICK' }] });
  });

  it('refuses students who are not in the class', async () => {
    const other = await agent
      .post('/api/v1/students')
      .send(studentPayload(base.p1.id, { firstName: 'Other' }));
    const res = await agent.post('/api/v1/attendance/sheet').send({
      classId: base.top.id,
      date: '2024-06-03',
      records: [{ studentId: other.body.data.id, status: 'PRESENT' }],
    });
    expect(res.status).toBe(400);
  });

  it('computes per-student history and chronic absentees', async () => {
    for (const day of ['2024-06-03', '2024-06-04', '2024-06-05', '2024-06-06']) {
      await agent
        .post('/api/v1/attendance/sheet')
        .send(sheet(day, ['PRESENT', 'ABSENT', 'PRESENT']))
        .expect(200);
    }
    const hist = await agent.get(`/api/v1/attendance/students/${ids[1]}`);
    expect(hist.body.data.summary).toMatchObject({ ABSENT: 4, total: 4, rate: 0 });
    const chronic = await agent.get('/api/v1/attendance/reports/chronic?from=2024-06-01&to=2024-06-30');
    expect(chronic.body.data.rows.map((r: { studentId: number }) => r.studentId)).toEqual([ids[1]]);
    const pdf = await agent.get(
      '/api/v1/attendance/reports/classes?from=2024-06-01&to=2024-06-30&format=pdf',
    );
    expect(pdf.headers['content-type']).toBe('application/pdf');
  });
});
