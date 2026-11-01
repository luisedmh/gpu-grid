import type { Request, Response } from 'express';
import {
  createSessionToken,
  SESSION_COOKIE,
  SESSION_DAYS,
  type SessionUser,
} from '../auth/session.js';
import { config } from '../config.js';
import { HttpError } from '../lib/http-error.js';
import { loginSchema, registerSchema } from '../schemas/auth.schema.js';
import * as authService from '../services/auth.service.js';

/**
 * The session token travels in a cookie the browser sends automatically.
 * httpOnly: page scripts cannot read it, so injected JavaScript cannot steal it.
 * sameSite strict: other websites cannot make the browser send it.
 */
async function startSession(res: Response, user: SessionUser) {
  res.cookie(SESSION_COOKIE, await createSessionToken(user), {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.secureCookies,
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

/** POST /api/auth/register */
export async function register(req: Request, res: Response) {
  const user = await authService.register(registerSchema.parse(req.body));
  await startSession(res, user);
  res.status(201).json(user);
}

/** POST /api/auth/login */
export async function login(req: Request, res: Response) {
  const user = await authService.login(loginSchema.parse(req.body));
  await startSession(res, user);
  res.json(user);
}

/** POST /api/auth/logout */
export function logout(_req: Request, res: Response) {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.status(204).end();
}

/** GET /api/auth/me — who is logged in. */
export function me(req: Request, res: Response) {
  if (!req.user) throw new HttpError(401, 'Not logged in');
  res.json(req.user);
}
