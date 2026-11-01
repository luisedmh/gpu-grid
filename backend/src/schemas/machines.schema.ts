import { z } from 'zod';

/** Body of POST /api/machines. */
export const createMachineSchema = z.object({
  name: z.string().trim().min(1).max(100),
});
