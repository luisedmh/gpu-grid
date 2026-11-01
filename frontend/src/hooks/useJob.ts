import { useEffect, useState } from 'react';
import { getJob, type Job } from '../api/jobs.ts';
import { realtime } from '../realtime/connection.ts';

interface Snapshot {
  jobId: string;
  job: Job | null;
  error: string | null;
}

/**
 * A job, kept up to date in real time: loaded once from the API,
 * then replaced every time the backend pushes a new version of it.
 */
export function useJob(jobId: string | null) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;

    const load = async () => {
      try {
        const job = await getJob(jobId);
        if (!cancelled) setSnapshot({ jobId, job, error: null });
      } catch (err) {
        if (!cancelled) setSnapshot({ jobId, job: null, error: (err as Error).message });
      }
    };

    const unsubscribe = realtime.subscribe((message) => {
      if (message.type === 'job-updated' && message.job.id === jobId) {
        setSnapshot({ jobId, job: message.job, error: null });
      }
    });
    // After a reconnection, reload: updates sent while offline were missed
    const stopStatus = realtime.onStatusChange((status) => {
      if (status === 'online') void load();
    });
    void load();

    return () => {
      cancelled = true;
      unsubscribe();
      stopStatus();
    };
  }, [jobId]);

  // Only return data that belongs to the job being followed now
  const current = snapshot?.jobId === jobId ? snapshot : null;
  return { job: current?.job ?? null, error: current?.error ?? null };
}
