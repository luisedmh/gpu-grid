import { useConnectionStatus } from '../realtime/useConnectionStatus.ts';
import type { ConnectionStatus } from '../realtime/connection.ts';

const STYLES: Record<ConnectionStatus, { dot: string; label: string }> = {
  connecting: { dot: 'bg-slate-400', label: 'Connecting…' },
  online: { dot: 'bg-emerald-400', label: 'Live updates on' },
  offline: { dot: 'bg-red-400', label: 'Backend offline' },
};

/** Shows whether the live connection with the backend is up. */
export function BackendStatus() {
  const status = useConnectionStatus();
  const { dot, label } = STYLES[status];

  return (
    <div className="flex items-center gap-2 text-xs text-slate-400">
      <span
        className={`size-2 rounded-full ${dot} ${status === 'online' ? 'animate-pulse' : ''}`}
      />
      {label}
    </div>
  );
}
