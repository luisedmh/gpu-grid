import type { Express } from 'express';
import request from 'supertest';
import { createSessionToken, SESSION_COOKIE } from '../src/auth/session.js';
import type { Role } from '../src/generated/prisma/enums.js';
import { prisma } from '../src/lib/prisma.js';

let counter = 0;

/** Creates a user directly in the database. */
export function createUser(role: Role = 'CLIENT') {
  counter++;
  return prisma.user.create({
    data: {
      name: `${role.toLowerCase()} ${counter}`,
      email: `${role.toLowerCase()}${counter}-${Date.now()}@test.dev`,
      passwordHash: 'not-used-in-tests',
      role,
    },
  });
}

/** Cookie header that logs a user in, for raw HTTP or WebSocket requests. */
export async function sessionCookie(user: { id: string; name: string; email: string; role: Role }) {
  return `${SESSION_COOKIE}=${await createSessionToken(user)}`;
}

/** A supertest client that sends every request as the given user. */
export async function loggedIn(app: Express, role: Role = 'CLIENT') {
  const user = await createUser(role);
  const cookie = await sessionCookie(user);
  const as = (method: 'get' | 'post', path: string) =>
    request(app)[method](path).set('Cookie', cookie);
  return {
    user,
    cookie,
    get: (path: string) => as('get', path),
    post: (path: string) => as('post', path),
  };
}

/** Removes all users, and with them all their jobs. */
export function resetDatabase() {
  return prisma.$transaction([prisma.job.deleteMany(), prisma.user.deleteMany()]);
}
