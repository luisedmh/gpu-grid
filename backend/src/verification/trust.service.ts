import { NotFoundError } from '../lib/http-error.js';
import { prisma } from '../lib/prisma.js';
import { jobEvents } from '../realtime/job-events.js';
import { generateCheck } from './check-program.js';

/** A verification job runs in about a second; this leaves plenty of margin. */
export const CHECK_TIMEOUT_SECONDS = 30;

/** States in which a verification job is still on its way. */
const OPEN_STATUSES = ['PENDING', 'COMPILING', 'QUEUED', 'RUNNING'] as const;

/** Whether a machine already has a verification job on its way. */
export async function hasOpenCheck(machineId: string): Promise<boolean> {
  const open = await prisma.job.count({
    where: { kind: 'CHECK', targetMachineId: machineId, status: { in: [...OPEN_STATUSES] } },
  });
  return open > 0;
}

/** A machine needs a first check if it has never passed one, is not suspended and has none on its way. */
export async function needsFirstCheck(machineId: string): Promise<boolean> {
  const machine = await prisma.machine.findUnique({
    where: { id: machineId },
    select: { verifiedAt: true, suspendedAt: true },
  });
  if (!machine || machine.verifiedAt || machine.suspendedAt) return false;
  return !(await hasOpenCheck(machineId));
}

/**
 * Prepares a verification job for one machine. It still has to be compiled,
 * like any other job. It costs nobody anything and pays nothing.
 */
export async function createCheck(machineId: string): Promise<string> {
  const { sourceCode, expectedOutput } = generateCheck();
  const job = await prisma.job.create({
    data: {
      kind: 'CHECK',
      // A name that does not stand out among other jobs
      name: 'Job',
      sourceCode,
      expectedOutput,
      targetMachineId: machineId,
      timeoutSeconds: CHECK_TIMEOUT_SECONDS,
    },
    select: { id: true },
  });
  jobEvents.notify(job.id);
  return job.id;
}

export type CheckVerdict =
  { machineId: string; passed: true } | { machineId: string; passed: false; reason: string };

/**
 * If the job is a finished verification job, compares its output with the
 * expected answer and records the outcome on the machine: a pass makes it
 * verified, anything else suspends it. Returns null for any other job.
 */
export async function evaluateCheck(jobId: string): Promise<CheckVerdict | null> {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      kind: true,
      status: true,
      stdout: true,
      expectedOutput: true,
      targetMachineId: true,
    },
  });
  if (!job || job.kind !== 'CHECK' || !job.targetMachineId) return null;
  if ((OPEN_STATUSES as readonly string[]).includes(job.status)) return null;
  const machineId = job.targetMachineId;

  const lines = (job.stdout ?? '').split('\n').map((line) => line.trim());
  const passed = job.status === 'COMPLETED' && lines.includes(job.expectedOutput ?? '');

  if (passed) {
    const machine = await prisma.machine.findUniqueOrThrow({
      where: { id: machineId },
      select: { verifiedAt: true },
    });
    await prisma.machine.update({
      where: { id: machineId },
      data: { checksPassed: { increment: 1 }, verifiedAt: machine.verifiedAt ?? new Date() },
    });
    return { machineId, passed: true };
  }

  const reason =
    job.status === 'COMPLETED'
      ? 'It returned a wrong result in a verification job.'
      : job.status === 'TIMED_OUT'
        ? 'It did not finish a verification job in time.'
        : 'It could not run a verification job.';
  await prisma.machine.update({
    where: { id: machineId },
    data: { checksFailed: { increment: 1 }, suspendedAt: new Date(), suspensionReason: reason },
  });
  return { machineId, passed: false, reason };
}

/** Lets a suspended machine connect again. It must pass a new verification first. */
export async function reinstateMachine(machineId: string) {
  const { count } = await prisma.machine.updateMany({
    where: { id: machineId },
    data: { suspendedAt: null, suspensionReason: null, verifiedAt: null },
  });
  if (count === 0) throw new NotFoundError('Machine not found');
}
