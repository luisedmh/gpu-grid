import { prisma } from '../lib/prisma.js';
import { NotFoundError } from '../lib/http-error.js';
import { JobStatus } from '../generated/prisma/enums.js';
import type { CreateJobInput, ListJobsQuery } from '../schemas/jobs.schema.js';

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

/** Lighter view used in lists: no outputs, which can be large. */
const jobSummaryFields = {
  id: true,
  name: true,
  status: true,
  exitCode: true,
  durationMs: true,
  attempts: true,
  createdAt: true,
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

/**
 * Most recent jobs first, optionally filtered by status,
 * plus how many jobs there are in each status (over all jobs, not just this page).
 */
export async function listJobs({ status, limit }: ListJobsQuery) {
  const [jobs, groups] = await Promise.all([
    prisma.job.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: jobSummaryFields,
    }),
    prisma.job.groupBy({ by: ['status'], _count: { _all: true } }),
  ]);

  // Start every status at 0, so statuses without jobs also appear
  const counts = Object.fromEntries(Object.values(JobStatus).map((s) => [s, 0])) as Record<
    JobStatus,
    number
  >;
  for (const group of groups) counts[group.status] = group._count._all;

  return { jobs, counts };
}
