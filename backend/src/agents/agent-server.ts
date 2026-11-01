import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { isValidAgentToken } from '../lib/agent-auth.js';
import { parseAgentMessage, type ServerMessage } from './protocol.js';
import type { Scheduler } from './scheduler.js';

export const AGENT_WS_PATH = '/ws/agent';

interface AgentServerOptions {
  token: string;
  scheduler: Scheduler;
  /** How often to check that each agent is still alive. */
  heartbeatMs?: number;
}

/**
 * Accepts WebSocket connections from provider agents on the same HTTP server as the API.
 * The connection starts as a normal HTTP request that asks to "upgrade" to WebSocket;
 * we check the path and the token before accepting it.
 */
export function attachAgentServer(server: Server, options: AgentServerOptions) {
  const wss = new WebSocketServer({ noServer: true });
  const heartbeatMs = options.heartbeatMs ?? 15_000;

  server.on('upgrade', (req, socket, head) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');
    if (pathname !== AGENT_WS_PATH) {
      socket.destroy();
      return;
    }
    if (!isValidAgentToken(req.headers.authorization, options.token)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => handleConnection(ws));
  });

  function handleConnection(ws: WebSocket) {
    let agentId: string | null = null;
    let alive = true;

    const send = (message: ServerMessage) => ws.send(JSON.stringify(message));

    // Heartbeat: ping regularly; an agent that misses a pong is considered dead
    ws.on('pong', () => {
      alive = true;
    });
    const heartbeat = setInterval(() => {
      if (!alive) {
        ws.terminate();
        return;
      }
      alive = false;
      ws.ping();
    }, heartbeatMs);

    ws.on('message', (data) => {
      const message = parseAgentMessage(data.toString());
      if (!message) {
        ws.close(1008, 'Invalid message');
        return;
      }

      if (message.type === 'hello') {
        if (agentId) return;
        agentId = randomUUID();
        send({ type: 'welcome', agentId });
        options.scheduler.addAgent({ id: agentId, name: message.name, gpus: message.gpus, send });
        console.log(`Agent connected: ${message.name} (${message.gpus.length} GPU)`);
        return;
      }

      if (agentId) {
        const { jobId, exitCode, stdout, stderr, durationMs, timedOut } = message;
        options.scheduler
          .handleResult(agentId, jobId, { exitCode, stdout, stderr, durationMs, timedOut })
          .catch((err) => console.error('Could not save job result:', err));
      }
    });

    ws.on('close', () => {
      clearInterval(heartbeat);
      if (agentId) {
        console.log(`Agent disconnected: ${agentId}`);
        options.scheduler
          .removeAgent(agentId)
          .catch((err) => console.error('Could not release agent job:', err));
      }
    });

    ws.on('error', (err) => console.error('Agent connection error:', err.message));
  }

  return wss;
}
