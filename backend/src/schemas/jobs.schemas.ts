import { z } from 'zod';

/** Limits shared by validation and documentation. */
export const JOB_LIMITS = {
  nameMaxLength: 100,
  sourceCodeMaxLength: 100_000,
  timeoutSecondsMin: 1,
  timeoutSecondsMax: 300,
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
    .optional(),
});

export type CreateJobInput = z.infer<typeof createJobSchema>;
