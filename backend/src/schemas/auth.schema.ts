import { z } from 'zod';

const email = z.email().trim().toLowerCase().max(254);
const password = z.string().min(8, 'Use at least 8 characters').max(128);

/**
 * Body of POST /api/auth/register. Strict: unknown fields such as `isAdmin` are
 * rejected, so nobody can make themselves an administrator.
 */
export const registerSchema = z.strictObject({
  name: z.string().trim().min(1).max(100),
  email,
  password,
});

/** Body of POST /api/auth/login. */
export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(128),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
