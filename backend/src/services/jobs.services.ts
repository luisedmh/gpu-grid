import { prisma } from '../lib/prisma.js';
import { NotFoundError } from '../lib/http-error.js';
import type { CreateJobInput } from '../schemas/jobs.schema.js';

/**
 * Fields of a job that clients are allowed to see.
 * Internal details (such as where the binary is stored) stay private.
 */
const publicJobFields = {
  id: true,
  name: true,
  status: true,
  timeoutSeconds: true,
  compilerOutput: true,
  attempts: true,
  stdout: true,
  stderr: true,
  exitCode: true,
  durationMs: true,
  createdAt: true,
  updatedAt: true,
  startedAt: true,
  finishedAt: true,
} as const;

/** Stores a new job. It starts as PENDING, waiting to be compiled. */
export async function createJob(input: CreateJobInput) {
  return prisma.job.create({
    data: input,
    select: { id: true, status: true, createdAt: true },
  });
}

/** Returns the public view of a job, or throws NotFoundError. */
export async function getJob(id: string) {
  const job = await prisma.job.findUnique({ where: { id }, select: publicJobFields });
  if (!job) throw new NotFoundError(`Job ${id} not found`);
  return job;
}
