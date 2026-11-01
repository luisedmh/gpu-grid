import { useEffect, useState } from 'react';
import { realtime, type ConnectionStatus } from './connection.ts';

/** Whether the live connection with the backend is up. */
export function useConnectionStatus() {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  useEffect(() => realtime.onStatusChange(setStatus), []);
  return status;
}
