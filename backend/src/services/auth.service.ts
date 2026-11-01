import type { SessionUser } from '../auth/session.js';
import { HttpError } from '../lib/http-error.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { prisma } from '../lib/prisma.js';
import type { LoginInput, RegisterInput } from '../schemas/auth.schema.js';

const userFields = { id: true, name: true, email: true, role: true } as const;

/** A valid hash of a random password, used to spend the same time when an email does not exist. */
const dummyHash = hashPassword('not-a-real-password');

export async function register(input: RegisterInput): Promise<SessionUser> {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new HttpError(409, 'An account with this email already exists');

  return prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      role: input.role,
      passwordHash: await hashPassword(input.password),
    },
    select: userFields,
  });
}

export async function login(input: LoginInput): Promise<SessionUser> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });

  // Check a hash even when the email is unknown, so the response time does not
  // reveal which emails have an account
  const valid = await verifyPassword(input.password, user?.passwordHash ?? (await dummyHash));
  if (!user || !valid) throw new HttpError(401, 'Wrong email or password');

  return { id: user.id, name: user.name, email: user.email, role: user.role };
}
