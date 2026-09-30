import { ADMIN, login, prisma, resetDb, seedBase, studentPayload, todayKigali } from './helpers';

let base: Awaited<ReturnType<typeof seedBase>>;
beforeEach(async () => {
  await resetDb();
  base = await seedBase();
});
afterAll(() => prisma.$disconnect());

describe('Student registration', () => {
  it('registers a student with guardians and a sequential admission number', async () => {
    const agent = await login(ADMIN);
    const year = todayKigali().slice(0, 4);
    const a = await agent.post('/api/v1/students').send(
      studentPayload(base.top.id, {
        guardians: [
          {
            fullName: 'Jeanne Mukamana',
            relationship: 'Mother',
            phone: '+250788123456',
            isPrimary: true,
            isEmergencyContact: true,
          },
          {
            fullName: 'Jean Bosco Habimana',
            relationship: 'Father',
            phone: '+250788654321',
            canPickUp: false,
          },
        ],
      }),
    );
    expect(a.status).toBe(201);
    expect(a.body.data.admissionNumber).toBe(`SCH-${year}-0001`);
    expect(a.body.data.guardians).toHaveLength(2);
    expect(a.body.data.guardians.find((g: { isPrimary: boolean }) => g.isPrimary).fullName).toBe(
      'Jeanne Mukamana',
    );

    const b = await agent.post('/api/v1/students').send(studentPayload(base.top.id, { firstName: 'Ganza' }));
    expect(b.body.data.admissionNumber).toBe(`SCH-${year}-0002`);

    // Enrolment history is recorded for the current year.
    expect(await prisma.enrollment.count({ where: { studentId: a.body.data.id } })).toBe(1);
  });

  it('links an existing guardian for siblings', async () => {
    const agent = await login(ADMIN);
    const first = await agent.post('/api/v1/students').send(studentPayload(base.top.id));
    const guardianId = first.body.data.guardians[0].id;
    const sibling = await agent.post('/api/v1/students').send(
      studentPayload(base.p1.id, {
        firstName: 'Ishimwe',
        gender: 'MALE',
        guardians: [{ existingId: guardianId, isPrimary: true }],
      }),
    );
    expect(sibling.status).toBe(201);
    expect(sibling.body.data.guardians[0].id).toBe(guardianId);
    expect(await prisma.guardian.count()).toBe(1);
  });

  it('validates required fields', async () => {
    const agent = await login(ADMIN);
    const res = await agent
      .post('/api/v1/students')
      .send(studentPayload(base.top.id, { guardians: [], gender: 'X' }));
    expect(res.status).toBe(422);
    expect(Object.keys(res.body.error.details.fieldErrors)).toEqual(
      expect.arrayContaining(['gender', 'guardians']),
    );
  });

  it('enforces class capacity', async () => {
    const agent = await login(ADMIN);
    await prisma.class.update({ where: { id: base.top.id }, data: { capacity: 1 } });
    expect((await agent.post('/api/v1/students').send(studentPayload(base.top.id))).status).toBe(201);
    const full = await agent
      .post('/api/v1/students')
      .send(studentPayload(base.top.id, { firstName: 'Other' }));
    expect(full.status).toBe(409);
    expect(full.body.error.message).toMatch(/full/);
  });

  it('searches, filters and paginates', async () => {
    const agent = await login(ADMIN);
    for (const name of ['Keza', 'Ganza', 'Teta'])
      await agent.post('/api/v1/students').send(studentPayload(base.top.id, { firstName: name }));
    const page = await agent.get('/api/v1/students?pageSize=2&page=1&sortBy=firstName&sortOrder=asc');
    expect(page.body.meta).toMatchObject({ total: 3, totalPages: 2, page: 1 });
    expect(page.body.data[0].firstName).toBe('Ganza');
    const search = await agent.get('/api/v1/students?search=teta');
    expect(search.body.data).toHaveLength(1);
    const byGuardianPhone = await agent.get('/api/v1/students?search=788123456');
    expect(byGuardianPhone.body.meta.total).toBe(3);
  });

  it('changes status and promotes a class to the next grade', async () => {
    const agent = await login(ADMIN);
    const ids: number[] = [];
    for (const name of ['Keza', 'Ganza', 'Teta'])
      ids.push(
        (await agent.post('/api/v1/students').send(studentPayload(base.top.id, { firstName: name }))).body
          .data.id,
      );
    await agent
      .patch(`/api/v1/students/${ids[2]}/status`)
      .send({ status: 'WITHDRAWN', reason: 'Moved' })
      .expect(200);

    const res = await agent
      .post('/api/v1/students/promote')
      .send({ fromClassId: base.top.id, academicYearId: base.year.id, excludeStudentIds: [ids[1]] });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ promoted: 1, to: { id: base.p1.id } });
    expect((await prisma.student.findUniqueOrThrow({ where: { id: ids[0] } })).currentClassId).toBe(
      base.p1.id,
    );
    expect((await prisma.student.findUniqueOrThrow({ where: { id: ids[1] } })).currentClassId).toBe(
      base.top.id,
    );
  });

  it('exports the list and printable documents', async () => {
    const agent = await login(ADMIN);
    const st = await agent.post('/api/v1/students').send(studentPayload(base.top.id));
    const xlsx = await agent.get('/api/v1/students?format=xlsx');
    expect(xlsx.status).toBe(200);
    expect(xlsx.headers['content-type']).toMatch(/spreadsheetml/);
    const pdf = await agent.get(`/api/v1/students/${st.body.data.id}/id-card`);
    expect(pdf.headers['content-type']).toBe('application/pdf');
  });
});
