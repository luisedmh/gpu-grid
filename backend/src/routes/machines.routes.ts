import { Router, type Request, type Response } from 'express';
import type { Scheduler } from '../agents/scheduler.js';
import type { SessionUser } from '../auth/session.js';
import { HttpError } from '../lib/http-error.js';
import { requireAuth } from '../middleware/auth.js';
import { createMachineSchema } from '../schemas/machines.schema.js';
import * as machinesService from '../services/machines.service.js';

function viewer(req: Request): SessionUser {
  if (!req.user) throw new HttpError(401, 'You need to log in');
  return req.user;
}

/** Anyone can offer their machines: they are managed here. */
export function createMachinesRouter(scheduler: Scheduler | undefined) {
  const router = Router();
  router.use(requireAuth());

  /** GET /api/machines — my machines and whether they are online. */
  router.get('/', async (req: Request, res: Response) => {
    const user = viewer(req);
    const live = scheduler?.listAgents(user.id) ?? [];
    res.json(await machinesService.listMachines(user, live));
  });

  /** POST /api/machines — registers a machine and returns its token (only this once). */
  router.post('/', async (req: Request, res: Response) => {
    const { name } = createMachineSchema.parse(req.body);
    res.status(201).json(await machinesService.createMachine(name, viewer(req).id));
  });

  /** DELETE /api/machines/:id — removes a machine and disconnects it if it is online. */
  router.delete('/:id', async (req: Request<{ id: string }>, res: Response) => {
    await machinesService.deleteMachine(req.params.id, viewer(req));
    scheduler?.disconnect(req.params.id, 'The machine was removed by its owner');
    res.status(204).end();
  });

  return router;
}
