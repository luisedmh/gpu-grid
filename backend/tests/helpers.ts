import type { Express } from 'express';
import request from 'supertest';
import { createSessionToken, SESSION_COOKIE } from '../src/auth/session.js';
import { generateMachineToken } from '../src/lib/machine-token.js';
import { prisma } from '../src/lib/prisma.js';

let counter = 0;

/**
 * What a test user is used for. Every account can submit jobs and offer machines;
 * the label only names the user in the test and decides their starting balance.
 */
export type TestUserKind = 'CLIENT' | 'PROVIDER' | 'ADMIN';

/** Credits test users start with, so they can submit jobs. */
export const TEST_CLIENT_BALANCE = 10_000;

/**
 * Creates a user directly in the database. "Providers" start at 0 credits, so tests
 * can check exactly what they earn; everyone else starts with some credits.
 */
export function createUser(
  kind: TestUserKind = 'CLIENT',
  balance = kind === 'PROVIDER' ? 0 : TEST_CLIENT_BALANCE,
) {
  counter++;
  return prisma.user.create({
    data: {
      name: `${kind.toLowerCase()} ${counter}`,
      email: `${kind.toLowerCase()}${counter}-${Date.now()}@test.dev`,
      passwordHash: 'not-used-in-tests',
      isAdmin: kind === 'ADMIN',
      balance,
    },
  });
}

/** Cookie header that logs a user in, for raw HTTP or WebSocket requests. */
export async function sessionCookie(user: {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
}) {
  return `${SESSION_COOKIE}=${await createSessionToken(user)}`;
}

/** A supertest client that sends every request as the given user. */
export async function loggedIn(app: Express, kind: TestUserKind = 'CLIENT') {
  const user = await createUser(kind);
  const cookie = await sessionCookie(user);
  const as = (method: 'get' | 'post' | 'patch' | 'delete', path: string) =>
    request(app)[method](path).set('Cookie', cookie);
  return {
    user,
    cookie,
    get: (path: string) => as('get', path),
    post: (path: string) => as('post', path),
    patch: (path: string) => as('patch', path),
    delete: (path: string) => as('delete', path),
  };
}

/** Registers a machine for a provider and returns it with its secret token. */
export async function createMachine(ownerId: string, name = 'test-machine') {
  const { token, hash, prefix } = generateMachineToken();
  const machine = await prisma.machine.create({
    data: { name, ownerId, tokenHash: hash, tokenPrefix: prefix },
  });
  return { machine, token };
}

/** Removes all users, and with them all their jobs and machines. */
export function resetDatabase() {
  return prisma.$transaction([prisma.job.deleteMany(), prisma.user.deleteMany()]);
}
