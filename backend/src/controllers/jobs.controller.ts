import type { Request, Response } from 'express';
import { createJobSchema } from '../schemas/jobs.schema.js';
import * as jobsService from '../services/jobs.service.js';

/** POST /api/jobs — validates the body and creates a job. */
export async function createJob(req: Request, res: Response) {
  const input = createJobSchema.parse(req.body);
  const job = await jobsService.createJob(input);
  res.status(201).location(`/api/jobs/${job.id}`).json(job);
}

/** GET /api/jobs/:id — returns the current state of a job. */
export async function getJob(req: Request<{ id: string }>, res: Response) {
  const job = await jobsService.getJob(req.params.id);
  res.json(job);
}
