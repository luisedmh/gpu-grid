import { Router, type Request, type Response } from 'express';
import { findMachineByToken } from '../agents/agent-server.js';
import { HttpError, NotFoundError } from '../lib/http-error.js';
import { prisma } from '../lib/prisma.js';

/** Endpoints used by provider agents, which authenticate with their machine token. */
export function createAgentRouter() {
  const router = Router();

  /** GET /api/agent/jobs/:id/binary — the compiled program of a job given to this machine. */
  router.get('/jobs/:id/binary', async (req: Request<{ id: string }>, res: Response) => {
    const machine = await findMachineByToken(req.headers.authorization);
    if (!machine) throw new HttpError(401, 'Invalid or missing machine token');

    const job = await prisma.job.findUnique({
      where: { id: req.params.id },
      select: { status: true, binaryPath: true, machineId: true },
    });
    // Only the machine running the job can download it
    if (!job || job.status !== 'RUNNING' || job.machineId !== machine.id || !job.binaryPath) {
      throw new NotFoundError('No binary available for this job');
    }
    res.sendFile(job.binaryPath);
  });

  return router;
}
