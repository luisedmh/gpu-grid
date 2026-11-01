import { request } from './http.ts';

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
  /** Null for verification jobs, which the platform creates */
  clientId: string | null;
  status: JobStatus;
  timeoutSeconds: number;
  compilerOutput: string | null;
  attempts: number;
  stdout: string | null;
  stderr: string | null;
  exitCode: number | null;
  durationMs: number | null;
  /** Credits held when it was submitted: the most it can cost */
  reservedCredits: number;
  /** What it finally cost, once finished */
  costCredits: number | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

/** Lighter version of a job returned by the list endpoint. */
export type JobSummary = Pick<
  Job,
  | 'id'
  | 'name'
  | 'status'
  | 'exitCode'
  | 'durationMs'
  | 'attempts'
  | 'costCredits'
  | 'createdAt'
  | 'finishedAt'
>;

export interface JobList {
  jobs: JobSummary[];
  /** Number of jobs in each status, over all jobs. */
  counts: Record<JobStatus, number>;
}

export interface NewJob {
  name: string;
  sourceCode: string;
  timeoutSeconds: number;
}

export function createJob(job: NewJob) {
  return request<Pick<Job, 'id' | 'status' | 'reservedCredits' | 'createdAt'>>('/api/jobs', {
    method: 'POST',
    body: JSON.stringify(job),
  });
}

export function getJob(id: string) {
  return request<Job>(`/api/jobs/${id}`);
}

export function listJobs() {
  return request<JobList>('/api/jobs?limit=100');
}
