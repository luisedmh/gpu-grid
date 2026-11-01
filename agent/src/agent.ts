import 'dotenv/config';
import { createHash } from 'node:crypto';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import WebSocket from 'ws';
import { config } from './config.js';
import { readGpuInfo } from './gpu-info.js';
import type { AgentMessage, ServerMessage } from './protocol.js';
import { runBinary } from './runner.js';
import { checkSandbox } from './security.js';

if (!config.token) {
  console.error('AGENT_TOKEN is not set. Register this machine in the web (My machines)');
  console.error('and put its token in agent/.env (see .env.example).');
  process.exit(1);
}

// Refuse to start if the sandbox is not what it should be
try {
  (await checkSandbox(config.runtime)).forEach((line) => console.log(line));
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}

const wsUrl = `${config.serverUrl.replace(/^http/, 'ws')}/ws/agent`;
let reconnectAttempts = 0;

/** Close codes the backend uses when this agent must not reconnect. */
const CLOSE_MACHINE_REMOVED = 4001;
const CLOSE_REPLACED = 4002;

/** Connects to the backend and keeps reconnecting if the connection drops. */
function connect() {
  const ws = new WebSocket(wsUrl, {
    headers: { Authorization: `Bearer ${config.token}` },
  });
  const send = (message: AgentMessage) => ws.send(JSON.stringify(message));

  ws.on('open', async () => {
    reconnectAttempts = 0;
    const gpus = await readGpuInfo();
    send({ type: 'hello', gpus });
    gpus.forEach((gpu) =>
      console.log(`  GPU: ${gpu.name} (${gpu.memoryMb} MB, sm ${gpu.computeCapability})`),
    );
  });

  ws.on('message', (data) => {
    const message = JSON.parse(data.toString()) as ServerMessage;
    if (message.type === 'welcome') {
      console.log(`Connected to ${config.serverUrl} as "${message.name}"`);
    } else if (message.type === 'job') {
      void runJob(message, send);
    }
  });

  ws.on('close', (code) => {
    if (code === CLOSE_MACHINE_REMOVED) {
      console.error('This machine was removed from the platform. Register it again to rejoin.');
      process.exit(1);
    }
    if (code === CLOSE_REPLACED) {
      console.error('Another agent connected with this same token. Stopping this one.');
      process.exit(1);
    }
    // Wait longer after each failed attempt (1 s, 2 s, 4 s... up to 30 s)
    const delay = Math.min(30_000, 1000 * 2 ** reconnectAttempts);
    reconnectAttempts++;
    console.log(`Disconnected. Reconnecting in ${delay / 1000} s...`);
    setTimeout(connect, delay);
  });

  // The backend answered the connection request with an HTTP error instead of accepting it
  ws.on('unexpected-response', (_req, res) => {
    if (res.statusCode === 401) {
      console.error('The backend does not know this token. Check AGENT_TOKEN in agent/.env,');
      console.error('or register the machine again in the web (My machines).');
      process.exit(1);
    }
    console.error(`Unexpected response from the backend: HTTP ${res.statusCode}`);
    ws.terminate();
  });

  ws.on('error', (err) => {
    console.error(`Connection error: ${err.message}`);
  });
}

/** Downloads the binary of a job, runs it on the GPU and reports the result. */
async function runJob(
  job: Extract<ServerMessage, { type: 'job' }>,
  send: (message: AgentMessage) => void,
) {
  console.log(`Running job ${job.jobId} (limit ${job.timeoutSeconds} s)`);
  await mkdir(config.workDir, { recursive: true });
  const workDir = await mkdtemp(path.join(config.workDir, 'gpugrid-agent-'));
  // The program runs as "nobody" inside the container: it must be able to enter the folder
  await chmod(workDir, 0o755);

  try {
    const response = await fetch(new URL(job.binaryPath, config.serverUrl), {
      headers: { Authorization: `Bearer ${config.token}` },
    });
    if (!response.ok) throw new Error(`Binary download failed with HTTP ${response.status}`);
    const binary = Buffer.from(await response.arrayBuffer());

    // Only run exactly what the platform compiled: a corrupted or swapped file is refused
    const sha256 = createHash('sha256').update(binary).digest('hex');
    if (sha256 !== job.binarySha256) throw new Error('The binary does not match its checksum');

    await writeFile(path.join(workDir, 'program'), binary, { mode: 0o755 });

    const result = await runBinary({
      binaryDir: workDir,
      binaryName: 'program',
      timeoutMs: job.timeoutSeconds * 1000,
      runtime: config.runtime || undefined,
    });
    send({ type: 'result', jobId: job.jobId, ...result });
    console.log(`Job ${job.jobId} finished: exit code ${result.exitCode}, ${result.durationMs} ms`);
  } catch (err) {
    const message = (err as Error).message;
    console.error(`Job ${job.jobId} failed in the agent: ${message}`);
    send({
      type: 'result',
      jobId: job.jobId,
      exitCode: null,
      stdout: '',
      stderr: `Agent error: ${message}`,
      durationMs: 0,
      timedOut: false,
    });
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

connect();
