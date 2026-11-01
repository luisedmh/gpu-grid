import express from 'express';
import type { Scheduler } from './agents/scheduler.js';
import type { JobsDeps } from './controllers/jobs.controller.js';
import { authenticate } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { createAgentRouter } from './routes/agent.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { healthRouter } from './routes/health.routes.js';
import { createJobsRouter } from './routes/jobs.routes.js';
import { createMachinesRouter } from './routes/machines.routes.js';

/** Everything the app needs from outside. Tests pass fakes; server.ts passes the real ones. */
export interface AppDeps extends JobsDeps {
  /** Knows which machines are connected right now. */
  scheduler?: Scheduler;
}

/**
 * Builds and configures the Express application.
 * Kept separate from server startup so tests can use the app
 * without opening a real network port.
 */
export function createApp(deps: AppDeps = {}) {
  const app = express();

  // Parse JSON bodies; CUDA sources can be large, so allow up to 256 KB
  app.use(express.json({ limit: '256kb' }));

  // Works out who is making each request (from the session cookie)
  app.use(authenticate);

  app.use('/api/health', healthRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/jobs', createJobsRouter(deps));
  app.use('/api/machines', createMachinesRouter(deps.scheduler));
  app.use('/api/agent', createAgentRouter());

  app.use('/api', notFoundHandler);
  app.use(errorHandler);

  return app;
}
