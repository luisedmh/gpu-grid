import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import type { WebSocket } from 'ws';

/** Takes over an HTTP request that asks to become a WebSocket connection. */
export type UpgradeHandler = (req: IncomingMessage, socket: Duplex, head: Buffer) => void;

/**
 * A WebSocket connection starts as an HTTP request asking to "upgrade".
 * Several WebSocket endpoints share the same HTTP server, so this sends each
 * upgrade request to the handler of its path, and rejects unknown paths.
 */
export function routeUpgrades(server: Server, routes: Record<string, UpgradeHandler>): void {
  server.on('upgrade', (req, socket, head) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');
    const handler = routes[pathname];
    if (!handler) {
      socket.destroy();
      return;
    }
    handler(req, socket, head);
  });
}

/** Keeps a WebSocket alive: pings regularly and closes it if a pong is missed. */
export function keepAlive(ws: WebSocket, intervalMs: number): () => void {
  let alive = true;
  ws.on('pong', () => {
    alive = true;
  });
  const timer = setInterval(() => {
    if (!alive) {
      ws.terminate();
      return;
    }
    alive = false;
    ws.ping();
  }, intervalMs);
  return () => clearInterval(timer);
}
