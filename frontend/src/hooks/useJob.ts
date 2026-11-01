import { useEffect, useState } from 'react';
import { FINAL_STATUSES, getJob, type Job } from '../api/jobs.ts';

interface Snapshot {
  jobId: string;
  job: Job | null;
  error: string | null;
}

/**
 * Follows a job until it reaches a final state, asking the backend every second.
 * (Later we will replace polling with real-time updates over WebSocket.)
 */
export function useJob(jobId: string | null) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const job = await getJob(jobId);
        if (cancelled) return;
        setSnapshot({ jobId, job, error: null });
        if (FINAL_STATUSES.includes(job.status)) return;
      } catch (err) {
        if (cancelled) return;
        setSnapshot((prev) => ({
          jobId,
          job: prev?.jobId === jobId ? prev.job : null,
          error: (err as Error).message,
        }));
      }
      timer = setTimeout(poll, 1000);
    };

    void poll();

    // Stop polling if the job changes or the page is left
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [jobId]);

  // Only return data that belongs to the job being followed now
  const current = snapshot?.jobId === jobId ? snapshot : null;
  return { job: current?.job ?? null, error: current?.error ?? null };
}
