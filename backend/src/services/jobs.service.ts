import type { SessionUser } from '../auth/session.js';
import { prisma } from '../lib/prisma.js';
import { NotFoundError } from '../lib/http-error.js';
import { JobStatus } from '../generated/prisma/enums.js';
import { creditEvents } from '../realtime/credit-events.js';
import { jobEvents } from '../realtime/job-events.js';
import type { CreateJobInput, ListJobsQuery } from '../schemas/jobs.schema.js';
import { maxJobCost, reserveForJob } from './credits.service.js';
import { jobSummaryFields, publicJobFields } from './job-fields.js';

/** A single job can be opened by its owner, or by an admin. */
function canOpen(viewer: SessionUser) {
  return viewer.isAdmin ? {} : { clientId: viewer.id };
}

/**
 * Stores a new job, PENDING until it is compiled, and reserves the most it can
 * cost. Both happen together or not at all: without credits, no job.
 */
export async function createJob(input: CreateJobInput, clientId: string) {
  const reservedCredits = maxJobCost(input.timeoutSeconds);
  const job = await prisma.$transaction(async (tx) => {
    const created = await tx.job.create({
      data: { ...input, clientId, reservedCredits },
      select: { id: true, status: true, reservedCredits: true, createdAt: true },
    });
    await reserveForJob(tx, clientId, created.id, reservedCredits);
    return created;
  });
  jobEvents.notify(job.id);
  creditEvents.notify(clientId);
  return job;
}

/**
 * Returns the public view of a job, or throws NotFoundError.
 * Someone else's job is also "not found": we do not even reveal that it exists.
 */
export async function getJob(id: string, viewer: SessionUser) {
  const job = await prisma.job.findFirst({
    where: { id, ...canOpen(viewer) },
    select: publicJobFields,
  });
  if (!job) throw new NotFoundError(`Job ${id} not found`);
  return job;
}

/**
 * The viewer's own jobs, most recent first, optionally filtered by status, plus how
 * many they have in each status (over all of them, not just this page).
 * Admins also see only their own here: everyone's jobs are in the admin panel.
 */
export async function listJobs({ status, limit }: ListJobsQuery, viewer: SessionUser) {
  const visible = { clientId: viewer.id };
  const [jobs, groups] = await Promise.all([
    prisma.job.findMany({
      where: status ? { ...visible, status } : visible,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: jobSummaryFields,
    }),
    prisma.job.groupBy({ by: ['status'], where: visible, _count: { _all: true } }),
  ]);

  // Start every status at 0, so statuses without jobs also appear
  const counts = Object.fromEntries(Object.values(JobStatus).map((s) => [s, 0])) as Record<
    JobStatus,
    number
  >;
  for (const group of groups) counts[group.status] = group._count._all;

  return { jobs, counts };
}
