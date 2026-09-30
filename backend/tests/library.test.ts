import { ADMIN, login, prisma, resetDb, seedBase, studentPayload } from './helpers';

let agent: Awaited<ReturnType<typeof login>>;
let bookId: number;
let copyIds: number[];
let studentId: number;

beforeEach(async () => {
  await resetDb();
  const base = await seedBase();
  agent = await login(ADMIN);
  const cat = await agent.post('/api/v1/library/categories').send({ name: 'Story Books' });
  const book = await agent
    .post('/api/v1/library/books')
    .send({ title: 'The Gruffalo', author: 'Julia Donaldson', categoryId: cat.body.data.id, copies: 3 });
  expect(book.status).toBe(201);
  bookId = book.body.data.id;
  copyIds = book.body.data.copies.map((c: { id: number }) => c.id);
  studentId = (await agent.post('/api/v1/students').send(studentPayload(base.p1.id))).body.data.id;
});
afterAll(() => prisma.$disconnect());

const book = () => prisma.book.findUniqueOrThrow({ where: { id: bookId } });

describe('Library', () => {
  it('generates copies with LIB- codes', async () => {
    const copies = await prisma.bookCopy.findMany({ where: { bookId } });
    expect(copies.map((c) => c.copyCode)).toEqual(copies.map((c) => `LIB-${String(c.id).padStart(6, '0')}`));
    expect(await book()).toMatchObject({ totalCopies: 3, availableCopies: 3 });
  });

  it('issues and returns a book, keeping counters in sync', async () => {
    const issue = await agent.post('/api/v1/library/loans').send({ bookCopyId: copyIds[0], studentId });
    expect(issue.status).toBe(201);
    expect(issue.body.data.status).toBe('BORROWED');
    expect(await book()).toMatchObject({ availableCopies: 2 });

    const again = await agent.post('/api/v1/library/loans').send({ bookCopyId: copyIds[0], studentId });
    expect(again.status).toBe(409);

    const ret = await agent
      .post(`/api/v1/library/loans/${issue.body.data.id}/return`)
      .send({ condition: 'GOOD' });
    expect(ret.status).toBe(200);
    expect(ret.body.data.status).toBe('RETURNED');
    expect(await book()).toMatchObject({ availableCopies: 3 });
    expect((await agent.post(`/api/v1/library/loans/${issue.body.data.id}/return`).send({})).status).toBe(
      409,
    );
  });

  it('enforces the max books per student', async () => {
    await agent.post('/api/v1/library/loans').send({ bookCopyId: copyIds[0], studentId }).expect(201);
    await agent.post('/api/v1/library/loans').send({ bookCopyId: copyIds[1], studentId }).expect(201);
    const third = await agent.post('/api/v1/library/loans').send({ bookCopyId: copyIds[2], studentId });
    expect(third.status).toBe(409);
    expect(third.body.error.message).toMatch(/limit 2/);
  });

  it('damaged returns take the copy out of circulation', async () => {
    const issue = await agent.post('/api/v1/library/loans').send({ bookCopyId: copyIds[0], studentId });
    await agent
      .post(`/api/v1/library/loans/${issue.body.data.id}/return`)
      .send({ condition: 'DAMAGED', damageFine: 2000 })
      .expect(200);
    const loan = await prisma.bookLoan.findUniqueOrThrow({ where: { id: issue.body.data.id } });
    expect(Number(loan.fine)).toBe(2000);
    expect((await prisma.bookCopy.findUniqueOrThrow({ where: { id: copyIds[0] } })).status).toBe('DAMAGED');
    expect(await book()).toMatchObject({ availableCopies: 2, totalCopies: 3 });
  });

  it('marks lost books with a fine and flags overdue loans', async () => {
    const issue = await agent.post('/api/v1/library/loans').send({ bookCopyId: copyIds[0], studentId });
    await agent.post(`/api/v1/library/loans/${issue.body.data.id}/lost`).send({ fine: 5000 }).expect(200);
    expect(await book()).toMatchObject({ totalCopies: 2, availableCopies: 2 });

    const overdue = await agent.post('/api/v1/library/loans').send({ bookCopyId: copyIds[1], studentId });
    await prisma.bookLoan.update({
      where: { id: overdue.body.data.id },
      data: { dueDate: new Date('2024-01-01') },
    });
    const { markOverdueLoans } = await import('../src/modules/library/service');
    expect(await markOverdueLoans()).toBe(1);
    expect((await prisma.bookLoan.findUniqueOrThrow({ where: { id: overdue.body.data.id } })).status).toBe(
      'OVERDUE',
    );
    expect(await prisma.notification.count({ where: { type: 'OVERDUE' } })).toBe(2);
  });

  it('can issue to staff by name and via copy code', async () => {
    const code = (await prisma.bookCopy.findUniqueOrThrow({ where: { id: copyIds[2] } })).copyCode;
    const res = await agent
      .post('/api/v1/library/loans')
      .send({ copyCode: code.toLowerCase(), borrowerName: 'Teacher Alice' });
    expect(res.status).toBe(201);
    expect(res.body.data.borrowerName).toBe('Teacher Alice');
  });
});
