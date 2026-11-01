/** Agent settings, read from environment variables (or agent/.env). */
export const config = {
  /** Base URL of the GPU Grid backend. */
  serverUrl: process.env.SERVER_URL ?? 'http://localhost:3000',
  /** Token of this machine, shown once when you register it in the web ("My machines"). */
  token: process.env.AGENT_TOKEN ?? '',
};
