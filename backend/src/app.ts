import express from 'express';
import type { AgentSummary } from './agents/scheduler.js';
import type { JobsDeps } from './controllers/jobs.controller.js';
import { authenticate } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { createAgentRouter } from './routes/agent.routes.js';
import { createAgentsRouter } from './routes/agents.routes.js';
import { authRouter } from './routes/auth.routes.js';
import { healthRouter } from './routes/health.routes.js';
import { createJobsRouter } from './routes/jobs.routes.js';

/** Everything the app needs from outside. Tests pass fakes; server.ts passes the real ones. */
export interface AppDeps extends JobsDeps {
  /** Token that provider agents must present. Without it, agent endpoints are disabled. */
  agentToken?: string;
  /** Lists connected providers. Without it, /api/agents is disabled. */
  listAgents?: () => AgentSummary[];
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
  if (deps.listAgents) app.use('/api/agents', createAgentsRouter(deps.listAgents));
  if (deps.agentToken) app.use('/api/agent', createAgentRouter(deps.agentToken));

  app.use('/api', notFoundHandler);
  app.use(errorHandler);

  return app;
}
