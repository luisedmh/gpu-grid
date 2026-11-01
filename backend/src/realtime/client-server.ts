import { WebSocketServer, type WebSocket } from 'ws';
import { jobEvents, type PublicJob } from './job-events.js';
import { keepAlive, type UpgradeHandler } from './upgrade.js';

export const CLIENT_WS_PATH = '/ws/client';

/** Messages pushed to browsers. */
export type ClientMessage = { type: 'job-updated'; job: PublicJob };

/**
 * WebSocket endpoint for browsers: every time a job changes state,
 * the new version is pushed to all connected browsers at once.
 */
export function createClientServer(options: { heartbeatMs?: number } = {}): UpgradeHandler {
  const wss = new WebSocketServer({ noServer: true });
  const heartbeatMs = options.heartbeatMs ?? 30_000;

  const broadcast = (message: ClientMessage) => {
    const data = JSON.stringify(message);
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) client.send(data);
    }
  };

  jobEvents.on('job-updated', (job) => broadcast({ type: 'job-updated', job }));

  wss.on('connection', (ws: WebSocket) => {
    const stopHeartbeat = keepAlive(ws, heartbeatMs);
    ws.on('close', stopHeartbeat);
    ws.on('error', (err) => console.error('Client connection error:', err.message));
  });

  return (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  };
}
