import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { Scheduler } from '../src/agents/scheduler.js';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { agentEvents } from '../src/realtime/agent-events.js';
import {
  CLIENT_WS_PATH,
  createClientServer,
  type ClientMessage,
} from '../src/realtime/client-server.js';
import { jobEvents } from '../src/realtime/job-events.js';
import { routeUpgrades } from '../src/realtime/upgrade.js';
import { createUser, resetDatabase, sessionCookie } from './helpers.js';

let server: Server;
let baseUrl: string;
const sockets: WebSocket[] = [];

beforeEach(async () => {
  await resetDatabase();
  server = createApp().listen(0);
  routeUpgrades(server, { [CLIENT_WS_PATH]: createClientServer() });
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  sockets.forEach((ws) => ws.terminate());
  sockets.length = 0;
  jobEvents.removeAllListeners();
  agentEvents.removeAllListeners();
  await new Promise((resolve) => server.close(resolve));
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** A browser-like client, logged in with the given cookie, that records every message. */
async function connectClient(cookie?: string, path = CLIENT_WS_PATH) {
  const ws = new WebSocket(`${baseUrl.replace('http', 'ws')}${path}`, {
    headers: cookie ? { Cookie: cookie } : {},
  });
  sockets.push(ws);
  const messages: ClientMessage[] = [];
  ws.on('message', (data) => messages.push(JSON.parse(data.toString())));
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
  return messages;
}

async function waitFor<T>(check: () => T, timeoutMs = 3000): Promise<NonNullable<T>> {
  const start = Date.now();
  for (;;) {
    const value = check();
    if (value) return value as NonNullable<T>;
    if (Date.now() - start > timeoutMs) throw new Error('Timed out waiting for condition');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('real-time job updates', () => {
  it("pushes a new job to its owner's browsers", async () => {
    const owner = await createUser('CLIENT');
    const cookie = await sessionCookie(owner);
    const first = await connectClient(cookie);
    const second = await connectClient(cookie);

    const response = await fetch(`${baseUrl}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({ name: 'Live job', sourceCode: 'int main() {}' }),
    });
    const { id } = await response.json();

    for (const messages of [first, second]) {
      const update = await waitFor(() =>
        messages.find((m) => m.type === 'job-updated' && m.job.id === id),
      );
      expect(update).toMatchObject({
        type: 'job-updated',
        job: { name: 'Live job', status: 'PENDING' },
      });
      expect(update.job).not.toHaveProperty('binaryPath');
    }
  });

  it('pushes later state changes of a job', async () => {
    const owner = await createUser('CLIENT');
    const messages = await connectClient(await sessionCookie(owner));
    const job = await prisma.job.create({
      data: { name: 'Changing', sourceCode: 'x', clientId: owner.id },
    });

    await prisma.job.update({
      where: { id: job.id },
      data: { status: 'COMPLETED', stdout: 'done' },
    });
    jobEvents.notify(job.id);

    const update = await waitFor(() =>
      messages.find((m) => m.type === 'job-updated' && m.job.status === 'COMPLETED'),
    );
    expect(update.type === 'job-updated' && update.job.stdout).toBe('done');
  });

  it('never pushes a job to other clients, but does to admins', async () => {
    const owner = await createUser('CLIENT');
    const stranger = await connectClient(await sessionCookie(await createUser('CLIENT')));
    const admin = await connectClient(await sessionCookie(await createUser('ADMIN')));
    const job = await prisma.job.create({
      data: { name: 'Private', sourceCode: 'x', clientId: owner.id },
    });

    jobEvents.notify(job.id);

    await waitFor(() => admin.some((m) => m.type === 'job-updated'));
    await pause(100);
    expect(stranger).toHaveLength(0);
  });

  it('pushes the list of providers to providers only', async () => {
    const provider = await connectClient(await sessionCookie(await createUser('PROVIDER')));
    const client = await connectClient(await sessionCookie(await createUser('CLIENT')));
    const scheduler = new Scheduler();

    scheduler.addAgent({
      id: 'agent-1',
      name: 'PC-Casa',
      gpus: [{ name: 'RTX 3060 Ti', memoryMb: 8192, computeCapability: '8.6' }],
      send: () => {},
    });
    const connected = await waitFor(() => provider.find((m) => m.type === 'agents-updated'));
    expect(connected).toMatchObject({ agents: [{ name: 'PC-Casa', busy: false }] });

    await scheduler.removeAgent('agent-1');
    await waitFor(() => provider.some((m) => m.type === 'agents-updated' && m.agents.length === 0));
    expect(client).toHaveLength(0);
  });

  it('refuses browsers that are not logged in', async () => {
    await expect(connectClient()).rejects.toThrow(/401/);
  });

  it('refuses WebSocket connections on unknown paths', async () => {
    const cookie = await sessionCookie(await createUser());
    await expect(connectClient(cookie, '/ws/unknown')).rejects.toThrow();
  });
});
