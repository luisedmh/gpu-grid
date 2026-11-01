import { useEffect, useState } from 'react';

type Status = 'checking' | 'online' | 'offline';

/** Small indicator that asks the backend whether it is alive every 10 seconds. */
export function BackendStatus() {
  const [status, setStatus] = useState<Status>('checking');

  useEffect(() => {
    const check = async () => {
      try {
        const response = await fetch('/api/health');
        setStatus(response.ok ? 'online' : 'offline');
      } catch {
        setStatus('offline');
      }
    };

    void check();
    const timer = setInterval(check, 10_000);
    // Cleanup: stop polling when the component disappears
    return () => clearInterval(timer);
  }, []);

  const styles: Record<Status, { dot: string; label: string }> = {
    checking: { dot: 'bg-slate-400', label: 'Checking backend…' },
    online: { dot: 'bg-emerald-400', label: 'Backend online' },
    offline: { dot: 'bg-red-400', label: 'Backend offline' },
  };

  return (
    <div className="flex items-center gap-2 text-xs text-slate-400">
      <span className={`size-2 rounded-full ${styles[status].dot}`} />
      {styles[status].label}
    </div>
  );
}
