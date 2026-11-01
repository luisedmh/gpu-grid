import { CLOSE_SUSPENDED } from '../agents/protocol.js';
import type { Scheduler } from '../agents/scheduler.js';
import { createCheck, evaluateCheck, hasOpenCheck, needsFirstCheck } from './trust.service.js';

export interface VerifierDeps {
  scheduler: Scheduler;
  /** Sends a new job to be compiled (verification jobs are compiled like any other). */
  compile: (jobId: string) => void;
  /** Share of users' jobs after which the machine gets an unannounced check (0 to 1). */
  spotCheckRate: number;
  /** Source of randomness, replaceable in tests. */
  random?: () => number;
}

/**
 * Decides when machines are verified, and acts on the outcome:
 *
 * - A machine that has never passed a check gets one as soon as it connects,
 *   and gets no users' jobs until it passes.
 * - After users' jobs, it sometimes gets another one, unannounced: a machine
 *   that behaves well at first and cheats later can still be caught.
 * - A wrong answer suspends the machine and disconnects it.
 */
export class Verifier {
  constructor(private readonly deps: VerifierDeps) {}

  /** Plugs the verifier into the scheduler's events. */
  attach(): this {
    this.deps.scheduler.onMachineReady = (machineId) => this.machineReady(machineId);
    this.deps.scheduler.onJobFinished = (machineId, jobId) => this.jobFinished(machineId, jobId);
    return this;
  }

  async machineReady(machineId: string): Promise<void> {
    if (await needsFirstCheck(machineId)) await this.check(machineId);
  }

  async jobFinished(machineId: string, jobId: string): Promise<void> {
    const verdict = await evaluateCheck(jobId);
    if (verdict) {
      if (verdict.passed) {
        this.deps.scheduler.markVerified(machineId);
      } else {
        console.warn(`Machine ${machineId} suspended: ${verdict.reason}`);
        this.deps.scheduler.disconnect(machineId, verdict.reason, CLOSE_SUSPENDED);
      }
      return;
    }

    const random = this.deps.random ?? Math.random;
    if (random() < this.deps.spotCheckRate && !(await hasOpenCheck(machineId))) {
      await this.check(machineId);
    }
  }

  private async check(machineId: string): Promise<void> {
    this.deps.compile(await createCheck(machineId));
  }
}
