import type { GpuInfo, JobResult, ServerMessage } from './protocol.js';
import { claimNextJob, releaseJob, saveResult } from '../services/execution.service.js';

/** A provider agent currently connected to this server. */
export interface ConnectedAgent {
  id: string;
  name: string;
  gpus: GpuInfo[];
  send: (message: ServerMessage) => void;
}

interface AgentState extends ConnectedAgent {
  /** Job this agent is running right now, or null when it is free. */
  currentJobId: string | null;
}

export interface AgentSummary {
  id: string;
  name: string;
  gpus: GpuInfo[];
  busy: boolean;
}

/**
 * Matches queued jobs with free agents. Agents live in memory: they only exist
 * while their WebSocket connection is open. Jobs live in the database.
 */
export class Scheduler {
  private readonly agents = new Map<string, AgentState>();
  private dispatching = false;
  private dispatchRequested = false;

  addAgent(agent: ConnectedAgent): void {
    this.agents.set(agent.id, { ...agent, currentJobId: null });
    void this.dispatch();
  }

  async removeAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) return;
    this.agents.delete(agentId);

    if (agent.currentJobId) {
      await releaseJob(agent.currentJobId, 'The provider disconnected while running the job.');
      void this.dispatch();
    }
  }

  async handleResult(agentId: string, jobId: string, result: JobResult): Promise<void> {
    const agent = this.agents.get(agentId);
    // An agent may only report the job it was given
    if (!agent || agent.currentJobId !== jobId) return;

    await saveResult(jobId, result);
    agent.currentJobId = null;
    void this.dispatch();
  }

  listAgents(): AgentSummary[] {
    return [...this.agents.values()].map(({ id, name, gpus, currentJobId }) => ({
      id,
      name,
      gpus,
      busy: currentJobId !== null,
    }));
  }

  /**
   * Gives a queued job to every free agent. Safe to call at any time:
   * if a dispatch is already running, it simply runs once more afterwards.
   */
  async dispatch(): Promise<void> {
    if (this.dispatching) {
      this.dispatchRequested = true;
      return;
    }
    this.dispatching = true;

    try {
      do {
        this.dispatchRequested = false;
        for (const agent of this.agents.values()) {
          if (agent.currentJobId) continue;

          const job = await claimNextJob();
          if (!job) break;

          // The agent may have disconnected while we were talking to the database
          if (!this.agents.has(agent.id)) {
            await releaseJob(job.id, 'The provider disconnected before receiving the job.');
            continue;
          }

          agent.currentJobId = job.id;
          agent.send({
            type: 'job',
            jobId: job.id,
            timeoutSeconds: job.timeoutSeconds,
            binaryPath: `/api/agent/jobs/${job.id}/binary`,
          });
        }
      } while (this.dispatchRequested);
    } catch (err) {
      console.error('Dispatch failed:', err);
    } finally {
      this.dispatching = false;
    }
  }
}
