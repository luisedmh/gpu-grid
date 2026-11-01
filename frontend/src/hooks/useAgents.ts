import { useEffect, useState } from 'react';
import { listAgents, type Agent } from '../api/agents.ts';
import { realtime } from '../realtime/connection.ts';

/** Connected providers, updated live as machines connect, disconnect or take jobs. */
export function useAgents() {
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const list = await listAgents();
        if (cancelled) return;
        setAgents(list);
        setError(null);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    };

    // The backend sends the whole list each time, so we can use it directly
    const unsubscribe = realtime.subscribe((message) => {
      if (message.type === 'agents-updated') setAgents(message.agents);
    });
    const stopStatus = realtime.onStatusChange((status) => {
      if (status === 'online') void load();
    });
    void load();

    return () => {
      cancelled = true;
      unsubscribe();
      stopStatus();
    };
  }, []);

  return { agents, error };
}
