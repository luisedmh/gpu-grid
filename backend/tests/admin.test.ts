import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Scheduler } from '../src/agents/scheduler.js';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import {
  createMachine,
  createUser,
  loggedIn,
  resetDatabase,
  TEST_CLIENT_BALANCE,
} from './helpers.js';

let scheduler: Scheduler;
let app: ReturnType<typeof createApp>;
let admin: Awaited<ReturnType<typeof loggedIn>>;

beforeEach(async () => {
  await resetDatabase();
  scheduler = new Scheduler();
  app = createApp({ scheduler });
  admin = await loggedIn(app, 'ADMIN');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('access', () => {
  it('is only for administrators', async () => {
    const user = await loggedIn(app, 'CLIENT');
    for (const path of ['/api/admin/overview', '/api/admin/users', '/api/admin/jobs']) {
      expect((await user.get(path)).status).toBe(403);
    }
  });

  it('stops working at once when admin rights are removed, even with an old session', async () => {
    await prisma.user.update({ where: { id: admin.user.id }, data: { isAdmin: false } });
    expect((await admin.get('/api/admin/users')).status).toBe(403);
  });
});

describe('overview', () => {
  it('counts users, machines and jobs, and works out the platform revenue', async () => {
    const client = await createUser('CLIENT');
    const provider = await createUser('PROVIDER');
    const { machine } = await createMachine(provider.id);
    await prisma.job.create({
      data: {
        name: 'done',
        sourceCode: 'x',
        clientId: client.id,
        machineId: machine.id,
        status: 'COMPLETED',
        costCredits: 100,
      },
    });
    await prisma.creditMovement.create({
      data: { userId: provider.id, type: 'EARNING', amount: 80 },
    });

    const response = await admin.get('/api/admin/overview');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      users: 3,
      machines: { registered: 1, online: 0 },
      jobs: { COMPLETED: 1, QUEUED: 0 },
      credits: { paidByClients: 100, paidToProviders: 80, platformRevenue: 20 },
    });
  });
});

describe('users', () => {
  it('lists every account with its balance and activity', async () => {
    const client = await createUser('CLIENT');
    await createMachine(client.id);

    const response = await admin.get('/api/admin/users');

    expect(response.body).toHaveLength(2);
    const listed = response.body.find((u: { id: string }) => u.id === client.id);
    expect(listed).toMatchObject({
      balance: TEST_CLIENT_BALANCE,
      _count: { machines: 1, jobs: 0 },
    });
    expect(listed).not.toHaveProperty('passwordHash');
  });

  it('gives credits, recorded as a GRANT movement', async () => {
    const user = await createUser('PROVIDER');

    const response = await admin.post(`/api/admin/users/${user.id}/credits`).send({ amount: 250 });

    expect(response.body).toEqual({ balance: 250 });
    const movements = await prisma.creditMovement.findMany({ where: { userId: user.id } });
    expect(movements).toMatchObject([{ type: 'GRANT', amount: 250 }]);
  });

  it('rejects giving zero, negative or fractional credits', async () => {
    const user = await createUser();
    for (const amount of [0, -5, 1.5]) {
      const response = await admin.post(`/api/admin/users/${user.id}/credits`).send({ amount });
      expect(response.status).toBe(400);
    }
  });

  it('makes other accounts administrators, but cannot demote itself', async () => {
    const user = await createUser();

    const promote = await admin.patch(`/api/admin/users/${user.id}`).send({ isAdmin: true });
    const demoteSelf = await admin
      .patch(`/api/admin/users/${admin.user.id}`)
      .send({ isAdmin: false });

    expect(promote.status).toBe(204);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).isAdmin).toBe(true);
    expect(demoteSelf.status).toBe(400);
  });
});

describe('machines and jobs', () => {
  it('lists every machine with its owner', async () => {
    const owner = await createUser('PROVIDER');
    await createMachine(owner.id, 'PC-Casa');

    const response = await admin.get('/api/admin/machines');

    expect(response.body).toMatchObject([
      { name: 'PC-Casa', online: false, owner: { id: owner.id } },
    ]);
  });

  it("removes anyone's machine", async () => {
    const owner = await createUser('PROVIDER');
    const { machine } = await createMachine(owner.id);

    const response = await admin.delete(`/api/admin/machines/${machine.id}`);

    expect(response.status).toBe(204);
    expect(await prisma.machine.count()).toBe(0);
  });

  it('lists jobs of every user, filtered by status', async () => {
    const a = await createUser();
    const b = await createUser();
    await prisma.job.create({ data: { name: 'a', sourceCode: 'x', clientId: a.id } });
    await prisma.job.create({
      data: { name: 'b', sourceCode: 'x', clientId: b.id, status: 'COMPLETED' },
    });

    const all = await admin.get('/api/admin/jobs');
    const completed = await admin.get('/api/admin/jobs?status=COMPLETED');

    expect(all.body).toHaveLength(2);
    expect(completed.body).toMatchObject([{ name: 'b', client: { id: b.id } }]);
    expect(completed.body[0]).not.toHaveProperty('sourceCode');
  });
});
