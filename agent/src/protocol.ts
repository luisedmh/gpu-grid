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
  | { type: 'hello'; gpus: GpuInfo[] }
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
  | { type: 'welcome'; machineId: string; name: string }
  | {
      type: 'job';
      jobId: string;
      timeoutSeconds: number;
      binaryPath: string;
      /** SHA-256 of the binary, to check it arrived exactly as compiled */
      binarySha256: string;
    };
