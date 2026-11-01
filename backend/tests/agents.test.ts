import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { attachAgentServer } from '../src/agents/agent-server.js';
import type { ServerMessage } from '../src/agents/protocol.js';
import { Scheduler } from '../src/agents/scheduler.js';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { MAX_ATTEMPTS } from '../src/services/execution.service.js';

const TOKEN = 'test-agent-token';

let server: Server;
let baseUrl: string;
let scheduler: Scheduler;
let jobsDir: string;
const openSockets: WebSocket[] = [];

beforeAll(async () => {
  jobsDir = await mkdtemp(path.join(tmpdir(), 'gpugrid-agents-'));
});

beforeEach(async () => {
  await prisma.job.deleteMany();
  scheduler = new Scheduler();
  const app = createApp({ agentToken: TOKEN, listAgents: () => scheduler.listAgents() });
  server = app.listen(0);
  attachAgentServer(server, { token: TOKEN, scheduler });
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
  const job = await prisma.job.create({ data: { name, sourceCode: 'int main() {}' } });
  const binaryPath = path.join(jobsDir, `${job.id}-program`);
  await writeFile(binaryPath, 'fake binary');
  return prisma.job.update({ where: { id: job.id }, data: { status: 'QUEUED', binaryPath } });
}

/** A fake provider agent: connects, says hello and records what the server sends. */
async function connectAgent(name = 'fake-agent', token = TOKEN) {
  const ws = new WebSocket(`${baseUrl.replace('http', 'ws')}/ws/agent`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  openSockets.push(ws);
  const messages: ServerMessage[] = [];
  ws.on('message', (data) => messages.push(JSON.parse(data.toString())));

  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
  ws.send(
    JSON.stringify({
      type: 'hello',
      name,
      gpus: [{ name: 'Fake GPU', memoryMb: 8192, computeCapability: '8.6' }],
    }),
  );

  /** Waits until the server has sent a job to this agent. */
  const nextJob = () =>
    waitFor(() => messages.find((m) => m.type === 'job')) as Promise<
      Extract<ServerMessage, { type: 'job' }>
    >;

  return { ws, messages, nextJob };
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

describe('agent connection', () => {
  it('rejects agents with a wrong token', async () => {
    await expect(connectAgent('intruder', 'wrong-token')).rejects.toThrow(/401/);
  });

  it('lists connected agents', async () => {
    await connectAgent('provider-1');
    await waitFor(() => scheduler.listAgents().length === 1);

    const response = await fetch(`${baseUrl}/api/agents`);
    const agents = await response.json();

    expect(agents).toMatchObject([{ name: 'provider-1', busy: false }]);
  });
});

describe('job execution', () => {
  it('sends a queued job to a free agent and stores its result', async () => {
    const job = await createQueuedJob();
    const agent = await connectAgent();

    const assigned = await agent.nextJob();
    expect(assigned.jobId).toBe(job.id);
    expect(await jobStatus(job.id)).toBe('RUNNING');

    // The agent downloads the binary with its token...
    const binary = await fetch(`${baseUrl}${assigned.binaryPath}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(await binary.text()).toBe('fake binary');

    // ...and reports the result
    agent.ws.send(
      JSON.stringify({
        type: 'result',
        jobId: job.id,
        exitCode: 0,
        stdout: 'Result OK',
        stderr: '',
        durationMs: 420,
        timedOut: false,
      }),
    );

    await waitFor(async () => (await jobStatus(job.id)) === 'COMPLETED');
    const finished = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(finished).toMatchObject({ stdout: 'Result OK', exitCode: 0, durationMs: 420 });
    expect(finished.finishedAt).not.toBeNull();
  });

  it('marks jobs as FAILED or TIMED_OUT from the reported result', async () => {
    const failing = await createQueuedJob('failing');
    const agent = await connectAgent();
    await agent.nextJob();

    agent.ws.send(
      JSON.stringify({
        type: 'result',
        jobId: failing.id,
        exitCode: 137,
        stdout: '',
        stderr: '',
        durationMs: 5000,
        timedOut: true,
      }),
    );

    await waitFor(async () => (await jobStatus(failing.id)) === 'TIMED_OUT');
  });

  it('protects binary downloads with the agent token', async () => {
    const job = await createQueuedJob();
    const response = await fetch(`${baseUrl}/api/agent/jobs/${job.id}/binary`);
    expect(response.status).toBe(401);
  });

  it('ignores results for jobs the agent was not given', async () => {
    const job = await createQueuedJob();
    const agent = await connectAgent();
    await waitFor(() => scheduler.listAgents().length === 1);
    const other = await prisma.job.create({
      data: { name: 'other', sourceCode: 'x', status: 'RUNNING' },
    });

    agent.ws.send(
      JSON.stringify({
        type: 'result',
        jobId: other.id,
        exitCode: 0,
        stdout: 'fake',
        stderr: '',
        durationMs: 1,
        timedOut: false,
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(await jobStatus(other.id)).toBe('RUNNING');
    expect(job.id).toBeDefined();
  });

  it('gives each job to only one agent', async () => {
    const job = await createQueuedJob();
    const first = await connectAgent('first');
    const second = await connectAgent('second');

    await first.nextJob().catch(() => null);
    await second.nextJob().catch(() => null);

    const receivers = [first, second].filter((a) => a.messages.some((m) => m.type === 'job'));
    expect(receivers).toHaveLength(1);
    expect(await jobStatus(job.id)).toBe('RUNNING');
  });
});

describe('fault tolerance', () => {
  it('requeues the job when its agent disconnects, and another agent finishes it', async () => {
    const job = await createQueuedJob();
    const flaky = await connectAgent('flaky');
    await flaky.nextJob();

    flaky.ws.terminate();
    const backup = await connectAgent('backup');
    const reassigned = await backup.nextJob();

    expect(reassigned.jobId).toBe(job.id);
    const retried = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(retried.attempts).toBe(2);
  });

  it(`fails the job after ${MAX_ATTEMPTS} lost attempts`, async () => {
    const job = await createQueuedJob();

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const agent = await connectAgent(`agent-${attempt}`);
      await agent.nextJob();
      agent.ws.terminate();
      await waitFor(async () => (await jobStatus(job.id)) !== 'RUNNING');
    }

    const failed = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(failed.status).toBe('FAILED');
    expect(failed.stderr).toMatch(/Gave up after 3 attempts/);
  });
});
