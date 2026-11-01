import { Router } from 'express';
import type { AgentSummary } from '../agents/scheduler.js';

/** GET /api/agents — providers connected right now (for monitoring). */
export function createAgentsRouter(listAgents: () => AgentSummary[]) {
  const router = Router();
  router.get('/', (_req, res) => {
    res.json(listAgents());
  });
  return router;
}
