import type { GpuInfo, JobResult, ServerMessage } from './protocol.js';
import { agentEvents } from '../realtime/agent-events.js';
import {
  claimNextJob,
  machineExists,
  releaseJob,
  saveResult,
} from '../services/execution.service.js';

/** A machine whose agent is connected to this server right now. */
export interface ConnectedAgent {
  /** The machine's id in the database. */
  machineId: string;
  /** Identifies this particular connection (a machine may reconnect). */
  connectionId: string;
  name: string;
  ownerId: string;
  gpus: GpuInfo[];
  send: (message: ServerMessage) => void;
  /** Closes the connection, e.g. when the machine is deleted. */
  close: (reason: string) => void;
}

interface AgentState extends ConnectedAgent {
  /** Job this agent is running right now, or null when it is free. */
  currentJobId: string | null;
  connectedAt: Date;
}

/** Live state of a connected machine, as shown to its owner. */
export interface AgentSummary {
  machineId: string;
  name: string;
  ownerId: string;
  gpus: GpuInfo[];
  busy: boolean;
  currentJobId: string | null;
  connectedAt: Date;
}

/**
 * Matches queued jobs with free machines. Connected machines live in memory:
 * they only exist while their WebSocket connection is open. Jobs live in the database.
 */
export class Scheduler {
  private readonly agents = new Map<string, AgentState>();
  private dispatching = false;
  private dispatchRequested = false;

  addAgent(agent: ConnectedAgent): void {
    // The same machine connecting again (e.g. after a crash) replaces its old connection
    const previous = this.agents.get(agent.machineId);
    if (previous) {
      previous.close('Replaced by a new connection from the same machine');
      if (previous.currentJobId) {
        void releaseJob(previous.currentJobId, 'The provider reconnected while running the job.');
      }
    }

    this.agents.set(agent.machineId, { ...agent, currentJobId: null, connectedAt: new Date() });
    this.announce();
    void this.dispatch();
  }

  /** Called when a connection closes. Ignored if that machine has already reconnected. */
  async removeAgent(machineId: string, connectionId: string): Promise<void> {
    const agent = this.agents.get(machineId);
    if (!agent || agent.connectionId !== connectionId) return;
    this.agents.delete(machineId);
    this.announce();

    if (agent.currentJobId) {
      await releaseJob(agent.currentJobId, 'The provider disconnected while running the job.');
      void this.dispatch();
    }
  }

  /** Forces a machine offline (e.g. its owner deleted it). */
  disconnect(machineId: string, reason: string): void {
    this.agents.get(machineId)?.close(reason);
  }

  async handleResult(machineId: string, jobId: string, result: JobResult): Promise<void> {
    const agent = this.agents.get(machineId);
    // A machine may only report the job it was given
    if (!agent || agent.currentJobId !== jobId) return;

    await saveResult(jobId, result);
    agent.currentJobId = null;
    this.announce();
    void this.dispatch();
  }

  /** Connected machines, all of them or only those of one owner. */
  listAgents(ownerId?: string): AgentSummary[] {
    return [...this.agents.values()]
      .filter((agent) => ownerId === undefined || agent.ownerId === ownerId)
      .map(({ machineId, name, ownerId, gpus, currentJobId, connectedAt }) => ({
        machineId,
        name,
        ownerId,
        gpus,
        busy: currentJobId !== null,
        currentJobId,
        connectedAt,
      }));
  }

  /** Tells whoever is listening (the browsers) that the connected machines changed. */
  private announce(): void {
    agentEvents.emit('agents-updated', this.listAgents());
  }

  /**
   * Gives a queued job to every free machine. Safe to call at any time:
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

          let job;
          try {
            job = await claimNextJob(agent.machineId);
          } catch (err) {
            // A problem with one machine must not stop the others from getting work
            console.error(`Could not give a job to ${agent.name}:`, err);
            if (!(await machineExists(agent.machineId))) {
              this.disconnect(agent.machineId, 'This machine no longer exists');
            }
            continue;
          }
          if (!job) break;

          // The machine may have disconnected while we were talking to the database
          if (this.agents.get(agent.machineId) !== agent) {
            await releaseJob(job.id, 'The provider disconnected before receiving the job.');
            continue;
          }

          agent.currentJobId = job.id;
          this.announce();
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
