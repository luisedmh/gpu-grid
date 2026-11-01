import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '../api/http.ts';
import { realtime } from '../realtime/connection.ts';

/**
 * Loads data from the API and loads it again whenever anything changes on the
 * platform (any live message), so admin screens stay up to date by themselves.
 * Bursts of messages are grouped into a single reload.
 */
export function useLiveData<T>(load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((value) => {
        if (cancelled) return;
        setData(value);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [load, version]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const scheduleReload = () => {
      clearTimeout(timer);
      timer = setTimeout(reload, 400);
    };
    const unsubscribe = realtime.subscribe(scheduleReload);
    const stopStatus = realtime.onStatusChange((status) => {
      if (status === 'online') reload();
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
      stopStatus();
    };
  }, [reload]);

  return { data, error, reload };
}
