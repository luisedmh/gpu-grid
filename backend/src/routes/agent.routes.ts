import { Router, type NextFunction, type Request, type Response } from 'express';
import { HttpError, NotFoundError } from '../lib/http-error.js';
import { isValidAgentToken } from '../lib/agent-auth.js';
import { prisma } from '../lib/prisma.js';

/** Endpoints used by provider agents, protected by the agent token. */
export function createAgentRouter(token: string) {
  const router = Router();

  router.use((req: Request, _res: Response, next: NextFunction) => {
    if (!isValidAgentToken(req.headers.authorization, token)) {
      throw new HttpError(401, 'Invalid or missing agent token');
    }
    next();
  });

  /** GET /api/agent/jobs/:id/binary — the compiled program of a job being run. */
  router.get('/jobs/:id/binary', async (req: Request<{ id: string }>, res: Response) => {
    const job = await prisma.job.findUnique({
      where: { id: req.params.id },
      select: { status: true, binaryPath: true },
    });
    // Only jobs currently assigned to a provider can be downloaded
    if (!job || job.status !== 'RUNNING' || !job.binaryPath) {
      throw new NotFoundError('No binary available for this job');
    }
    res.sendFile(job.binaryPath);
  });

  return router;
}
