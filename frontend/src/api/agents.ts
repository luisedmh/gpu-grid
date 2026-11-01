import { request } from './http.ts';

/** A provider machine currently connected (mirrors backend AgentSummary). */
export interface Gpu {
  name: string;
  memoryMb: number;
  computeCapability: string;
}

export interface Agent {
  id: string;
  name: string;
  gpus: Gpu[];
  busy: boolean;
  currentJobId: string | null;
  connectedAt: string;
}

export function listAgents() {
  return request<Agent[]>('/api/agents');
}
