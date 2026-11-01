import { EventEmitter } from 'node:events';
import type { AgentSummary } from '../agents/scheduler.js';

/**
 * Announces that the set of connected providers changed: one connected,
 * one disconnected, or one became busy or free. Carries the full new list.
 */
export const agentEvents = new EventEmitter<{ 'agents-updated': [AgentSummary[]] }>();
