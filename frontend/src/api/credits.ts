import { request } from './http.ts';

export type CreditMovementType = 'WELCOME' | 'GRANT' | 'RESERVE' | 'REFUND' | 'EARNING';

/** One change of the balance (mirrors backend getStatement). */
export interface CreditMovement {
  id: string;
  type: CreditMovementType;
  /** Positive adds credits, negative takes them away */
  amount: number;
  createdAt: string;
  job: { id: string; name: string } | null;
}

export interface CreditStatement {
  balance: number;
  /** Price of one second of GPU time */
  creditsPerGpuSecond: number;
  /** Part of each job's cost paid to the provider */
  providerSharePercent: number;
  /** Latest movements, newest first */
  movements: CreditMovement[];
}

export function getCredits() {
  return request<CreditStatement>('/api/credits');
}
