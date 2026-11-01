import { Router } from 'express';
import type { AgentSummary } from '../agents/scheduler.js';
import { requireAuth } from '../middleware/auth.js';

/** GET /api/agents — providers connected right now (for monitoring). */
export function createAgentsRouter(listAgents: () => AgentSummary[]) {
  const router = Router();
  router.get('/', requireAuth('PROVIDER', 'ADMIN'), (_req, res) => {
    res.json(listAgents());
  });
  return router;
}
