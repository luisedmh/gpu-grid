import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

export interface RunOptions {
  /** Folder that contains the compiled binary. */
  binaryDir: string;
  /** File name of the binary inside binaryDir. */
  binaryName: string;
  /** Maximum running time before the job is killed. */
  timeoutMs: number;
  /** Image used to run the binary. It does not need CUDA installed. */
  image?: string;
  /** Docker runtime, e.g. "runsc" for gVisor. Docker's default when not given. */
  runtime?: string;
  /** Command to run instead of the binary (used by the start-up check). */
  command?: string[];
}

export interface RunResult {
  /** Exit code of the program (null if it could not be determined). */
  exitCode: number | null;
  stdout: string;
  stderr: string;
  /** Wall time, including container start-up. */
  durationMs: number;
  timedOut: boolean;
}

/** Output beyond this size is discarded, so a program cannot flood memory. */
const MAX_OUTPUT_CHARS = 1_000_000;

/** Unprivileged user the program runs as inside the container ("nobody"). */
export const SANDBOX_USER = '65534:65534';

/**
 * The `docker run` arguments that isolate a job. Each line is one layer of defence:
 * the program can use the GPU and print, and nothing else.
 */
export function sandboxArgs(options: RunOptions, containerName: string): string[] {
  return [
    'run',
    '--rm',
    '--name',
    containerName,
    // gVisor (runsc) puts a second kernel between the program and the real one
    ...(options.runtime ? ['--runtime', options.runtime] : []),
    '--gpus',
    'all',
    // No network: it cannot send data anywhere or attack other machines
    '--network',
    'none',
    // An unprivileged user, without any Linux capability, that can never gain more
    '--user',
    SANDBOX_USER,
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges',
    // Nothing on disk can be changed; only a small scratch /tmp, from which nothing can run
    '--read-only',
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,size=64m',
    // CUDA would otherwise try to write its compilation cache in the home folder
    '--env',
    'CUDA_CACHE_DISABLE=1',
    // Resource limits: memory (without swap), CPU, processes and open files
    '--memory',
    '4g',
    '--memory-swap',
    '4g',
    '--cpus',
    '2',
    '--pids-limit',
    '64',
    '--ulimit',
    'nofile=256:256',
    // The binary, read-only
    '-v',
    `${path.resolve(options.binaryDir)}:/work:ro`,
    options.image ?? 'ubuntu:24.04',
    ...(options.command ?? [`/work/${options.binaryName}`]),
  ];
}

/**
 * Runs a compiled CUDA binary inside a short-lived, locked-down Docker container
 * (see sandboxArgs) and kills it if it runs out of time.
 */
export function runBinary(options: RunOptions): Promise<RunResult> {
  const containerName = `gpugrid-job-${randomUUID()}`;
  const args = sandboxArgs(options, containerName);

  return new Promise((resolve, reject) => {
    const start = performance.now();
    const child = spawn('docker', args);

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const append = (current: string, chunk: Buffer) =>
      current.length >= MAX_OUTPUT_CHARS ? current : current + chunk.toString();

    child.stdout.on('data', (chunk: Buffer) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = append(stderr, chunk);
    });

    // Killing the `docker` client process would leave the container running,
    // so on timeout we ask Docker to kill the container itself.
    const timer = setTimeout(() => {
      timedOut = true;
      spawn('docker', ['kill', containerName]);
    }, options.timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        exitCode: code,
        stdout,
        stderr,
        durationMs: Math.round(performance.now() - start),
        timedOut,
      });
    });
  });
}
