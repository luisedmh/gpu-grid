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

export async function listAgents(): Promise<Agent[]> {
  const response = await fetch('/api/agents');
  if (!response.ok) throw new Error(`Could not load providers (${response.status})`);
  return response.json();
}
