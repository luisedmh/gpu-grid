import { useEffect, useState } from 'react';
import { listJobs, type JobList } from '../api/jobs.ts';
import { realtime } from '../realtime/connection.ts';

/**
 * The list of jobs, reloaded whenever the backend announces that a job changed.
 * Several changes in a row (a job compiling, then queued, then running…)
 * are grouped into a single reload.
 */
export function useJobList() {
  const [data, setData] = useState<JobList | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let pending: ReturnType<typeof setTimeout> | undefined;

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

    const scheduleLoad = () => {
      clearTimeout(pending);
      pending = setTimeout(load, 200);
    };

    const unsubscribe = realtime.subscribe(scheduleLoad);
    // After a reconnection, reload: updates sent while offline were missed
    const stopStatus = realtime.onStatusChange((status) => {
      if (status === 'online') void load();
    });
    void load();

    return () => {
      cancelled = true;
      clearTimeout(pending);
      unsubscribe();
      stopStatus();
    };
  }, []);

  return { data, error };
}
