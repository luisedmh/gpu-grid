import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { AGENT_WS_PATH, createAgentServer } from '../src/agents/agent-server.js';
import type { ServerMessage } from '../src/agents/protocol.js';
import { Scheduler } from '../src/agents/scheduler.js';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { routeUpgrades } from '../src/realtime/upgrade.js';
import { MAX_ATTEMPTS } from '../src/services/execution.service.js';
import { createMachine, createUser, resetDatabase } from './helpers.js';

let server: Server;
let baseUrl: string;
let scheduler: Scheduler;
let jobsDir: string;
let clientId: string;
let providerId: string;
const openSockets: WebSocket[] = [];

beforeAll(async () => {
  jobsDir = await mkdtemp(path.join(tmpdir(), 'gpugrid-agents-'));
});

beforeEach(async () => {
  await resetDatabase();
  clientId = (await createUser('CLIENT')).id;
  providerId = (await createUser('PROVIDER')).id;
  scheduler = new Scheduler();
  server = createApp({ scheduler }).listen(0);
  routeUpgrades(server, { [AGENT_WS_PATH]: createAgentServer({ scheduler }) });
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  openSockets.forEach((ws) => ws.terminate());
  openSockets.length = 0;
  await new Promise((resolve) => server.close(resolve));
});

afterAll(async () => {
  await rm(jobsDir, { recursive: true, force: true });
  await prisma.$disconnect();
});

/** Creates a compiled job, as if the compiler had just finished. */
async function createQueuedJob(name = 'Job') {
  const job = await prisma.job.create({ data: { name, sourceCode: 'int main() {}', clientId } });
  const binaryPath = path.join(jobsDir, `${job.id}-program`);
  await writeFile(binaryPath, 'fake binary');
  return prisma.job.update({ where: { id: job.id }, data: { status: 'QUEUED', binaryPath } });
}

/** A fake provider agent: connects with a machine token and records what the server sends. */
async function connectAgent(token: string) {
  const ws = new WebSocket(`${baseUrl.replace('http', 'ws')}/ws/agent`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  openSockets.push(ws);
  const messages: ServerMessage[] = [];
  ws.on('message', (data) => messages.push(JSON.parse(data.toString())));
  const closed = new Promise<number>((resolve) => ws.on('close', (code) => resolve(code)));

  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
  ws.send(
    JSON.stringify({
      type: 'hello',
      gpus: [{ name: 'Fake GPU', memoryMb: 8192, computeCapability: '8.6' }],
    }),
  );

  /** Waits until the server has sent a job to this agent. */
  const nextJob = () =>
    waitFor(() => messages.find((m) => m.type === 'job')) as Promise<
      Extract<ServerMessage, { type: 'job' }>
    >;

  return { ws, messages, nextJob, closed };
}

/** A new machine for the test provider, already connected. */
async function connectNewMachine(name = 'machine') {
  const { machine, token } = await createMachine(providerId, name);
  return { machine, token, ...(await connectAgent(token)) };
}

/** Polls until the check returns something truthy (or fails after 3 s). */
async function waitFor<T>(check: () => T | Promise<T>, timeoutMs = 3000): Promise<NonNullable<T>> {
  const start = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value as NonNullable<T>;
    if (Date.now() - start > timeoutMs) throw new Error('Timed out waiting for condition');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

const jobStatus = async (id: string) =>
  (await prisma.job.findUniqueOrThrow({ where: { id } })).status;

const result = (jobId: string, extra: object = {}) =>
  JSON.stringify({
    type: 'result',
    jobId,
    exitCode: 0,
    stdout: 'Result OK',
    stderr: '',
    durationMs: 420,
    timedOut: false,
    ...extra,
  });

describe('machine connection', () => {
  it('rejects agents with an unknown token', async () => {
    await expect(connectAgent('ggm_not-a-real-token')).rejects.toThrow(/401/);
  });

  it('identifies the machine by its token and records when it was seen', async () => {
    const { machine, messages } = await connectNewMachine('PC-Casa');

    const welcome = await waitFor(() => messages.find((m) => m.type === 'welcome'));
    expect(welcome).toMatchObject({ machineId: machine.id, name: 'PC-Casa' });
    await waitFor(
      async () => (await prisma.machine.findUnique({ where: { id: machine.id } }))?.lastSeenAt,
    );
    expect(scheduler.listAgents(providerId)).toMatchObject([{ name: 'PC-Casa', busy: false }]);
  });

  it('replaces the old connection when the same machine connects again', async () => {
    const { token, closed } = await connectNewMachine();
    await waitFor(() => scheduler.listAgents().length === 1);

    await connectAgent(token);

    expect(await closed).toBe(4002);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(scheduler.listAgents()).toHaveLength(1);
  });
});

describe('job execution', () => {
  it('sends a queued job to a free machine and stores its result', async () => {
    const job = await createQueuedJob();
    const agent = await connectNewMachine();

    const assigned = await agent.nextJob();
    expect(assigned.jobId).toBe(job.id);
    const running = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(running).toMatchObject({ status: 'RUNNING', machineId: agent.machine.id });

    // The machine downloads the binary with its token...
    const binary = await fetch(`${baseUrl}${assigned.binaryPath}`, {
      headers: { Authorization: `Bearer ${agent.token}` },
    });
    expect(await binary.text()).toBe('fake binary');

    // ...and reports the result
    agent.ws.send(result(job.id));

    await waitFor(async () => (await jobStatus(job.id)) === 'COMPLETED');
    const finished = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(finished).toMatchObject({ stdout: 'Result OK', exitCode: 0, durationMs: 420 });
    expect(finished.finishedAt).not.toBeNull();
  });

  it('marks jobs as TIMED_OUT from the reported result', async () => {
    const job = await createQueuedJob();
    const agent = await connectNewMachine();
    await agent.nextJob();

    agent.ws.send(result(job.id, { exitCode: 137, stdout: '', timedOut: true }));

    await waitFor(async () => (await jobStatus(job.id)) === 'TIMED_OUT');
  });

  it("only lets the assigned machine download a job's binary", async () => {
    const job = await createQueuedJob();
    const assigned = await connectNewMachine('assigned');
    await assigned.nextJob();
    const other = await createMachine(providerId, 'other');

    const anonymous = await fetch(`${baseUrl}/api/agent/jobs/${job.id}/binary`);
    const wrongMachine = await fetch(`${baseUrl}/api/agent/jobs/${job.id}/binary`, {
      headers: { Authorization: `Bearer ${other.token}` },
    });

    expect(anonymous.status).toBe(401);
    expect(wrongMachine.status).toBe(404);
  });

  it('ignores results for jobs the machine was not given', async () => {
    const agent = await connectNewMachine();
    await waitFor(() => scheduler.listAgents().length === 1);
    const other = await prisma.job.create({
      data: { name: 'other', sourceCode: 'x', status: 'RUNNING', clientId },
    });

    agent.ws.send(result(other.id, { stdout: 'fake' }));
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(await jobStatus(other.id)).toBe('RUNNING');
  });

  it('gives each job to only one machine', async () => {
    const job = await createQueuedJob();
    const first = await connectNewMachine('first');
    const second = await connectNewMachine('second');

    await waitFor(() => [first, second].some((a) => a.messages.some((m) => m.type === 'job')));
    await new Promise((resolve) => setTimeout(resolve, 200));

    const receivers = [first, second].filter((a) => a.messages.some((m) => m.type === 'job'));
    expect(receivers).toHaveLength(1);
    expect(await jobStatus(job.id)).toBe('RUNNING');
  });
});

describe('fault tolerance', () => {
  it('requeues the job when its machine disconnects, and another machine finishes it', async () => {
    const job = await createQueuedJob();
    const flaky = await connectNewMachine('flaky');
    await flaky.nextJob();

    flaky.ws.terminate();
    const backup = await connectNewMachine('backup');
    const reassigned = await backup.nextJob();

    expect(reassigned.jobId).toBe(job.id);
    const retried = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(retried).toMatchObject({ attempts: 2, machineId: backup.machine.id });
  });

  it(`fails the job after ${MAX_ATTEMPTS} lost attempts`, async () => {
    const job = await createQueuedJob();

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const agent = await connectNewMachine(`machine-${attempt}`);
      await agent.nextJob();
      agent.ws.terminate();
      await waitFor(async () => (await jobStatus(job.id)) !== 'RUNNING');
    }

    const failed = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(failed.status).toBe('FAILED');
    expect(failed.stderr).toMatch(/Gave up after 3 attempts/);
  });
});
