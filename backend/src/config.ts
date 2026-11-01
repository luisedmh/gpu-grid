import path from 'node:path';

/** Runtime settings, read once from environment variables (with defaults for development). */
export const config = {
  port: Number(process.env.PORT) || 3000,
  /** Where each job gets its own folder with the source code and the compiled binary. */
  jobsDir: path.resolve(process.env.JOBS_DIR ?? 'data/jobs'),
  /** Docker image that provides nvcc (built from compiler/Dockerfile). */
  compilerImage: process.env.COMPILER_IMAGE ?? 'gpugrid-compiler',
  /** Maximum time a single compilation may take. */
  compileTimeoutMs: Number(process.env.COMPILE_TIMEOUT_MS) || 120_000,
  /** How many compilations may run at the same time. */
  compileConcurrency: Number(process.env.COMPILE_CONCURRENCY) || 2,
  /** Secret used to sign session tokens (JWT). Anyone who knows it can forge sessions. */
  jwtSecret: process.env.JWT_SECRET ?? '',
  /** Send cookies only over HTTPS (enable in production). */
  secureCookies: process.env.NODE_ENV === 'production',
};
