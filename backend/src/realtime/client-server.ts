import { parseCookie } from 'cookie';
import { WebSocketServer, type WebSocket } from 'ws';
import type { AgentSummary } from '../agents/scheduler.js';
import { readSessionToken, SESSION_COOKIE, type SessionUser } from '../auth/session.js';
import { agentEvents } from './agent-events.js';
import { jobEvents, type PublicJob } from './job-events.js';
import { keepAlive, type UpgradeHandler } from './upgrade.js';

export const CLIENT_WS_PATH = '/ws/client';

/** Messages pushed to browsers. */
export type ClientMessage =
  { type: 'job-updated'; job: PublicJob } | { type: 'agents-updated'; agents: AgentSummary[] };

/**
 * WebSocket endpoint for logged-in browsers. Each change is pushed only to
 * the people allowed to see it: a job to its owner, providers to providers.
 * Admins receive everything.
 */
export function createClientServer(options: { heartbeatMs?: number } = {}): UpgradeHandler {
  const wss = new WebSocketServer({ noServer: true });
  const heartbeatMs = options.heartbeatMs ?? 30_000;
  const users = new WeakMap<WebSocket, SessionUser>();

  const sendTo = (canSee: (user: SessionUser) => boolean, message: ClientMessage) => {
    const data = JSON.stringify(message);
    for (const client of wss.clients) {
      const user = users.get(client);
      if (user && client.readyState === client.OPEN && canSee(user)) client.send(data);
    }
  };

  jobEvents.on('job-updated', (job) =>
    sendTo((user) => user.role === 'ADMIN' || user.id === job.clientId, {
      type: 'job-updated',
      job,
    }),
  );
  agentEvents.on('agents-updated', (agents) =>
    sendTo((user) => user.role === 'ADMIN' || user.role === 'PROVIDER', {
      type: 'agents-updated',
      agents,
    }),
  );

  return (req, socket, head) => {
    // The browser sends the session cookie with the connection request
    const token = parseCookie(req.headers.cookie ?? '')[SESSION_COOKIE];
    readSessionToken(token)
      .then((user) => {
        if (!user) {
          socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
          socket.destroy();
          return;
        }
        wss.handleUpgrade(req, socket, head, (ws) => {
          users.set(ws, user);
          const stopHeartbeat = keepAlive(ws, heartbeatMs);
          ws.on('close', stopHeartbeat);
          ws.on('error', (err) => console.error('Client connection error:', err.message));
        });
      })
      .catch(() => socket.destroy());
  };
}
