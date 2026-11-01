import { randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import { bearerToken, hashMachineToken } from '../lib/machine-token.js';
import { prisma } from '../lib/prisma.js';
import { keepAlive, type UpgradeHandler } from '../realtime/upgrade.js';
import { parseAgentMessage, type ServerMessage } from './protocol.js';
import type { Scheduler } from './scheduler.js';

export const AGENT_WS_PATH = '/ws/agent';

/** WebSocket close codes the agent understands. */
export const CLOSE_MACHINE_REMOVED = 4001;
export const CLOSE_REPLACED = 4002;

interface AgentServerOptions {
  scheduler: Scheduler;
  /** How often to check that each agent is still alive. */
  heartbeatMs?: number;
}

interface Machine {
  id: string;
  name: string;
  ownerId: string;
}

/** Finds the machine that owns a token, or null. */
export async function findMachineByToken(header: string | undefined): Promise<Machine | null> {
  const token = bearerToken(header);
  if (!token) return null;
  return prisma.machine.findUnique({
    where: { tokenHash: hashMachineToken(token) },
    select: { id: true, name: true, ownerId: true },
  });
}

/**
 * WebSocket endpoint for provider agents. Each machine connects with its own
 * token; then its messages are passed to the scheduler.
 */
export function createAgentServer(options: AgentServerOptions): UpgradeHandler {
  const wss = new WebSocketServer({ noServer: true });
  const heartbeatMs = options.heartbeatMs ?? 15_000;

  function handleConnection(ws: WebSocket, machine: Machine) {
    const connectionId = randomUUID();
    let registered = false;
    const send = (message: ServerMessage) => ws.send(JSON.stringify(message));
    const stopHeartbeat = keepAlive(ws, heartbeatMs);

    ws.on('message', (data) => {
      const message = parseAgentMessage(data.toString());
      if (!message) {
        ws.close(1008, 'Invalid message');
        return;
      }

      if (message.type === 'hello') {
        if (registered) return;
        registered = true;
        send({ type: 'welcome', machineId: machine.id, name: machine.name });
        options.scheduler.addAgent({
          machineId: machine.id,
          connectionId,
          name: machine.name,
          ownerId: machine.ownerId,
          gpus: message.gpus,
          send,
          close: (reason) =>
            ws.close(
              reason.startsWith('Replaced') ? CLOSE_REPLACED : CLOSE_MACHINE_REMOVED,
              reason,
            ),
        });
        void touchMachine(machine.id);
        console.log(`Machine connected: ${machine.name} (${message.gpus.length} GPU)`);
        return;
      }

      if (registered) {
        const { jobId, exitCode, stdout, stderr, durationMs, timedOut } = message;
        options.scheduler
          .handleResult(machine.id, jobId, { exitCode, stdout, stderr, durationMs, timedOut })
          .catch((err) => console.error('Could not save job result:', err));
      }
    });

    ws.on('close', () => {
      stopHeartbeat();
      if (!registered) return;
      console.log(`Machine disconnected: ${machine.name}`);
      void touchMachine(machine.id);
      options.scheduler
        .removeAgent(machine.id, connectionId)
        .catch((err) => console.error('Could not release machine job:', err));
    });

    ws.on('error', (err) => console.error('Agent connection error:', err.message));
  }

  return (req, socket, head) => {
    findMachineByToken(req.headers.authorization)
      .then((machine) => {
        if (!machine) {
          socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
          socket.destroy();
          return;
        }
        wss.handleUpgrade(req, socket, head, (ws) => handleConnection(ws, machine));
      })
      .catch(() => socket.destroy());
  };
}

/** Records when a machine was last seen (the machine may have just been deleted). */
async function touchMachine(machineId: string) {
  await prisma.machine
    .updateMany({ where: { id: machineId }, data: { lastSeenAt: new Date() } })
    .catch((err) => console.error('Could not update machine:', err));
}
