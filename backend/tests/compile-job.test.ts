import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { compileJob, recoverPendingJobs } from '../src/compiler/compile-job.js';
import type { Compiler } from '../src/compiler/docker-compiler.js';
import { prisma } from '../src/lib/prisma.js';

let jobsDir: string;

beforeEach(async () => {
  await prisma.job.deleteMany();
  jobsDir = await mkdtemp(path.join(tmpdir(), 'gpugrid-jobs-'));
});

afterAll(async () => {
  await rm(jobsDir, { recursive: true, force: true });
  await prisma.$disconnect();
});

function createPendingJob(sourceCode = 'int main() { return 0; }') {
  return prisma.job.create({ data: { name: 'Test job', sourceCode } });
}

/** A fake compiler that answers immediately with a fixed result. */
function fakeCompiler(result: Awaited<ReturnType<Compiler>>) {
  return vi.fn<Compiler>().mockResolvedValue(result);
}

describe('compileJob', () => {
  it('writes the source code to the job folder and queues the job on success', async () => {
    const job = await createPendingJob('__global__ void k() {}');
    const compiler = fakeCompiler({ success: true, output: '', timedOut: false });

    await compileJob(job.id, { compiler, jobsDir });

    const workDir = path.join(jobsDir, job.id);
    expect(compiler).toHaveBeenCalledWith(workDir);
    expect(await readFile(path.join(workDir, 'main.cu'), 'utf8')).toBe('__global__ void k() {}');

    const updated = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.status).toBe('QUEUED');
    expect(updated.binaryPath).toBe(path.join(workDir, 'program'));
  });

  it('marks the job as COMPILE_FAILED and keeps the compiler output', async () => {
    const job = await createPendingJob();
    const output = 'main.cu(1): error: identifier "foo" is undefined';
    const compiler = fakeCompiler({ success: false, output, timedOut: false });

    await compileJob(job.id, { compiler, jobsDir });

    const updated = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.status).toBe('COMPILE_FAILED');
    expect(updated.compilerOutput).toBe(output);
    expect(updated.binaryPath).toBeNull();
    expect(updated.finishedAt).not.toBeNull();
  });

  it('explains when compilation timed out', async () => {
    const job = await createPendingJob();
    const compiler = fakeCompiler({ success: false, output: '', timedOut: true });

    await compileJob(job.id, { compiler, jobsDir });

    const updated = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.status).toBe('COMPILE_FAILED');
    expect(updated.compilerOutput).toMatch(/time limit/);
  });

  it('fails the job without crashing when the compiler cannot start', async () => {
    const job = await createPendingJob();
    const compiler = vi.fn<Compiler>().mockRejectedValue(new Error('spawn docker ENOENT'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await compileJob(job.id, { compiler, jobsDir });

    const updated = await prisma.job.findUniqueOrThrow({ where: { id: job.id } });
    expect(updated.status).toBe('COMPILE_FAILED');
    expect(updated.compilerOutput).toMatch(/Internal error/);
  });

  it('never compiles a job that is not PENDING', async () => {
    const job = await createPendingJob();
    await prisma.job.update({ where: { id: job.id }, data: { status: 'QUEUED' } });
    const compiler = fakeCompiler({ success: true, output: '', timedOut: false });

    await compileJob(job.id, { compiler, jobsDir });

    expect(compiler).not.toHaveBeenCalled();
  });
});

describe('recoverPendingJobs', () => {
  it('returns interrupted and pending jobs, oldest first', async () => {
    const first = await createPendingJob();
    const second = await createPendingJob();
    await prisma.job.update({ where: { id: first.id }, data: { status: 'COMPILING' } });
    const done = await createPendingJob();
    await prisma.job.update({ where: { id: done.id }, data: { status: 'QUEUED' } });

    const recovered = await recoverPendingJobs();

    expect(recovered).toEqual([first.id, second.id]);
    const restored = await prisma.job.findUniqueOrThrow({ where: { id: first.id } });
    expect(restored.status).toBe('PENDING');
  });
});
