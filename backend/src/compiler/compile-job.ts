import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../lib/prisma.js';
import { BINARY_FILE, SOURCE_FILE, type CompileResult, type Compiler } from './docker-compiler.js';

export interface CompileDeps {
  compiler: Compiler;
  jobsDir: string;
}

/**
 * Takes a PENDING job through compilation:
 * PENDING -> COMPILING -> QUEUED (success) or COMPILE_FAILED (errors).
 */
export async function compileJob(jobId: string, deps: CompileDeps): Promise<void> {
  // Claim the job atomically, so it can never be compiled twice
  const claimed = await prisma.job.updateMany({
    where: { id: jobId, status: 'PENDING' },
    data: { status: 'COMPILING' },
  });
  if (claimed.count === 0) return;

  const job = await prisma.job.findUniqueOrThrow({
    where: { id: jobId },
    select: { sourceCode: true },
  });

  const workDir = path.join(deps.jobsDir, jobId);
  await mkdir(workDir, { recursive: true });
  await writeFile(path.join(workDir, SOURCE_FILE), job.sourceCode);

  let result: CompileResult;
  try {
    result = await deps.compiler(workDir);
  } catch (err) {
    console.error(`Compiler could not run for job ${jobId}:`, err);
    result = {
      success: false,
      output: 'Internal error: the compiler could not be started. Please try again later.',
      timedOut: false,
    };
  }

  if (result.success) {
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'QUEUED',
        compilerOutput: result.output,
        binaryPath: path.join(workDir, BINARY_FILE),
      },
    });
  } else {
    const message = result.timedOut ? 'Compilation exceeded the time limit.' : '';
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'COMPILE_FAILED',
        compilerOutput: [result.output, message].filter(Boolean).join('\n'),
        finishedAt: new Date(),
      },
    });
  }
}

/**
 * After a restart, jobs left half-way through compilation go back to PENDING.
 * Returns every PENDING job id, oldest first, so they can be queued again.
 */
export async function recoverPendingJobs(): Promise<string[]> {
  await prisma.job.updateMany({ where: { status: 'COMPILING' }, data: { status: 'PENDING' } });
  const jobs = await prisma.job.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  return jobs.map((job) => job.id);
}
