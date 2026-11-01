import { prisma } from '../lib/prisma.js';
import type { JobResult } from '../agents/protocol.js';
import { creditEvents } from '../realtime/credit-events.js';
import { jobEvents } from '../realtime/job-events.js';
import { gpuTimeCost, settleJob } from './credits.service.js';

/** A job may be retried on another provider this many times before it fails for good. */
export const MAX_ATTEMPTS = 3;

/**
 * Takes the oldest QUEUED job and marks it RUNNING on the given machine, atomically.
 * Returns null when there is nothing to run.
 */
export async function claimNextJob(machineId: string) {
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
      data: {
        status: 'RUNNING',
        machineId,
        startedAt: new Date(),
        attempts: { increment: 1 },
      },
    });
    if (claimed.count === 1) {
      jobEvents.notify(next.id);
      return prisma.job.findUniqueOrThrow({
        where: { id: next.id },
        select: { id: true, timeoutSeconds: true, binaryPath: true },
      });
    }
  }
  return null;
}

/**
 * Stores what the provider reported, moves the job to its final state and
 * charges the GPU time it used.
 */
export async function saveResult(jobId: string, result: JobResult) {
  const status = result.timedOut ? 'TIMED_OUT' : result.exitCode === 0 ? 'COMPLETED' : 'FAILED';
  // No exit code without a timeout means the agent could not run the program at all:
  // the client is not charged for the provider's problem
  const cost = result.exitCode === null && !result.timedOut ? 0 : gpuTimeCost(result.durationMs);

  const changed = await prisma.$transaction(async (tx) => {
    const finished = await tx.job.updateMany({
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
    return finished.count === 1 ? settleJob(tx, jobId, cost) : [];
  });
  jobEvents.notify(jobId);
  creditEvents.notify(...changed);
}

/**
 * The provider running this job is gone. The job goes back to the queue,
 * unless it has already used all its attempts.
 */
export async function releaseJob(jobId: string, reason: string) {
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { attempts: true } });
  if (!job) return;

  if (job.attempts >= MAX_ATTEMPTS) {
    // The job never finished anywhere, so it costs nothing: all credits go back
    const changed = await prisma.$transaction(async (tx) => {
      const failed = await tx.job.updateMany({
        where: { id: jobId, status: 'RUNNING' },
        data: {
          status: 'FAILED',
          stderr: `${reason} Gave up after ${job.attempts} attempts.`,
          finishedAt: new Date(),
        },
      });
      return failed.count === 1 ? settleJob(tx, jobId, 0) : [];
    });
    creditEvents.notify(...changed);
  } else {
    await prisma.job.updateMany({
      where: { id: jobId, status: 'RUNNING' },
      data: { status: 'QUEUED', startedAt: null },
    });
  }
  jobEvents.notify(jobId);
}

/** After a restart no agent is connected, so RUNNING jobs go back to the queue. */
export async function recoverRunningJobs() {
  const { count } = await prisma.job.updateMany({
    where: { status: 'RUNNING' },
    data: { status: 'QUEUED', startedAt: null },
  });
  return count;
}

/** Whether a machine is still registered (it may have been deleted while connected). */
export async function machineExists(machineId: string) {
  return (await prisma.machine.count({ where: { id: machineId } })) > 0;
}
