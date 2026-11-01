import { request } from './http.ts';
import type { JobStatus } from './jobs.ts';
import type { Gpu } from './machines.ts';

/** Typed access to the administration API (mirrors backend admin.service.ts). */

export interface Overview {
  users: number;
  machines: { registered: number; online: number; busy: number; suspended: number };
  jobs: Record<JobStatus, number>;
  credits: {
    inAccounts: number;
    paidByClients: number;
    paidToProviders: number;
    platformRevenue: number;
  };
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  balance: number;
  createdAt: string;
  _count: { jobs: number; machines: number };
}

export interface AdminMachine {
  id: string;
  name: string;
  tokenPrefix: string;
  createdAt: string;
  lastSeenAt: string | null;
  owner: { id: string; name: string; email: string };
  verifiedAt: string | null;
  checksPassed: number;
  checksFailed: number;
  suspendedAt: string | null;
  suspensionReason: string | null;
  _count: { jobs: number };
  online: boolean;
  busy: boolean;
  gpus: Gpu[];
  currentJobId: string | null;
}

export interface AdminJob {
  id: string;
  name: string;
  /** CHECK: a verification job made by the platform, with no client */
  kind: 'CLIENT' | 'CHECK';
  status: JobStatus;
  durationMs: number | null;
  costCredits: number | null;
  attempts: number;
  createdAt: string;
  client: { id: string; name: string } | null;
  machine: { id: string; name: string } | null;
}

export const getOverview = () => request<Overview>('/api/admin/overview');
export const listUsers = () => request<AdminUser[]>('/api/admin/users');
export const listAllMachines = () => request<AdminMachine[]>('/api/admin/machines');
export const listAllJobs = () => request<AdminJob[]>('/api/admin/jobs?limit=200');

export function giveCredits(userId: string, amount: number) {
  return request<{ balance: number }>(`/api/admin/users/${userId}/credits`, {
    method: 'POST',
    body: JSON.stringify({ amount }),
  });
}

export function setAdmin(userId: string, isAdmin: boolean) {
  return request<null>(`/api/admin/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ isAdmin }),
  });
}

export function reinstateMachine(id: string) {
  return request<null>(`/api/admin/machines/${id}/reinstate`, { method: 'POST' });
}

export function removeMachine(id: string) {
  return request<null>(`/api/admin/machines/${id}`, { method: 'DELETE' });
}
