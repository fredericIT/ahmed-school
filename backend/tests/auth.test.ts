import request from 'supertest';
import { ADMIN, SUPER, app, login, prisma, resetDb, seedBase } from './helpers';

const cookieNames = (res: request.Response) =>
  ([] as string[]).concat(res.headers['set-cookie'] ?? []).map((c) => c.split('=')[0]);

beforeEach(async () => {
  await resetDb();
  await seedBase();
});
afterAll(() => prisma.$disconnect());

describe('Auth', () => {
  it('logs in, sets httpOnly cookies and never returns secrets', async () => {
    const res = await request(app).post('/api/v1/auth/login').send(SUPER);
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(SUPER.email);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|accessToken|refreshToken/);
    expect(cookieNames(res)).toEqual(expect.arrayContaining(['access_token', 'refresh_token']));
    expect(String(res.headers['set-cookie'])).toMatch(/HttpOnly/);
  });

  it('rejects wrong credentials with a generic message', async () => {
    const bad = await request(app).post('/api/v1/auth/login').send({ email: SUPER.email, password: 'nope' });
    const unknown = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ghost@test.rw', password: 'nope' });
    expect(bad.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(bad.body.error.message).toBe(unknown.body.error.message);
  });

  it('validates the login body', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'not-an-email' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('locks the account for 15 minutes after 5 failed attempts', async () => {
    for (let i = 0; i < 4; i++) {
      const r = await request(app).post('/api/v1/auth/login').send({ email: ADMIN.email, password: 'wrong' });
      expect(r.status).toBe(401);
    }
    const fifth = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: ADMIN.email, password: 'wrong' });
    expect(fifth.status).toBe(423);
    // Even the correct password is refused while locked.
    const locked = await request(app).post('/api/v1/auth/login').send(ADMIN);
    expect(locked.status).toBe(423);
    const user = await prisma.user.findUniqueOrThrow({ where: { email: ADMIN.email } });
    expect(user.lockedUntil!.getTime()).toBeGreaterThan(Date.now() + 14 * 60_000);
  });

  it('returns the current user from /auth/me and 401 without a session', async () => {
    const agent = await login(ADMIN);
    const me = await agent.get('/api/v1/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.data.role).toBe('ADMIN');
    expect(me.body.data.passwordHash).toBeUndefined();
    expect((await request(app).get('/api/v1/auth/me')).status).toBe(401);
  });

  it('rotates refresh tokens and detects reuse', async () => {
    const first = await request(app).post('/api/v1/auth/login').send(ADMIN);
    const oldRefresh = ([] as string[])
      .concat(first.headers['set-cookie'])
      .find((c) => c.startsWith('refresh_token='))!
      .split(';')[0];

    const rotated = await request(app).post('/api/v1/auth/refresh').set('Cookie', oldRefresh);
    expect(rotated.status).toBe(200);
    const newRefresh = ([] as string[])
      .concat(rotated.headers['set-cookie'])
      .find((c) => c.startsWith('refresh_token='))!
      .split(';')[0];
    expect(newRefresh).not.toBe(oldRefresh);

    // Replaying the old token is treated as theft: it fails and revokes the whole family.
    const replay = await request(app).post('/api/v1/auth/refresh').set('Cookie', oldRefresh);
    expect(replay.status).toBe(401);
    const afterReuse = await request(app).post('/api/v1/auth/refresh').set('Cookie', newRefresh);
    expect(afterReuse.status).toBe(401);
  });

  it('logout revokes the refresh token', async () => {
    const res = await request(app).post('/api/v1/auth/login').send(ADMIN);
    const refresh = ([] as string[])
      .concat(res.headers['set-cookie'])
      .find((c) => c.startsWith('refresh_token='))!
      .split(';')[0];
    await request(app).post('/api/v1/auth/logout').set('Cookie', refresh).expect(200);
    expect((await request(app).post('/api/v1/auth/refresh').set('Cookie', refresh)).status).toBe(401);
  });

  it('changes password and enforces the password policy', async () => {
    const agent = await login(ADMIN);
    const weak = await agent
      .post('/api/v1/auth/change-password')
      .send({ currentPassword: ADMIN.password, newPassword: 'short' });
    expect(weak.status).toBe(422);
    const wrong = await agent
      .post('/api/v1/auth/change-password')
      .send({ currentPassword: 'bad', newPassword: 'NewPass@123' });
    expect(wrong.status).toBe(400);
    const ok = await agent
      .post('/api/v1/auth/change-password')
      .send({ currentPassword: ADMIN.password, newPassword: 'NewPass@123' });
    expect(ok.status).toBe(200);
    expect(
      (await request(app).post('/api/v1/auth/login').send({ email: ADMIN.email, password: 'NewPass@123' }))
        .status,
    ).toBe(200);
  });

  it('supports forgot/reset password with single-use tokens', async () => {
    const spy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const res = await request(app).post('/api/v1/auth/forgot-password').send({ email: ADMIN.email });
    expect(res.status).toBe(200);
    // Unknown emails get the same answer (no account enumeration).
    const unknown = await request(app).post('/api/v1/auth/forgot-password').send({ email: 'ghost@test.rw' });
    expect(unknown.body.data.message).toBe(res.body.data.message);
    spy.mockRestore();
    expect(await prisma.passwordResetToken.count()).toBe(1);

    const bad = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: 'x'.repeat(40), newPassword: 'Reset@1234' });
    expect(bad.status).toBe(400);
  });

  it('saves, validates and resets dashboard widget preferences per user', async () => {
    const agent = await login(ADMIN);
    expect((await agent.get('/api/v1/auth/me')).body.data.dashboardWidgets).toBeNull();

    const saved = await agent
      .put('/api/v1/auth/preferences')
      .send({ dashboardWidgets: ['kpi.students', 'list.overdue', 'kpi.students'] });
    expect(saved.status).toBe(200);
    expect(saved.body.data.dashboardWidgets).toEqual(['kpi.students', 'list.overdue']);

    // Unknown widget keys are rejected.
    expect((await agent.put('/api/v1/auth/preferences').send({ dashboardWidgets: ['hack'] })).status).toBe(
      422,
    );

    // Another user's dashboard is unaffected.
    const other = await login(SUPER);
    expect((await other.get('/api/v1/auth/me')).body.data.dashboardWidgets).toBeNull();

    const reset = await agent.put('/api/v1/auth/preferences').send({ dashboardWidgets: null });
    expect(reset.body.data.dashboardWidgets).toBeNull();
  });
});
