import os from 'node:os';

/** Agent settings, read from environment variables (or agent/.env). */
export const config = {
  /** Base URL of the GPU Grid backend. */
  serverUrl: process.env.SERVER_URL ?? 'http://localhost:3000',
  /** Secret shared with the backend (AGENT_TOKEN in backend/.env). */
  token: process.env.AGENT_TOKEN ?? '',
  /** Name shown in the platform for this machine. */
  name: process.env.AGENT_NAME ?? os.hostname(),
};
