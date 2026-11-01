import express from 'express';
import type { JobsDeps } from './controllers/jobs.controller.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { healthRouter } from './routes/health.routes.js';
import { createJobsRouter } from './routes/jobs.routes.js';

/** Everything the app needs from outside. Tests pass fakes; server.ts passes the real ones. */
export type AppDeps = JobsDeps;

/**
 * Builds and configures the Express application.
 * Kept separate from server startup so tests can use the app
 * without opening a real network port.
 */
export function createApp(deps: AppDeps = {}) {
  const app = express();

  // Parse JSON bodies; CUDA sources can be large, so allow up to 256 KB
  app.use(express.json({ limit: '256kb' }));

  app.use('/api/health', healthRouter);
  app.use('/api/jobs', createJobsRouter(deps));

  app.use('/api', notFoundHandler);
  app.use(errorHandler);

  return app;
}
