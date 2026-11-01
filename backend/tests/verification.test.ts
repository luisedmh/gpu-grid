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
import { checkSource, expectedChecksum, generateCheck } from '../src/verification/check-program.js';
import { Verifier } from '../src/verification/verifier.js';
import { createMachine, createUser, loggedIn, resetDatabase } from './helpers.js';

describe('verification programs', () => {
  it('gives the same answer as the CUDA code, computed in C with gcc', () => {
    // Reference value from compiling the kernel's arithmetic as a C program
    expect(expectedChecksum(200_000, 4_000_000_000, 4_000_000_000)).toBe(11894159487906745186n);
  });

  it('puts the parameters in the program, and the answer only in the platform', () => {
    const source = checkSource(123_456, 7, 9);
    expect(source).toContain('n = 123456u, a = 7u, b = 9u');
    expect(source).not.toContain(String(expectedChecksum(123_456, 7, 9)));
  });

  it('is different every time, so answers cannot be remembered', () => {
    const answers = new Set(Array.from({ length: 5 }, () => generateCheck().expectedOutput));
    expect(answers.size).toBe(5);
    expect([...answers][0]).toMatch(/^checksum \d+$/);
  });
});

let server: Server;
let baseUrl: string;
let scheduler: Scheduler;
let jobsDir: string;
let providerId: string;
/** Whether users' jobs are always followed by a spot check (otherwise never). */
let spotChecksOn: boolean;
const sockets: WebSocket[] = [];

beforeAll(async () => {
  jobsDir = await mkdtemp(path.join(tmpdir(), 'gpugrid-verify-'));
});

beforeEach(async () => {
  await resetDatabase();
  providerId = (await createUser('PROVIDER')).id;
  spotChecksOn = false;
  scheduler = new Scheduler();
  new Verifier({
    scheduler,
    // Instead of nvcc: pretend the compilation succeeded at once
    compile: (jobId) => void fakeCompile(jobId),
    spotCheckRate: 1,
    random: () => (spotChecksOn ? 0 : 1),
  }).attach();
  server = createApp({ scheduler }).listen(0);
  routeUpgrades(server, { [AGENT_WS_PATH]: createAgentServer({ scheduler }) });
  baseUrl = `ws://localhost:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  sockets.forEach((ws) => ws.terminate());
  sockets.length = 0;
  await new Promise((resolve) => server.close(resolve));
});

afterAll(async () => {
  await rm(jobsDir, { recursive: true, force: true });
  await prisma.$disconnect();
});

async function fakeCompile(jobId: string) {
  const binaryPath = path.join(jobsDir, `${jobId}-program`);
  await writeFile(binaryPath, 'binary');
  await prisma.job.update({ where: { id: jobId }, data: { status: 'QUEUED', binaryPath } });
  await scheduler.dispatch();
}

async function queuedClientJob() {
  const client = await createUser('CLIENT');
  const job = await prisma.job.create({
    data: { name: 'Real work', sourceCode: 'x', clientId: client.id },
  });
  await fakeCompile(job.id);
  return job;
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

type JobMessage = Extract<ServerMessage, { type: 'job' }>;

/** A fake agent that records the jobs it receives. */
async function connect(token: string) {
  const ws = new WebSocket(`${baseUrl}/ws/agent`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  sockets.push(ws);
  const jobs: JobMessage[] = [];
  ws.on('message', (data) => {
    const message = JSON.parse(data.toString()) as ServerMessage;
    if (message.type === 'job') jobs.push(message);
  });
  const closed = new Promise<number>((resolve) => ws.on('close', (code) => resolve(code)));
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
  ws.send(JSON.stringify({ type: 'hello', gpus: [] }));

  const jobNumber = (n: number) => waitFor(() => jobs[n - 1]);
  const answer = (jobId: string, stdout: string) =>
    ws.send(
      JSON.stringify({
        type: 'result',
        jobId,
        exitCode: 0,
        stdout,
        stderr: '',
        durationMs: 900,
        timedOut: false,
      }),
    );
  return { ws, jobs, jobNumber, answer, closed };
}

const expectedOutputOf = async (jobId: string) =>
  (await prisma.job.findUniqueOrThrow({ where: { id: jobId } })).expectedOutput ?? '';

describe('new machines', () => {
  it('get a verification job first, and no users’ jobs until they pass it', async () => {
    const userJob = await queuedClientJob();
    const { token } = await createMachine(providerId, 'new', false);

    const agent = await connect(token);
    const first = await agent.jobNumber(1);

    const check = await prisma.job.findUniqueOrThrow({ where: { id: first.jobId } });
    expect(check).toMatchObject({ kind: 'CHECK', clientId: null });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(agent.jobs).toHaveLength(1);
    expect((await prisma.job.findUniqueOrThrow({ where: { id: userJob.id } })).status).toBe(
      'QUEUED',
    );
  });

  it('become verified with the right answer, and then get users’ jobs', async () => {
    const userJob = await queuedClientJob();
    const { machine, token } = await createMachine(providerId, 'honest', false);
    const agent = await connect(token);
    const check = await agent.jobNumber(1);

    agent.answer(check.jobId, `Some output\n${await expectedOutputOf(check.jobId)}\n`);

    expect((await agent.jobNumber(2)).jobId).toBe(userJob.id);
    const verified = await prisma.machine.findUniqueOrThrow({ where: { id: machine.id } });
    expect(verified).toMatchObject({ checksPassed: 1, suspendedAt: null });
    expect(verified.verifiedAt).not.toBeNull();
  });

  it('are not paid for verification jobs, and nobody is charged', async () => {
    const { token } = await createMachine(providerId, 'honest', false);
    const agent = await connect(token);
    const check = await agent.jobNumber(1);

    agent.answer(check.jobId, await expectedOutputOf(check.jobId));

    await waitFor(
      async () => (await prisma.machine.findFirst({ where: { checksPassed: 1 } })) !== null,
    );
    expect(await prisma.creditMovement.count()).toBe(0);
  });

  it('get their check even when an idle verified machine is asked first', async () => {
    const verified = await createMachine(providerId, 'verified');
    const idle = await connect(verified.token);
    await waitFor(() => scheduler.listAgents().length === 1);
    const { token } = await createMachine(providerId, 'new', false);

    const newcomer = await connect(token);

    await newcomer.jobNumber(1);
    expect(idle.jobs).toHaveLength(0);
  });
});

describe('dishonest machines', () => {
  it('are suspended and disconnected after a wrong answer', async () => {
    const { machine, token } = await createMachine(providerId, 'cheater', false);
    const agent = await connect(token);
    const check = await agent.jobNumber(1);

    agent.answer(check.jobId, 'checksum 42');

    expect(await agent.closed).toBe(4003);
    const suspended = await prisma.machine.findUniqueOrThrow({ where: { id: machine.id } });
    expect(suspended).toMatchObject({ checksFailed: 1, verifiedAt: null });
    expect(suspended.suspensionReason).toMatch(/wrong result/);
  });

  it('cannot connect again while suspended', async () => {
    const { machine, token } = await createMachine(providerId, 'cheater');
    await prisma.machine.update({ where: { id: machine.id }, data: { suspendedAt: new Date() } });

    await expect(connect(token)).rejects.toThrow(/403/);
  });

  it('can be reinstated by an administrator, and must pass a new check', async () => {
    const { machine, token } = await createMachine(providerId, 'reformed');
    await prisma.machine.update({ where: { id: machine.id }, data: { suspendedAt: new Date() } });
    const admin = await loggedIn(createApp({ scheduler }), 'ADMIN');

    const response = await admin.post(`/api/admin/machines/${machine.id}/reinstate`);
    const agent = await connect(token);

    expect(response.status).toBe(204);
    const first = await agent.jobNumber(1);
    expect((await prisma.job.findUniqueOrThrow({ where: { id: first.jobId } })).kind).toBe('CHECK');
  });
});

describe('spot checks', () => {
  it('sometimes follow a user’s job, unannounced', async () => {
    spotChecksOn = true;
    const userJob = await queuedClientJob();
    const { machine, token } = await createMachine(providerId, 'verified');
    const agent = await connect(token);
    expect((await agent.jobNumber(1)).jobId).toBe(userJob.id);

    agent.answer(userJob.id, 'done');

    const spot = await agent.jobNumber(2);
    const check = await prisma.job.findUniqueOrThrow({ where: { id: spot.jobId } });
    expect(check).toMatchObject({ kind: 'CHECK', targetMachineId: machine.id });
  });

  it('are hidden from users, who only see their own jobs', async () => {
    const { token } = await createMachine(providerId, 'new', false);
    const agent = await connect(token);
    await agent.jobNumber(1);
    const user = await loggedIn(createApp({ scheduler }), 'CLIENT');

    const response = await user.get('/api/jobs');

    expect(response.body.jobs).toHaveLength(0);
  });
});
