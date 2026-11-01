import express from 'express';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { healthRouter } from './routes/health.routes.js';
import { jobsRouter } from './routes/jobs.routes.js';

/**
 * Builds and configures the Express application.
 * Kept separate from server startup so tests can use the app
 * without opening a real network port.
 */
export function createApp() {
  const app = express();

  // Parse JSON bodies; CUDA sources can be large, so allow up to 256 KB
  app.use(express.json({ limit: '256kb' }));

  app.use('/api/health', healthRouter);
  app.use('/api/jobs', jobsRouter);

  app.use('/api', notFoundHandler);
  app.use(errorHandler);

  return app;
}
