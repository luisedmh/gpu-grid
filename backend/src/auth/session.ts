import { SignJWT, jwtVerify } from 'jose';
import { config } from '../config.js';

/** Name of the cookie that carries the session. */
export const SESSION_COOKIE = 'gpugrid_session';
export const SESSION_DAYS = 7;

/** What the backend knows about the person making a request. */
export interface SessionUser {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
}

const secret = () => new TextEncoder().encode(config.jwtSecret);

/**
 * Creates a JWT: a signed piece of text that says "this is user X (an admin or not),
 * valid until Z". The server can later check the signature with its secret,
 * so nobody can forge or modify a token without knowing that secret.
 */
export function createSessionToken(user: SessionUser): Promise<string> {
  return new SignJWT({ name: user.name, email: user.email, isAdmin: user.isAdmin })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
}

/** Returns the user inside a valid token, or null if it is invalid or expired. */
export async function readSessionToken(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ['HS256'] });
    if (!payload.sub) return null;
    return {
      id: payload.sub,
      name: String(payload.name),
      email: String(payload.email),
      // Sessions from before unified accounts carry no isAdmin: they are not admins
      isAdmin: payload.isAdmin === true,
    };
  } catch {
    return null;
  }
}
