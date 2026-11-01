import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import {
  CLIENT_WS_PATH,
  createClientServer,
  type ClientMessage,
} from '../src/realtime/client-server.js';
import { jobEvents } from '../src/realtime/job-events.js';
import { routeUpgrades } from '../src/realtime/upgrade.js';

let server: Server;
let baseUrl: string;
const sockets: WebSocket[] = [];

beforeEach(async () => {
  await prisma.job.deleteMany();
  server = createApp().listen(0);
  routeUpgrades(server, { [CLIENT_WS_PATH]: createClientServer() });
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  sockets.forEach((ws) => ws.terminate());
  sockets.length = 0;
  jobEvents.removeAllListeners();
  await new Promise((resolve) => server.close(resolve));
});

afterAll(async () => {
  await prisma.$disconnect();
});

/** A browser-like client that records every message it receives. */
async function connectClient(path = CLIENT_WS_PATH) {
  const ws = new WebSocket(`${baseUrl.replace('http', 'ws')}${path}`);
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

describe('real-time job updates', () => {
  it('pushes a new job to every connected browser', async () => {
    const first = await connectClient();
    const second = await connectClient();

    const response = await fetch(`${baseUrl}/api/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Live job', sourceCode: 'int main() {}' }),
    });
    const { id } = await response.json();

    for (const messages of [first, second]) {
      const update = await waitFor(() => messages.find((m) => m.job.id === id));
      expect(update).toMatchObject({
        type: 'job-updated',
        job: { name: 'Live job', status: 'PENDING' },
      });
      expect(update.job).not.toHaveProperty('binaryPath');
    }
  });

  it('pushes later state changes of a job', async () => {
    const messages = await connectClient();
    const job = await prisma.job.create({ data: { name: 'Changing', sourceCode: 'x' } });

    await prisma.job.update({
      where: { id: job.id },
      data: { status: 'COMPLETED', stdout: 'done' },
    });
    jobEvents.notify(job.id);

    const update = await waitFor(() => messages.find((m) => m.job.status === 'COMPLETED'));
    expect(update.job.stdout).toBe('done');
  });

  it('refuses WebSocket connections on unknown paths', async () => {
    await expect(connectClient('/ws/unknown')).rejects.toThrow();
  });
});
