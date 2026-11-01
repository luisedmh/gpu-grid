import type { NextFunction, Request, Response } from 'express';
import { parseCookie } from 'cookie';
import { readSessionToken, SESSION_COOKIE } from '../auth/session.js';
import { HttpError } from '../lib/http-error.js';

/** Reads the session cookie of any request and, if valid, sets req.user. */
export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  const cookies = parseCookie(req.headers.cookie ?? '');
  const user = await readSessionToken(cookies[SESSION_COOKIE]);
  if (user) req.user = user;
  next();
}

/** Only lets through logged-in users. */
export function requireAuth() {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new HttpError(401, 'You need to log in');
    next();
  };
}

/** Only lets through administrators. */
export function requireAdmin() {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new HttpError(401, 'You need to log in');
    if (!req.user.isAdmin) throw new HttpError(403, 'You do not have permission to do this');
    next();
  };
}
