import { timingSafeEqual } from 'node:crypto';

/**
 * Checks an "Authorization: Bearer <token>" header against the expected token.
 * timingSafeEqual takes the same time whether the first or the last character
 * differs, so the token cannot be guessed by measuring response times.
 */
export function isValidAgentToken(header: string | undefined, expected: string): boolean {
  if (!expected || !header?.startsWith('Bearer ')) return false;
  const given = Buffer.from(header.slice('Bearer '.length));
  const wanted = Buffer.from(expected);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}
