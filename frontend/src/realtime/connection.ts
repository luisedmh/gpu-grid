import type { Job } from '../api/jobs.ts';

/** Messages the backend pushes to browsers over /ws/client. */
export type RealtimeMessage =
  | { type: 'job-updated'; job: Job }
  // Some machine of this user connected, disconnected or took a job
  | { type: 'agents-updated' };

export type ConnectionStatus = 'connecting' | 'online' | 'offline';

type MessageListener = (message: RealtimeMessage) => void;
type StatusListener = (status: ConnectionStatus) => void;

/**
 * One WebSocket connection shared by the whole app. Components subscribe to
 * the messages they care about; the connection reconnects by itself if it drops.
 * The session cookie goes with the connection request, so the backend knows
 * who is connected and sends each person only what they may see.
 */
class RealtimeConnection {
  private socket: WebSocket | null = null;
  private active = false;
  private status: ConnectionStatus = 'connecting';
  private retries = 0;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly messageListeners = new Set<MessageListener>();
  private readonly statusListeners = new Set<StatusListener>();

  /** Receive every message. Returns a function that stops listening. */
  subscribe(listener: MessageListener): () => void {
    this.start();
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  /** Be told when the connection goes up or down. Returns a function that stops listening. */
  onStatusChange(listener: StatusListener): () => void {
    this.start();
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  /** Closes the connection and stops reconnecting (on logout). */
  stop() {
    this.active = false;
    clearTimeout(this.retryTimer);
    this.socket?.close();
    this.socket = null;
    this.setStatus('connecting');
  }

  /** Opens a fresh connection, e.g. after logging in as someone else. */
  restart() {
    this.stop();
    this.start();
  }

  private start() {
    if (this.active) return;
    this.active = true;
    this.retries = 0;
    this.connect();
  }

  private connect() {
    // Same host as the page: in development Vite forwards /ws to the backend
    const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${protocol}://${location.host}/ws/client`);
    this.socket = socket;

    socket.onopen = () => {
      this.retries = 0;
      this.setStatus('online');
    };

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data) as RealtimeMessage;
      this.messageListeners.forEach((listener) => listener(message));
    };

    socket.onclose = () => {
      // Ignore old sockets, and do not reconnect after stop()
      if (socket !== this.socket || !this.active) return;
      this.setStatus('offline');
      // Try again after 1 s, 2 s, 4 s... up to 15 s
      const delay = Math.min(15_000, 1000 * 2 ** this.retries++);
      this.retryTimer = setTimeout(() => this.connect(), delay);
    };
  }

  private setStatus(status: ConnectionStatus) {
    this.status = status;
    this.statusListeners.forEach((listener) => listener(status));
  }
}

export const realtime = new RealtimeConnection();
