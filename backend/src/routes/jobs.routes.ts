import { Router } from 'express';
import { createJobsController, type JobsDeps } from '../controllers/jobs.controller.js';

export function createJobsRouter(deps: JobsDeps) {
  const controller = createJobsController(deps);
  const router = Router();

  router.get('/', controller.list);
  router.post('/', controller.create);
  router.get('/:id', controller.get);

  return router;
}
