/**
 * Messages exchanged with the backend over WebSocket, as JSON.
 * Must match backend/src/agents/protocol.ts.
 */

export interface GpuInfo {
  name: string;
  memoryMb: number;
  computeCapability: string;
}

/** Messages this agent sends. */
export type AgentMessage =
  | { type: 'hello'; name: string; gpus: GpuInfo[] }
  | {
      type: 'result';
      jobId: string;
      exitCode: number | null;
      stdout: string;
      stderr: string;
      durationMs: number;
      timedOut: boolean;
    };

/** Messages the backend sends. */
export type ServerMessage =
  | { type: 'welcome'; agentId: string }
  | { type: 'job'; jobId: string; timeoutSeconds: number; binaryPath: string };
