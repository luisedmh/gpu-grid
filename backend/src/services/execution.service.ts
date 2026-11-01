import { prisma } from '../lib/prisma.js';
import type { JobResult } from '../agents/protocol.js';

/** A job may be retried on another provider this many times before it fails for good. */
export const MAX_ATTEMPTS = 3;

/**
 * Takes the oldest QUEUED job and marks it RUNNING, atomically.
 * Returns null when there is nothing to run.
 */
export async function claimNextJob() {
  // Another process may claim the same job first; then we simply try the next one
  for (let tries = 0; tries < 5; tries++) {
    const next = await prisma.job.findFirst({
      where: { status: 'QUEUED' },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!next) return null;

    const claimed = await prisma.job.updateMany({
      where: { id: next.id, status: 'QUEUED' },
      data: { status: 'RUNNING', startedAt: new Date(), attempts: { increment: 1 } },
    });
    if (claimed.count === 1) {
      return prisma.job.findUniqueOrThrow({
        where: { id: next.id },
        select: { id: true, timeoutSeconds: true },
      });
    }
  }
  return null;
}

/** Stores what the provider reported and moves the job to its final state. */
export async function saveResult(jobId: string, result: JobResult) {
  const status = result.timedOut ? 'TIMED_OUT' : result.exitCode === 0 ? 'COMPLETED' : 'FAILED';

  await prisma.job.updateMany({
    // Only a RUNNING job can finish; late or duplicated results are ignored
    where: { id: jobId, status: 'RUNNING' },
    data: {
      status,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      durationMs: result.durationMs,
      finishedAt: new Date(),
    },
  });
}

/**
 * The provider running this job is gone. The job goes back to the queue,
 * unless it has already used all its attempts.
 */
export async function releaseJob(jobId: string, reason: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { attempts: true } });
  if (!job) return;

  if (job.attempts >= MAX_ATTEMPTS) {
    await prisma.job.updateMany({
      where: { id: jobId, status: 'RUNNING' },
      data: {
        status: 'FAILED',
        stderr: `${reason} Gave up after ${job.attempts} attempts.`,
        finishedAt: new Date(),
      },
    });
  } else {
    await prisma.job.updateMany({
      where: { id: jobId, status: 'RUNNING' },
      data: { status: 'QUEUED', startedAt: null },
    });
  }
}

/** After a restart no agent is connected, so RUNNING jobs go back to the queue. */
export async function recoverRunningJobs() {
  const { count } = await prisma.job.updateMany({
    where: { status: 'RUNNING' },
    data: { status: 'QUEUED', startedAt: null },
  });
  return count;
}
