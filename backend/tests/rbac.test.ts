import request from 'supertest';
import { ADMIN, SUPER, app, login, prisma, resetDb, seedBase, studentPayload } from './helpers';

let base: Awaited<ReturnType<typeof seedBase>>;
beforeEach(async () => {
  await resetDb();
  base = await seedBase();
});
afterAll(() => prisma.$disconnect());

describe('RBAC', () => {
  it('requires authentication on protected routes', async () => {
    for (const path of [
      '/api/v1/students',
      '/api/v1/dashboard',
      '/api/v1/inventory/items',
      '/api/v1/users',
    ]) {
      expect((await request(app).get(path)).status).toBe(401);
    }
  });

  it('blocks admins from super-admin areas', async () => {
    const agent = await login(ADMIN);
    expect((await agent.get('/api/v1/users')).status).toBe(403);
    expect((await agent.post('/api/v1/users').send({})).status).toBe(403);
    expect((await agent.patch('/api/v1/settings').send({ name: 'Hacked' })).status).toBe(403);
    expect((await agent.get('/api/v1/audit-logs')).status).toBe(403);
    expect((await agent.post('/api/v1/classes').send({ name: 'X', grade: 'P1' })).status).toBe(403);
    expect((await agent.post('/api/v1/academic/years').send({})).status).toBe(403);
  });

  it('lets admins run daily operations', async () => {
    const agent = await login(ADMIN);
    expect((await agent.get('/api/v1/students')).status).toBe(200);
    expect((await agent.get('/api/v1/dashboard')).status).toBe(200);
    expect((await agent.post('/api/v1/students').send(studentPayload(base.top.id))).status).toBe(201);
  });

  it('allows super admins into restricted areas', async () => {
    const agent = await login(SUPER);
    expect((await agent.get('/api/v1/users')).status).toBe(200);
    expect((await agent.get('/api/v1/audit-logs')).status).toBe(200);
    expect((await agent.patch('/api/v1/settings').send({ motto: 'Hello' })).status).toBe(200);
  });

  it('only allows soft delete for admins; hard delete for super admins', async () => {
    const admin = await login(ADMIN);
    const created = await admin.post('/api/v1/students').send(studentPayload(base.top.id));
    const id = created.body.data.id;
    expect((await admin.delete(`/api/v1/students/${id}?hard=true`)).status).toBe(400);
    expect((await admin.delete(`/api/v1/students/${id}`)).status).toBe(200);
    const soft = await prisma.student.findUnique({ where: { id } });
    expect(soft?.deletedAt).not.toBeNull();

    const superAgent = await login(SUPER);
    expect((await superAgent.delete(`/api/v1/students/${id}?hard=true`)).status).toBe(200);
    expect(await prisma.student.findUnique({ where: { id } })).toBeNull();
  });

  it('protects the last super admin and self-deactivation', async () => {
    const agent = await login(SUPER);
    expect(
      (await agent.patch(`/api/v1/users/${base.superAdmin.id}/status`).send({ isActive: false })).status,
    ).toBe(400);
    expect((await agent.patch(`/api/v1/users/${base.superAdmin.id}`).send({ role: 'ADMIN' })).status).toBe(
      400,
    );
    expect((await agent.delete(`/api/v1/users/${base.superAdmin.id}`)).status).toBe(400);
  });

  it('deactivated users are logged out immediately', async () => {
    const adminAgent = await login(ADMIN);
    const superAgent = await login(SUPER);
    await superAgent.patch(`/api/v1/users/${base.admin.id}/status`).send({ isActive: false }).expect(200);
    expect((await adminAgent.get('/api/v1/students')).status).toBe(401);
    expect((await request(app).post('/api/v1/auth/login').send(ADMIN)).status).toBe(403);
  });

  it('writes audit logs for mutations', async () => {
    const agent = await login(ADMIN);
    const res = await agent.post('/api/v1/students').send(studentPayload(base.top.id));
    const log = await prisma.auditLog.findFirst({
      where: { entity: 'Student', entityId: String(res.body.data.id), action: 'CREATE' },
    });
    expect(log?.userId).toBe(base.admin.id);
  });
});
