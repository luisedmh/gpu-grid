import { parseCookie } from 'cookie';
import { WebSocketServer, type WebSocket } from 'ws';
import type { AgentSummary } from '../agents/scheduler.js';
import { readSessionToken, SESSION_COOKIE, type SessionUser } from '../auth/session.js';
import { agentEvents } from './agent-events.js';
import { creditEvents } from './credit-events.js';
import { jobEvents, type PublicJob } from './job-events.js';
import { keepAlive, type UpgradeHandler } from './upgrade.js';

export const CLIENT_WS_PATH = '/ws/client';

/** Messages pushed to browsers. */
export type ClientMessage =
  | { type: 'job-updated'; job: PublicJob }
  | { type: 'agents-updated'; agents: AgentSummary[] }
  | { type: 'credits-updated'; balance: number };

/**
 * WebSocket endpoint for logged-in browsers. Each change is pushed only to
 * the people allowed to see it: a job to its owner, a machine to its owner.
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
    sendTo((user) => user.isAdmin || user.id === job.clientId, {
      type: 'job-updated',
      job,
    }),
  );
  // A balance is private, even from admins
  creditEvents.on('credits-updated', (userId, balance) =>
    sendTo((user) => user.id === userId, { type: 'credits-updated', balance }),
  );
  // Each provider only hears about their own machines
  agentEvents.on('agents-updated', (agents) => {
    for (const client of wss.clients) {
      const user = users.get(client);
      if (!user || client.readyState !== client.OPEN) continue;
      const visible = user.isAdmin ? agents : agents.filter((agent) => agent.ownerId === user.id);
      client.send(JSON.stringify({ type: 'agents-updated', agents: visible }));
    }
  });

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
