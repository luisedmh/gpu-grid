import { createHash, randomBytes } from 'node:crypto';

const PREFIX = 'ggm_';

/**
 * Creates the secret token a machine uses to connect. It is long and random
 * (256 bits), so a plain SHA-256 is enough to store it safely: unlike a
 * password, it cannot be guessed. (Passwords need a slow hash like scrypt.)
 */
export function generateMachineToken() {
  const token = PREFIX + randomBytes(32).toString('base64url');
  return { token, hash: hashMachineToken(token), prefix: token.slice(0, PREFIX.length + 6) };
}

export function hashMachineToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Extracts the token from an "Authorization: Bearer <token>" header. */
export function bearerToken(header: string | undefined): string | null {
  return header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
}
