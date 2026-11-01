import { Router } from 'express';

export const healthRouter = Router();

// Lets Docker, Nginx or a monitor know the backend is alive
healthRouter.get('/', (_req, res) => {
  res.json({ status: 'ok' });
});
