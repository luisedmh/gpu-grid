import { useEffect, useState } from 'react';
import { listJobs, type JobList } from '../api/jobs.ts';

/**
 * The list of jobs, refreshed every few seconds so states keep moving.
 * (Later we will replace polling with real-time updates over WebSocket.)
 */
export function useJobList(intervalMs = 3000) {
  const [data, setData] = useState<JobList | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const list = await listJobs();
        if (cancelled) return;
        setData(list);
        setError(null);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    };

    void load();
    const timer = setInterval(load, intervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [intervalMs]);

  return { data, error };
}
