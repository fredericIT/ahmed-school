import { ADMIN, login, prisma, resetDb, seedBase, SUPER } from './helpers';
import { storedPlural, translateStored, withLang } from '../src/i18n';
import { invalidateSettings } from '../src/utils/settings';

beforeEach(async () => {
  await resetDb();
  await seedBase();
});
afterAll(() => prisma.$disconnect());

describe('Languages', () => {
  it('answers errors in the language the app asks for', async () => {
    const agent = await login(ADMIN);
    const fr = await agent.get('/api/v1/students/999999').set('Accept-Language', 'fr');
    expect(fr.status).toBe(404);
    expect(fr.body.error.message).toBe('Élève introuvable');
    const rw = await agent.get('/api/v1/students/999999').set('Accept-Language', 'rw');
    expect(rw.body.error.message).toBe('Umunyeshuri ntibonetse');
    const en = await agent.get('/api/v1/students/999999').set('Accept-Language', 'en');
    expect(en.body.error.message).toBe('Student not found');
  });

  it('prefers the language chosen in the app (cookie) over the browser language', async () => {
    const agent = await login(ADMIN);
    const res = await agent
      .get('/api/v1/students/999999')
      .set('Accept-Language', 'en-US,en;q=0.9')
      .set('Cookie', 'locale=fr');
    expect(res.body.error.message).toBe('Élève introuvable');
  });

  it("falls back to the school's default language", async () => {
    await prisma.schoolSettings.updateMany({ data: { locale: 'fr' } });
    invalidateSettings();
    const res = await (await login(ADMIN)).get('/api/v1/students/999999');
    expect(res.body.error.message).toBe('Élève introuvable');
  });

  it('translates validation messages', async () => {
    const res = await (
      await login(SUPER)
    )
      .post('/api/v1/classes')
      .set('Accept-Language', 'fr')
      .send({ name: '', grade: 'P1', capacity: 30 });
    expect(res.status).toBe(422);
    expect(res.body.error.message).toBe('La validation a échoué');
  });

  it('stores notifications in English and shows them in each reader’s language', async () => {
    const stored = withLang('fr', () =>
      storedPlural(3, '{count} item at or below reorder level', '{count} items at or below reorder level'),
    );
    expect(stored).toBe('3 items at or below reorder level');
    expect(withLang('fr', () => translateStored(stored))).toBe(
      '3 articles au seuil de réapprovisionnement ou en dessous',
    );
    expect(withLang('rw', () => translateStored('Only 2 pcs left (reorder level 5).'))).toBe(
      'Hasigaye 2 ibice gusa (urugero rwo kongera kugura 5).',
    );
    expect(withLang('en', () => translateStored(stored))).toBe(stored);
  });

  it('lists notifications in the reader’s language', async () => {
    const admin = await prisma.user.findFirstOrThrow({ where: { email: ADMIN.email } });
    await prisma.notification.create({
      data: {
        userId: admin.id,
        type: 'LOW_STOCK',
        title: 'Low stock: Rice',
        message: 'Only 3 kg left (reorder level 10).',
      },
    });
    const res = await (await login(ADMIN)).get('/api/v1/notifications').set('Accept-Language', 'fr');
    expect(res.body.data[0].title).toBe('Stock faible : Rice');
    expect(res.body.data[0].message).toBe('Il ne reste que 3 kg (seuil de réapprovisionnement 10).');
  });
});
