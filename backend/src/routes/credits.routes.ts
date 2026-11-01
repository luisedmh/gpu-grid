import { Router, type Request, type Response } from 'express';
import { HttpError } from '../lib/http-error.js';
import { requireAuth } from '../middleware/auth.js';
import { getStatement } from '../services/credits.service.js';

export const creditsRouter = Router();
creditsRouter.use(requireAuth());

/** GET /api/credits — my balance, the prices and my latest movements. */
creditsRouter.get('/', async (req: Request, res: Response) => {
  if (!req.user) throw new HttpError(401, 'You need to log in');
  res.json(await getStatement(req.user.id));
});
