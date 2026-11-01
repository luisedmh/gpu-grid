import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

/** SHA-256 of a file, in hex: a fingerprint that changes if a single byte changes. */
export async function fileSha256(filePath: string): Promise<string> {
  return createHash('sha256')
    .update(await readFile(filePath))
    .digest('hex');
}
