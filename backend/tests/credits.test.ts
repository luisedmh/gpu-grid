import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { JobResult } from '../src/agents/protocol.js';
import { createApp } from '../src/app.js';
import { compileJob } from '../src/compiler/compile-job.js';
import { config } from '../src/config.js';
import { prisma } from '../src/lib/prisma.js';
import { MAX_ATTEMPTS, releaseJob, saveResult } from '../src/services/execution.service.js';
import {
  createMachine,
  createUser,
  loggedIn,
  resetDatabase,
  TEST_CLIENT_BALANCE,
} from './helpers.js';

const app = createApp();
const job = { name: 'Vector add', sourceCode: '__global__ void k() {}', timeoutSeconds: 60 };
/** Price of one second of GPU time. */
const SECOND = config.creditsPerGpuSecond;
/** What a 60-second job reserves. */
const RESERVED = 60 * SECOND;
/** The provider's part of a cost. */
const share = (cost: number) => Math.floor((cost * config.providerSharePercent) / 100);

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

const balanceOf = async (userId: string) =>
  (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).balance;

/** Submits a job through the API and puts it RUNNING on a provider's machine. */
async function runningJob() {
  const client = await loggedIn(app, 'CLIENT');
  const provider = await createUser('PROVIDER');
  const { machine } = await createMachine(provider.id);
  const response = await client.post('/api/jobs').send(job);
  expect(response.status).toBe(201);
  await prisma.job.update({
    where: { id: response.body.id },
    data: { status: 'RUNNING', machineId: machine.id, attempts: 1 },
  });
  return { client, provider, jobId: response.body.id as string };
}

const result = (jobId: string, extra: Partial<JobResult> = {}): JobResult => ({
  jobId,
  exitCode: 0,
  stdout: 'ok',
  stderr: '',
  durationMs: 2500,
  timedOut: false,
  ...extra,
});

describe('new accounts', () => {
  it('gives new accounts free credits, recorded as a movement', async () => {
    const response = await request(app).post('/api/auth/register').send({
      name: 'Ana',
      email: 'ana@example.com',
      password: 'correct horse battery',
    });

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: response.body.id },
      include: { creditMovements: true },
    });
    expect(user.balance).toBe(config.welcomeCredits);
    expect(user.creditMovements).toMatchObject([
      { type: 'WELCOME', amount: config.welcomeCredits },
    ]);
  });
});

describe('submitting a job', () => {
  it('reserves the most the job can cost', async () => {
    const client = await loggedIn(app, 'CLIENT');

    const response = await client.post('/api/jobs').send(job);

    expect(response.status).toBe(201);
    expect(response.body.reservedCredits).toBe(RESERVED);
    expect(await balanceOf(client.user.id)).toBe(TEST_CLIENT_BALANCE - RESERVED);
    const movements = await prisma.creditMovement.findMany({ where: { userId: client.user.id } });
    expect(movements).toMatchObject([
      { type: 'RESERVE', amount: -RESERVED, jobId: response.body.id },
    ]);
  });

  it('refuses the job with 402 when the client cannot pay for it', async () => {
    const client = await loggedIn(app, 'CLIENT');
    await prisma.user.update({ where: { id: client.user.id }, data: { balance: RESERVED - 1 } });

    const response = await client.post('/api/jobs').send(job);

    expect(response.status).toBe(402);
    expect(response.body.error).toMatch(/Not enough credits/);
    expect(await prisma.job.count()).toBe(0);
    expect(await balanceOf(client.user.id)).toBe(RESERVED - 1);
  });

  it('never lets two jobs at once spend the same credits', async () => {
    const client = await loggedIn(app, 'CLIENT');
    await prisma.user.update({ where: { id: client.user.id }, data: { balance: RESERVED } });

    const responses = await Promise.all([
      client.post('/api/jobs').send(job),
      client.post('/api/jobs').send(job),
    ]);

    expect(responses.map((r) => r.status).sort()).toEqual([201, 402]);
    expect(await balanceOf(client.user.id)).toBe(0);
  });
});

describe('settling a finished job', () => {
  it('charges the GPU seconds used, refunds the rest and pays the provider', async () => {
    const { client, provider, jobId } = await runningJob();

    await saveResult(jobId, result(jobId, { durationMs: 2500 }));

    // 2.5 s are charged as 3 s; the provider gets their share of it, rounded down
    const cost = 3 * SECOND;
    expect(await balanceOf(client.user.id)).toBe(TEST_CLIENT_BALANCE - cost);
    expect(await balanceOf(provider.id)).toBe(share(cost));
    expect(share(SECOND)).toBeGreaterThan(0);
    const finished = await prisma.job.findUniqueOrThrow({ where: { id: jobId } });
    expect(finished).toMatchObject({ status: 'COMPLETED', costCredits: cost });
  });

  it('charges programs that fail too: they used the GPU', async () => {
    const { client, jobId } = await runningJob();

    await saveResult(jobId, result(jobId, { exitCode: 1, durationMs: 400 }));

    expect(await balanceOf(client.user.id)).toBe(TEST_CLIENT_BALANCE - SECOND);
  });

  it('charges the whole reservation, and no more, when the job times out', async () => {
    const { client, jobId } = await runningJob();

    await saveResult(jobId, result(jobId, { exitCode: 137, timedOut: true, durationMs: 60_700 }));

    expect(await balanceOf(client.user.id)).toBe(TEST_CLIENT_BALANCE - RESERVED);
  });

  it('does not charge when the agent could not run the program', async () => {
    const { client, provider, jobId } = await runningJob();

    await saveResult(jobId, result(jobId, { exitCode: null, durationMs: 0 }));

    expect(await balanceOf(client.user.id)).toBe(TEST_CLIENT_BALANCE);
    expect(await balanceOf(provider.id)).toBe(0);
  });

  it('settles only once, even if the result arrives twice', async () => {
    const { client, provider, jobId } = await runningJob();

    await saveResult(jobId, result(jobId));
    await saveResult(jobId, result(jobId));

    expect(await balanceOf(client.user.id)).toBe(TEST_CLIENT_BALANCE - 3 * SECOND);
    expect(await balanceOf(provider.id)).toBe(share(3 * SECOND));
  });

  it('refunds everything when the job fails to compile', async () => {
    const client = await loggedIn(app, 'CLIENT');
    const response = await client.post('/api/jobs').send(job);
    const compiler = async () => ({ success: false, output: 'error: syntax', timedOut: false });

    await compileJob(response.body.id, { compiler, jobsDir: '/tmp/gpugrid-credits-test' });

    expect(await balanceOf(client.user.id)).toBe(TEST_CLIENT_BALANCE);
    const failed = await prisma.job.findUniqueOrThrow({ where: { id: response.body.id } });
    expect(failed).toMatchObject({ status: 'COMPILE_FAILED', costCredits: 0 });
  });

  it('refunds everything when no machine could finish the job', async () => {
    const { client, provider, jobId } = await runningJob();
    await prisma.job.update({ where: { id: jobId }, data: { attempts: MAX_ATTEMPTS } });

    await releaseJob(jobId, 'The provider disconnected.');

    expect(await balanceOf(client.user.id)).toBe(TEST_CLIENT_BALANCE);
    expect(await balanceOf(provider.id)).toBe(0);
  });
});

describe('GET /api/credits', () => {
  it('shows the balance, the prices and the movements, newest first', async () => {
    const { client, jobId } = await runningJob();
    await saveResult(jobId, result(jobId));

    const response = await client.get('/api/credits');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      balance: TEST_CLIENT_BALANCE - 3 * SECOND,
      creditsPerGpuSecond: config.creditsPerGpuSecond,
      providerSharePercent: config.providerSharePercent,
    });
    expect(response.body.movements).toMatchObject([
      { type: 'REFUND', amount: RESERVED - 3 * SECOND, job: { id: jobId, name: job.name } },
      { type: 'RESERVE', amount: -RESERVED, job: { id: jobId } },
    ]);
  });

  it('keeps the balance equal to the sum of the movements', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register').send({
      name: 'Ana',
      email: 'ana@example.com',
      password: 'correct horse battery',
    });
    await agent.post('/api/jobs').send(job);
    await agent.post('/api/jobs').send({ ...job, timeoutSeconds: 10 });

    const { balance, movements } = (await agent.get('/api/credits')).body;
    const sum = movements.reduce((total: number, m: { amount: number }) => total + m.amount, 0);
    expect(balance).toBe(sum);
    expect(balance).toBe(config.welcomeCredits - RESERVED - 10 * SECOND);
  });

  it('requires logging in', async () => {
    const response = await request(app).get('/api/credits');
    expect(response.status).toBe(401);
  });
});
