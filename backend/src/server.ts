import 'dotenv/config';
import { createApp } from './app.js';
import { config } from './config.js';
import { compileJob, recoverPendingJobs } from './compiler/compile-job.js';
import { CompileQueue } from './compiler/compile-queue.js';
import { createDockerCompiler } from './compiler/docker-compiler.js';

const compiler = createDockerCompiler({
  image: config.compilerImage,
  timeoutMs: config.compileTimeoutMs,
});

const compileQueue = new CompileQueue(config.compileConcurrency, (jobId) =>
  compileJob(jobId, { compiler, jobsDir: config.jobsDir }),
);

// Jobs that were waiting when the server stopped are compiled now
const pending = await recoverPendingJobs();
pending.forEach((jobId) => compileQueue.add(jobId));
if (pending.length > 0) console.log(`Recovered ${pending.length} pending job(s)`);

const app = createApp({ onJobCreated: (jobId) => compileQueue.add(jobId) });

app.listen(config.port, () => {
  console.log(`Backend listening on port ${config.port}`);
});
