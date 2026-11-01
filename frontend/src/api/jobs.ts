/**
 * Typed access to the backend's jobs API.
 * Mirrors what backend/src/services/jobs.service.ts returns.
 */

export type JobStatus =
  | 'PENDING'
  | 'COMPILING'
  | 'COMPILE_FAILED'
  | 'QUEUED'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'TIMED_OUT';

/** States after which a job never changes again. */
export const FINAL_STATUSES: readonly JobStatus[] = [
  'COMPILE_FAILED',
  'COMPLETED',
  'FAILED',
  'TIMED_OUT',
];

export interface Job {
  id: string;
  name: string;
  status: JobStatus;
  timeoutSeconds: number;
  compilerOutput: string | null;
  attempts: number;
  stdout: string | null;
  stderr: string | null;
  exitCode: number | null;
  durationMs: number | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface NewJob {
  name: string;
  sourceCode: string;
  timeoutSeconds: number;
}

/** An error answered by the API, with the per-field details of validation errors. */
export class ApiError extends Error {
  readonly status: number;
  readonly details: { field: string; message: string }[];

  constructor(message: string, status: number, details: { field: string; message: string }[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      body?.error ?? `Request failed (${response.status})`,
      response.status,
      body?.details,
    );
  }
  return body as T;
}

export function createJob(job: NewJob) {
  return request<Pick<Job, 'id' | 'status' | 'createdAt'>>('/api/jobs', {
    method: 'POST',
    body: JSON.stringify(job),
  });
}

export function getJob(id: string) {
  return request<Job>(`/api/jobs/${id}`);
}
