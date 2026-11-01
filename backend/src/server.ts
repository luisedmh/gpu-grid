import 'dotenv/config';
import { AGENT_WS_PATH, createAgentServer } from './agents/agent-server.js';
import { Scheduler } from './agents/scheduler.js';
import { createApp } from './app.js';
import { config } from './config.js';
import { compileJob, recoverPendingJobs } from './compiler/compile-job.js';
import { CompileQueue } from './compiler/compile-queue.js';
import { createDockerCompiler } from './compiler/docker-compiler.js';
import { CLIENT_WS_PATH, createClientServer } from './realtime/client-server.js';
import { routeUpgrades } from './realtime/upgrade.js';
import { recoverRunningJobs } from './services/execution.service.js';
import { Verifier } from './verification/verifier.js';

if (!config.jwtSecret) {
  console.error('JWT_SECRET is not set. Add it to backend/.env (see .env.example).');
  process.exit(1);
}

const scheduler = new Scheduler();

const compiler = createDockerCompiler({
  image: config.compilerImage,
  timeoutMs: config.compileTimeoutMs,
});

// Every successful compilation may have produced work for a free agent
const compileQueue = new CompileQueue(config.compileConcurrency, async (jobId) => {
  await compileJob(jobId, { compiler, jobsDir: config.jobsDir });
  void scheduler.dispatch();
});

// Tests new machines and spot-checks the others with verification jobs
new Verifier({
  scheduler,
  compile: (jobId) => compileQueue.add(jobId),
  spotCheckRate: config.spotCheckRate,
}).attach();

// After a restart: running jobs go back to the queue, pending ones are compiled again
const requeued = await recoverRunningJobs();
if (requeued > 0) console.log(`Requeued ${requeued} interrupted job(s)`);
const pending = await recoverPendingJobs();
pending.forEach((jobId) => compileQueue.add(jobId));
if (pending.length > 0) console.log(`Recovered ${pending.length} pending job(s)`);

const app = createApp({
  onJobCreated: (jobId) => compileQueue.add(jobId),
  scheduler,
});

const server = app.listen(config.port, () => {
  console.log(`Backend listening on port ${config.port}`);
});

// WebSocket endpoints: providers on /ws/agent, browsers on /ws/client
routeUpgrades(server, {
  [AGENT_WS_PATH]: createAgentServer({ scheduler }),
  [CLIENT_WS_PATH]: createClientServer(),
});

// Safety net: try to dispatch regularly in case an event was missed
setInterval(() => void scheduler.dispatch(), 10_000);
