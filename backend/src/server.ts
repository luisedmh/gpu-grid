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

if (!config.agentToken) {
  console.error('AGENT_TOKEN is not set. Add it to backend/.env (see .env.example).');
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

// After a restart: running jobs go back to the queue, pending ones are compiled again
const requeued = await recoverRunningJobs();
if (requeued > 0) console.log(`Requeued ${requeued} interrupted job(s)`);
const pending = await recoverPendingJobs();
pending.forEach((jobId) => compileQueue.add(jobId));
if (pending.length > 0) console.log(`Recovered ${pending.length} pending job(s)`);

const app = createApp({
  onJobCreated: (jobId) => compileQueue.add(jobId),
  agentToken: config.agentToken,
  listAgents: () => scheduler.listAgents(),
});

const server = app.listen(config.port, () => {
  console.log(`Backend listening on port ${config.port}`);
});

// WebSocket endpoints: providers on /ws/agent, browsers on /ws/client
routeUpgrades(server, {
  [AGENT_WS_PATH]: createAgentServer({ token: config.agentToken, scheduler }),
  [CLIENT_WS_PATH]: createClientServer(),
});

// Safety net: try to dispatch regularly in case an event was missed
setInterval(() => void scheduler.dispatch(), 10_000);
