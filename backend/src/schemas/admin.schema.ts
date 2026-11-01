import { z } from 'zod';
import { JobStatus } from '../generated/prisma/enums.js';

/** Body of POST /api/admin/users/:id/credits. */
export const grantCreditsSchema = z.object({
  amount: z.number().int().min(1).max(1_000_000),
});

/** Body of PATCH /api/admin/users/:id. */
export const updateUserSchema = z.object({
  isAdmin: z.boolean(),
});

/** Query of GET /api/admin/jobs. */
export const adminJobsQuerySchema = z.object({
  status: z.enum(JobStatus).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export type AdminJobsQuery = z.infer<typeof adminJobsQuerySchema>;
