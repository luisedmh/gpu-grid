import { Router } from 'express';
import { createJobsController, type JobsDeps } from '../controllers/jobs.controller.js';
import { requireAuth } from '../middleware/auth.js';

export function createJobsRouter(deps: JobsDeps) {
  const controller = createJobsController(deps);
  const router = Router();

  // Everyone must be logged in; only clients (and admins) can submit jobs
  router.use(requireAuth());
  router.get('/', controller.list);
  router.post('/', requireAuth('CLIENT', 'ADMIN'), controller.create);
  router.get('/:id', controller.get);

  return router;
}
