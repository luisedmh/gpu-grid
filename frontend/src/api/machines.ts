import { request } from './http.ts';

export interface Gpu {
  name: string;
  memoryMb: number;
  computeCapability: string;
}

/** A machine registered by a provider, with its live state (mirrors backend listMachines). */
export interface Machine {
  id: string;
  name: string;
  /** First characters of the token, to tell tokens apart without revealing them. */
  tokenPrefix: string;
  createdAt: string;
  lastSeenAt: string | null;
  owner: { id: string; name: string; email: string };
  online: boolean;
  busy: boolean;
  gpus: Gpu[];
  currentJobId: string | null;
  connectedAt: string | null;
}

export function listMachines() {
  return request<Machine[]>('/api/machines');
}

/** Registers a machine. The token in the answer is shown only this once. */
export function createMachine(name: string) {
  return request<{ machine: Machine; token: string; agentImage: string }>('/api/machines', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export function deleteMachine(id: string) {
  return request<null>(`/api/machines/${id}`, { method: 'DELETE' });
}
