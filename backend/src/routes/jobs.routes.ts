import { Router } from 'express';
import { createJobsController, type JobsDeps } from '../controllers/jobs.controller.js';
import { requireAuth } from '../middleware/auth.js';

export function createJobsRouter(deps: JobsDeps) {
  const controller = createJobsController(deps);
  const router = Router();

  // Every logged-in user can submit jobs and see their own
  router.use(requireAuth());
  router.get('/', controller.list);
  router.post('/', controller.create);
  router.get('/:id', controller.get);

  return router;
}
