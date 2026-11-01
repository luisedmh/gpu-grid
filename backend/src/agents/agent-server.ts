import { randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { isValidAgentToken } from '../lib/agent-auth.js';
import { keepAlive, type UpgradeHandler } from '../realtime/upgrade.js';
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
 * WebSocket endpoint for provider agents. Checks the token before accepting
 * the connection, then passes the agent's messages to the scheduler.
 */
export function createAgentServer(options: AgentServerOptions): UpgradeHandler {
  const wss = new WebSocketServer({ noServer: true });
  const heartbeatMs = options.heartbeatMs ?? 15_000;

  function handleConnection(ws: WebSocket) {
    let agentId: string | null = null;
    const send = (message: ServerMessage) => ws.send(JSON.stringify(message));
    const stopHeartbeat = keepAlive(ws, heartbeatMs);

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
      stopHeartbeat();
      if (agentId) {
        console.log(`Agent disconnected: ${agentId}`);
        options.scheduler
          .removeAgent(agentId)
          .catch((err) => console.error('Could not release agent job:', err));
      }
    });

    ws.on('error', (err) => console.error('Agent connection error:', err.message));
  }

  return (req, socket, head) => {
    if (!isValidAgentToken(req.headers.authorization, options.token)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, handleConnection);
  };
}
