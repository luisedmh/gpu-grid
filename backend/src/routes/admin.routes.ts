import { Router, type Request, type Response } from 'express';
import type { Scheduler } from '../agents/scheduler.js';
import { HttpError } from '../lib/http-error.js';
import { requireAdmin } from '../middleware/auth.js';
import {
  adminJobsQuerySchema,
  grantCreditsSchema,
  updateUserSchema,
} from '../schemas/admin.schema.js';
import * as admin from '../services/admin.service.js';
import { reinstateMachine } from '../verification/trust.service.js';

/** The administration panel's API. Every route is for administrators only. */
export function createAdminRouter(scheduler: Scheduler | undefined) {
  const router = Router();
  router.use(requireAdmin());
  const live = () => scheduler?.listAgents() ?? [];

  /** GET /api/admin/overview — figures of the whole platform. */
  router.get('/overview', async (_req: Request, res: Response) => {
    res.json(await admin.getOverview(live()));
  });

  /** GET /api/admin/users — every account. */
  router.get('/users', async (_req: Request, res: Response) => {
    res.json(await admin.listUsers());
  });

  /** POST /api/admin/users/:id/credits — gives credits to an account. */
  router.post('/users/:id/credits', async (req: Request<{ id: string }>, res: Response) => {
    const { amount } = grantCreditsSchema.parse(req.body);
    res.json(await admin.giveCredits(req.params.id, amount));
  });

  /** PATCH /api/admin/users/:id — makes an account an administrator, or not. */
  router.patch('/users/:id', async (req: Request<{ id: string }>, res: Response) => {
    if (!req.user) throw new HttpError(401, 'You need to log in');
    const { isAdmin } = updateUserSchema.parse(req.body);
    await admin.setAdmin(req.params.id, isAdmin, req.user.id);
    res.status(204).end();
  });

  /** GET /api/admin/machines — every machine and whether it is online. */
  router.get('/machines', async (_req: Request, res: Response) => {
    res.json(await admin.listAllMachines(live()));
  });

  /** DELETE /api/admin/machines/:id — removes a machine and disconnects it. */
  router.delete('/machines/:id', async (req: Request<{ id: string }>, res: Response) => {
    await admin.removeMachine(req.params.id);
    scheduler?.disconnect(req.params.id, 'The machine was removed by an administrator');
    res.status(204).end();
  });

  /** POST /api/admin/machines/:id/reinstate — lets a suspended machine connect again. */
  router.post('/machines/:id/reinstate', async (req: Request<{ id: string }>, res: Response) => {
    await reinstateMachine(req.params.id);
    res.status(204).end();
  });

  /** GET /api/admin/jobs — jobs of every user, and verification jobs. */
  router.get('/jobs', async (req: Request, res: Response) => {
    res.json(await admin.listAllJobs(adminJobsQuerySchema.parse(req.query)));
  });

  return router;
}
