import { ADMIN, login, prisma, resetDb, seedBase } from './helpers';

let agent: Awaited<ReturnType<typeof login>>;
let itemId: number;
let base: Awaited<ReturnType<typeof seedBase>>;

beforeEach(async () => {
  await resetDb();
  base = await seedBase();
  agent = await login(ADMIN);
  const cat = await agent.post('/api/v1/inventory/categories').send({ name: 'Stationery' });
  const item = await agent.post('/api/v1/inventory/items').send({
    name: 'Crayons',
    categoryId: cat.body.data.id,
    unit: 'PACK',
    reorderLevel: 5,
    unitCost: 1000,
    openingQuantity: 10,
  });
  expect(item.status).toBe(201);
  itemId = item.body.data.id;
});
afterAll(() => prisma.$disconnect());

const qty = async () => (await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemId } })).quantity;

describe('Stock movements', () => {
  it('auto-generates a SKU and records opening stock', async () => {
    const item = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(item.sku).toBe(`INV-${String(itemId).padStart(5, '0')}`);
    expect(await prisma.stockMovement.count({ where: { itemId, type: 'IN' } })).toBe(1);
  });

  it('stock in increases quantity and updates weighted average cost', async () => {
    const res = await agent
      .post('/api/v1/inventory/movements')
      .send({ itemId, type: 'IN', quantity: 10, unitCost: 2000 });
    expect(res.status).toBe(201);
    expect(res.body.data.movement.balanceAfter).toBe(20);
    const item = await prisma.inventoryItem.findUniqueOrThrow({ where: { id: itemId } });
    expect(Number(item.unitCost)).toBe(1500);
  });

  it('stock out decreases quantity and requires a recipient', async () => {
    expect(
      (await agent.post('/api/v1/inventory/movements').send({ itemId, type: 'OUT', quantity: 3 })).status,
    ).toBe(422);
    const res = await agent
      .post('/api/v1/inventory/movements')
      .send({ itemId, type: 'OUT', quantity: 3, issuedClassId: base.top.id });
    expect(res.status).toBe(201);
    expect(await qty()).toBe(7);
  });

  it('never lets stock go negative', async () => {
    const res = await agent
      .post('/api/v1/inventory/movements')
      .send({ itemId, type: 'OUT', quantity: 11, issuedTo: 'P1 teacher' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Insufficient stock/);
    expect(await qty()).toBe(10);
    expect(await prisma.stockMovement.count({ where: { itemId, type: 'OUT' } })).toBe(0);
  });

  it('stays non-negative under concurrent stock-outs', async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        agent
          .post('/api/v1/inventory/movements')
          .send({ itemId, type: 'OUT', quantity: 3, issuedTo: 'Kitchen' }),
      ),
    );
    const ok = results.filter((r) => r.status === 201).length;
    expect(ok).toBe(3);
    expect(await qty()).toBe(1);
  });

  it('adjusts to a counted quantity and writes off damaged stock', async () => {
    const adj = await agent
      .post('/api/v1/inventory/movements')
      .send({ itemId, type: 'ADJUSTMENT', countedQuantity: 8, reason: 'Stock take' });
    expect(adj.status).toBe(201);
    expect(adj.body.data.movement.quantity).toBe(-2);
    const dmg = await agent
      .post('/api/v1/inventory/movements')
      .send({ itemId, type: 'DAMAGED', quantity: 2, reason: 'Water damage' });
    expect(dmg.status).toBe(201);
    expect(await qty()).toBe(6);
  });

  it('raises a low-stock notification when crossing the reorder level', async () => {
    await agent
      .post('/api/v1/inventory/movements')
      .send({ itemId, type: 'OUT', quantity: 6, issuedTo: 'Top Class' })
      .expect(201);
    const n = await prisma.notification.findMany({ where: { type: 'LOW_STOCK' } });
    expect(n.length).toBe(2); // one per active staff user
    const alerts = await agent.get('/api/v1/inventory/alerts');
    expect(alerts.body.data.lowStock.map((i: { id: number }) => i.id)).toContain(itemId);
  });
});
