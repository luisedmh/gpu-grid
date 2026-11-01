import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';

const app = createApp();

const validJob = {
  name: 'Vector addition',
  sourceCode: '__global__ void k() {}\nint main() { return 0; }',
};

beforeEach(async () => {
  await prisma.job.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('POST /api/jobs', () => {
  it('creates a pending job and stores it', async () => {
    const response = await request(app).post('/api/jobs').send(validJob);

    expect(response.status).toBe(201);
    expect(response.body.status).toBe('PENDING');
    expect(response.headers.location).toBe(`/api/jobs/${response.body.id}`);

    const stored = await prisma.job.findUnique({ where: { id: response.body.id } });
    expect(stored?.name).toBe(validJob.name);
    expect(stored?.sourceCode).toBe(validJob.sourceCode);
    expect(stored?.timeoutSeconds).toBe(60);
  });

  it('notifies that a new job was created, so it can be compiled', async () => {
    const onJobCreated = vi.fn();
    const appWithHook = createApp({ onJobCreated });

    const response = await request(appWithHook).post('/api/jobs').send(validJob);

    expect(onJobCreated).toHaveBeenCalledWith(response.body.id);
  });

  it('accepts a custom timeout', async () => {
    const response = await request(app)
      .post('/api/jobs')
      .send({ ...validJob, timeoutSeconds: 10 });

    expect(response.status).toBe(201);
    const stored = await prisma.job.findUnique({ where: { id: response.body.id } });
    expect(stored?.timeoutSeconds).toBe(10);
  });

  it('rejects an empty source code', async () => {
    const response = await request(app)
      .post('/api/jobs')
      .send({ ...validJob, sourceCode: '' });

    expect(response.status).toBe(400);
    expect(response.body.details[0].field).toBe('sourceCode');
    expect(await prisma.job.count()).toBe(0);
  });

  it('rejects a timeout above the limit', async () => {
    const response = await request(app)
      .post('/api/jobs')
      .send({ ...validJob, timeoutSeconds: 3600 });

    expect(response.status).toBe(400);
    expect(response.body.details[0].field).toBe('timeoutSeconds');
  });

  it('rejects malformed JSON', async () => {
    const response = await request(app)
      .post('/api/jobs')
      .set('Content-Type', 'application/json')
      .send('{ not json');

    expect(response.status).toBe(400);
  });
});

describe('GET /api/jobs/:id', () => {
  it('returns the job without internal fields', async () => {
    const created = await request(app).post('/api/jobs').send(validJob);

    const response = await request(app).get(`/api/jobs/${created.body.id}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: created.body.id,
      name: validJob.name,
      status: 'PENDING',
      stdout: null,
    });
    expect(response.body).not.toHaveProperty('binaryPath');
    expect(response.body).not.toHaveProperty('sourceCode');
  });

  it('returns 404 for an unknown job', async () => {
    const response = await request(app).get('/api/jobs/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body.error).toMatch(/not found/);
  });
});

describe('unknown routes', () => {
  it('answer with a JSON 404', async () => {
    const response = await request(app).get('/api/nothing-here');

    expect(response.status).toBe(404);
    expect(response.body.error).toBeDefined();
  });
});

describe('GET /api/jobs', () => {
  async function createJobs() {
    const names = ['first', 'second', 'third'];
    for (const name of names) {
      await prisma.job.create({ data: { name, sourceCode: 'int main() {}' } });
      // Distinct timestamps, so the order is deterministic
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    await prisma.job.updateMany({ where: { name: 'second' }, data: { status: 'COMPLETED' } });
  }

  it('lists jobs newest first, without their outputs', async () => {
    await createJobs();

    const response = await request(app).get('/api/jobs');

    expect(response.status).toBe(200);
    expect(response.body.jobs.map((job: { name: string }) => job.name)).toEqual([
      'third',
      'second',
      'first',
    ]);
    expect(response.body.jobs[0]).not.toHaveProperty('stdout');
    expect(response.body.jobs[0]).not.toHaveProperty('sourceCode');
  });

  it('counts jobs in every status', async () => {
    await createJobs();

    const response = await request(app).get('/api/jobs');

    expect(response.body.counts).toMatchObject({ PENDING: 2, COMPLETED: 1, FAILED: 0 });
  });

  it('filters by status and limits the number of results', async () => {
    await createJobs();

    const filtered = await request(app).get('/api/jobs?status=COMPLETED');
    const limited = await request(app).get('/api/jobs?limit=2');

    expect(filtered.body.jobs.map((job: { name: string }) => job.name)).toEqual(['second']);
    expect(limited.body.jobs).toHaveLength(2);
  });

  it('rejects an unknown status', async () => {
    const response = await request(app).get('/api/jobs?status=EXPLODED');

    expect(response.status).toBe(400);
    expect(response.body.details[0].field).toBe('status');
  });
});
