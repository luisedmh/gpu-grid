import { tmpdir } from 'node:os';

/** Agent settings, read from environment variables (or agent/.env). */
export const config = {
  /** Base URL of the GPU Grid backend. */
  serverUrl: process.env.SERVER_URL ?? 'http://localhost:3000',
  /** Token of this machine, shown once when you register it in the web ("My machines"). */
  token: process.env.AGENT_TOKEN ?? '',
  /** Docker runtime for jobs: "runsc" uses gVisor, a stronger sandbox. Empty: Docker's default. */
  runtime: process.env.AGENT_RUNTIME ?? '',
  /** Where downloaded binaries are kept while they run. */
  workDir: process.env.AGENT_WORK_DIR ?? tmpdir(),
};
