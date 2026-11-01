import { useEffect, useState } from 'react';
import { getCredits, type CreditStatement } from '../api/credits.ts';
import { errorMessage } from '../api/http.ts';
import { realtime } from '../realtime/connection.ts';

/** The user's balance and movements, reloaded whenever the backend says the balance changed. */
export function useCredits() {
  const [statement, setStatement] = useState<CreditStatement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getCredits()
      .then((data) => {
        if (cancelled) return;
        setStatement(data);
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
    const reload = () => setVersion((v) => v + 1);
    const unsubscribe = realtime.subscribe((message) => {
      if (message.type === 'credits-updated') reload();
    });
    // Changes made while the connection was down were missed: ask again
    const stopStatus = realtime.onStatusChange((status) => {
      if (status === 'online') reload();
    });
    return () => {
      unsubscribe();
      stopStatus();
    };
  }, []);

  return { statement, error };
}
