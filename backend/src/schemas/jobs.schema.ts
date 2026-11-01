import { z } from 'zod';
import { JobStatus } from '../generated/prisma/enums.js';

/** Limits shared by validation and documentation. */
export const JOB_LIMITS = {
  nameMaxLength: 100,
  sourceCodeMaxLength: 100_000,
  timeoutSecondsMin: 1,
  timeoutSecondsMax: 300,
  timeoutSecondsDefault: 60,
} as const;

/** Body accepted by POST /api/jobs. */
export const createJobSchema = z.object({
  name: z.string().trim().min(1).max(JOB_LIMITS.nameMaxLength),
  sourceCode: z.string().min(1).max(JOB_LIMITS.sourceCodeMaxLength),
  timeoutSeconds: z
    .number()
    .int()
    .min(JOB_LIMITS.timeoutSecondsMin)
    .max(JOB_LIMITS.timeoutSecondsMax)
    .default(JOB_LIMITS.timeoutSecondsDefault),
});

export type CreateJobInput = z.infer<typeof createJobSchema>;

/** Query string accepted by GET /api/jobs, e.g. ?status=RUNNING&limit=20 */
export const listJobsQuerySchema = z.object({
  status: z.enum(JobStatus).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ListJobsQuery = z.infer<typeof listJobsQuerySchema>;
