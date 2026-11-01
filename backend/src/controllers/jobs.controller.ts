import type { Request, Response } from 'express';
import type { SessionUser } from '../auth/session.js';
import { HttpError } from '../lib/http-error.js';
import { createJobSchema, listJobsQuerySchema } from '../schemas/jobs.schema.js';
import * as jobsService from '../services/jobs.service.js';

/** What the jobs API needs from the rest of the system. */
export interface JobsDeps {
  /** Called after a job is stored, e.g. to start compiling it. */
  onJobCreated?: (jobId: string) => void;
}

/** The logged-in user (routes are protected, so there always is one). */
function viewer(req: Request): SessionUser {
  if (!req.user) throw new HttpError(401, 'You need to log in');
  return req.user;
}

export function createJobsController(deps: JobsDeps) {
  return {
    /** POST /api/jobs — validates the body and creates a job. */
    async create(req: Request, res: Response) {
      const input = createJobSchema.parse(req.body);
      const job = await jobsService.createJob(input, viewer(req).id);
      deps.onJobCreated?.(job.id);
      res.status(201).location(`/api/jobs/${job.id}`).json(job);
    },

    /** GET /api/jobs — lists jobs, newest first. */
    async list(req: Request, res: Response) {
      const query = listJobsQuerySchema.parse(req.query);
      res.json(await jobsService.listJobs(query, viewer(req)));
    },

    /** GET /api/jobs/:id — returns the current state of a job. */
    async get(req: Request<{ id: string }>, res: Response) {
      const job = await jobsService.getJob(req.params.id, viewer(req));
      res.json(job);
    },
  };
}
