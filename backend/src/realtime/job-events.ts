import { EventEmitter } from 'node:events';
import { prisma } from '../lib/prisma.js';
import { publicJobFields } from '../services/job-fields.js';

/** A job as clients see it (same shape as GET /api/jobs/:id). */
export type PublicJob = NonNullable<Awaited<ReturnType<typeof findPublicJob>>>;

function findPublicJob(jobId: string) {
  return prisma.job.findUnique({ where: { id: jobId }, select: publicJobFields });
}

/**
 * In-process event bus: services announce that a job changed,
 * and whoever is interested (the browsers' WebSocket server) listens.
 * The services do not need to know who is listening.
 */
class JobEvents extends EventEmitter<{ 'job-updated': [PublicJob] }> {
  /** Reads the latest state of the job and announces it. Never throws. */
  notify(jobId: string): void {
    if (this.listenerCount('job-updated') === 0) return;
    findPublicJob(jobId)
      .then((job) => {
        if (job) this.emit('job-updated', job);
      })
      .catch((err) => console.error(`Could not announce update of job ${jobId}:`, err));
  }
}

export const jobEvents = new JobEvents();
