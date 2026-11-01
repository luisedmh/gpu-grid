import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDockerCompiler } from '../src/compiler/docker-compiler.js';

/**
 * Uses the real gpugrid-compiler image. Needs Docker and the image built,
 * so it only runs with DOCKER_TESTS=1 (npm run test:docker).
 */
describe.skipIf(!process.env.DOCKER_TESTS)('Docker compiler', () => {
  const compile = createDockerCompiler({ image: 'gpugrid-compiler', timeoutMs: 120_000 });
  let workDir: string;

  afterEach(async () => {
    await rm(workDir, { recursive: true, force: true });
  });

  async function prepare(source: string) {
    workDir = await mkdtemp(path.join(tmpdir(), 'gpugrid-compile-'));
    await writeFile(path.join(workDir, 'main.cu'), source);
  }

  it('compiles a valid program into a binary', async () => {
    await prepare('__global__ void k() {}\nint main() { k<<<1, 1>>>(); return 0; }\n');

    const result = await compile(workDir);

    expect(result.success).toBe(true);
    expect((await stat(path.join(workDir, 'program'))).isFile()).toBe(true);
  }, 180_000);

  it('reports nvcc errors for an invalid program', async () => {
    await prepare('int main() { return undefined_variable; }\n');

    const result = await compile(workDir);

    expect(result.success).toBe(false);
    expect(result.output).toMatch(/undefined_variable/);
  }, 180_000);
});
