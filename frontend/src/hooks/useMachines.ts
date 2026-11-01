import { useCallback, useEffect, useState } from 'react';
import { listMachines, type Machine } from '../api/machines.ts';
import { errorMessage } from '../api/http.ts';
import { realtime } from '../realtime/connection.ts';

/** The user's machines, reloaded whenever one connects, disconnects or takes a job. */
export function useMachines() {
  const [machines, setMachines] = useState<Machine[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  /** Asks for the list again (after adding or deleting a machine). */
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let cancelled = false;
    listMachines()
      .then((list) => {
        if (cancelled) return;
        setMachines(list);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [version]);

  useEffect(() => {
    // The live message only says that something changed: the list itself comes from the API,
    // which also knows the machines that are offline
    const unsubscribe = realtime.subscribe((message) => {
      if (message.type === 'agents-updated') reload();
    });
    const stopStatus = realtime.onStatusChange((status) => {
      if (status === 'online') reload();
    });
    return () => {
      unsubscribe();
      stopStatus();
    };
  }, [reload]);

  return { machines, error, reload };
}
