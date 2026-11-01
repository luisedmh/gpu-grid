/**
 * Fields of a job that clients are allowed to see.
 * Internal details (such as where the binary is stored) stay private.
 */
export const publicJobFields = {
  id: true,
  name: true,
  clientId: true,
  status: true,
  timeoutSeconds: true,
  compilerOutput: true,
  attempts: true,
  stdout: true,
  stderr: true,
  exitCode: true,
  durationMs: true,
  createdAt: true,
  updatedAt: true,
  startedAt: true,
  finishedAt: true,
} as const;

/** Lighter view used in lists: no outputs, which can be large. */
export const jobSummaryFields = {
  id: true,
  name: true,
  status: true,
  exitCode: true,
  durationMs: true,
  attempts: true,
  createdAt: true,
  finishedAt: true,
} as const;
