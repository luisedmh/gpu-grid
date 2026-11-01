import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import WebSocket from 'ws';
import { AGENT_WS_PATH, createAgentServer } from '../src/agents/agent-server.js';
import { Scheduler } from '../src/agents/scheduler.js';
import { createApp } from '../src/app.js';
import { hashMachineToken } from '../src/lib/machine-token.js';
import { prisma } from '../src/lib/prisma.js';
import { routeUpgrades } from '../src/realtime/upgrade.js';
import { loggedIn, resetDatabase } from './helpers.js';

let scheduler: Scheduler;
let app: ReturnType<typeof createApp>;
let provider: Awaited<ReturnType<typeof loggedIn>>;

beforeEach(async () => {
  await resetDatabase();
  scheduler = new Scheduler();
  app = createApp({ scheduler });
  provider = await loggedIn(app, 'PROVIDER');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('registering machines', () => {
  it('returns the token once and only stores its hash', async () => {
    const response = await provider.post('/api/machines').send({ name: 'PC-Casa' });

    expect(response.status).toBe(201);
    const { machine, token } = response.body;
    expect(token).toMatch(/^ggm_/);
    expect(response.body.agentImage).toMatch(/gpu-grid-agent/);
    expect(machine).toMatchObject({ name: 'PC-Casa', tokenPrefix: token.slice(0, 10) });
    expect(machine).not.toHaveProperty('tokenHash');

    const stored = await prisma.machine.findUniqueOrThrow({ where: { id: machine.id } });
    expect(stored.tokenHash).toBe(hashMachineToken(token));
    expect(JSON.stringify(stored)).not.toContain(token);
  });

  it('gives every machine a different token', async () => {
    const a = await provider.post('/api/machines').send({ name: 'a' });
    const b = await provider.post('/api/machines').send({ name: 'b' });
    expect(a.body.token).not.toBe(b.body.token);
  });

  it('is open to every account: the same person can submit jobs and offer machines', async () => {
    const client = await loggedIn(app, 'CLIENT');
    const response = await client.post('/api/machines').send({ name: 'also mine' });
    expect(response.status).toBe(201);
  });

  it('requires logging in', async () => {
    const response = await request(app).post('/api/machines').send({ name: 'nope' });
    expect(response.status).toBe(401);
  });
});

describe('listing and deleting machines', () => {
  it('shows everyone only their own machines, admins included', async () => {
    await provider.post('/api/machines').send({ name: 'mine' });
    const other = await loggedIn(app, 'PROVIDER');
    await other.post('/api/machines').send({ name: 'theirs' });
    const admin = await loggedIn(app, 'ADMIN');

    const mine = await provider.get('/api/machines');
    const adminsOwn = await admin.get('/api/machines');

    expect(mine.body.map((m: { name: string }) => m.name)).toEqual(['mine']);
    expect(adminsOwn.body).toHaveLength(0);
    expect(mine.body[0]).toMatchObject({ online: false, busy: false, lastSeenAt: null });
  });

  it("does not let a provider delete someone else's machine", async () => {
    const created = await provider.post('/api/machines').send({ name: 'mine' });
    const other = await loggedIn(app, 'PROVIDER');

    const response = await other.delete(`/api/machines/${created.body.machine.id}`);

    expect(response.status).toBe(404);
    expect(await prisma.machine.count()).toBe(1);
  });
});

describe('machines online', () => {
  let server: Server;
  let sockets: WebSocket[] = [];

  afterEach(async () => {
    sockets.forEach((ws) => ws.terminate());
    sockets = [];
    await new Promise((resolve) => server?.close(resolve));
  });

  async function connect(token: string) {
    server = app.listen(0);
    routeUpgrades(server, { [AGENT_WS_PATH]: createAgentServer({ scheduler }) });
    const { port } = server.address() as AddressInfo;
    const ws = new WebSocket(`ws://localhost:${port}/ws/agent`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    sockets.push(ws);
    const closed = new Promise<number>((resolve) => ws.on('close', (code) => resolve(code)));
    await new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });
    ws.send(
      JSON.stringify({
        type: 'hello',
        gpus: [{ name: 'RTX', memoryMb: 8192, computeCapability: '8.6' }],
      }),
    );
    for (let i = 0; i < 100 && scheduler.listAgents().length === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return { closed };
  }

  it('shows the live state of connected machines', async () => {
    const created = await provider.post('/api/machines').send({ name: 'PC-Casa' });
    await connect(created.body.token);

    const response = await provider.get('/api/machines');

    expect(response.body[0]).toMatchObject({
      name: 'PC-Casa',
      online: true,
      gpus: [{ name: 'RTX' }],
    });
  });

  it('disconnects a machine when it is deleted', async () => {
    const created = await provider.post('/api/machines').send({ name: 'PC-Casa' });
    const { closed } = await connect(created.body.token);

    const response = await provider.delete(`/api/machines/${created.body.machine.id}`);

    expect(response.status).toBe(204);
    expect(await closed).toBe(4001);
  });
});
