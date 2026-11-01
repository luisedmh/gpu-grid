import type { Request, Response } from 'express';
import { createJobSchema, listJobsQuerySchema } from '../schemas/jobs.schema.js';
import * as jobsService from '../services/jobs.service.js';

/** What the jobs API needs from the rest of the system. */
export interface JobsDeps {
  /** Called after a job is stored, e.g. to start compiling it. */
  onJobCreated?: (jobId: string) => void;
}

export function createJobsController(deps: JobsDeps) {
  return {
    /** POST /api/jobs — validates the body and creates a job. */
    async create(req: Request, res: Response) {
      const input = createJobSchema.parse(req.body);
      const job = await jobsService.createJob(input);
      deps.onJobCreated?.(job.id);
      res.status(201).location(`/api/jobs/${job.id}`).json(job);
    },

    /** GET /api/jobs — lists jobs, newest first. */
    async list(req: Request, res: Response) {
      const query = listJobsQuerySchema.parse(req.query);
      res.json(await jobsService.listJobs(query));
    },

    /** GET /api/jobs/:id — returns the current state of a job. */
    async get(req: Request<{ id: string }>, res: Response) {
      const job = await jobsService.getJob(req.params.id);
      res.json(job);
    },
  };
}
