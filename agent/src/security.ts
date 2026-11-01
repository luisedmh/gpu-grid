import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { runBinary } from './runner.js';

const execFileAsync = promisify(execFile);

/** Container runtimes Docker has installed (e.g. "runc", and "runsc" if gVisor is set up). */
export async function dockerRuntimes(): Promise<string[]> {
  const { stdout } = await execFileAsync('docker', ['info', '--format', '{{json .Runtimes}}']);
  return Object.keys(JSON.parse(stdout) as Record<string, unknown>);
}

/**
 * Checks the sandbox before taking any job, and explains what protects this machine.
 * Throws if the configured runtime is missing: better not to run than to run unprotected.
 */
export async function checkSandbox(runtime: string, workDir: string): Promise<string[]> {
  const available = await dockerRuntimes();
  if (runtime && !available.includes(runtime)) {
    throw new Error(
      `AGENT_RUNTIME is "${runtime}", but Docker only has: ${available.join(', ')}. ` +
        'Install it (see SECURITY.md) or remove AGENT_RUNTIME.',
    );
  }

  // Run nvidia-smi inside the very same sandbox the jobs use: if the GPU is not
  // visible there, every job would fail, so it is better to stop now and say why
  // (In the work folder: when the agent itself runs in Docker, that folder exists on the host too)
  await mkdir(workDir, { recursive: true });
  const emptyDir = await mkdtemp(path.join(workDir, 'gpugrid-check-'));
  try {
    const check = await runBinary({
      binaryDir: emptyDir,
      binaryName: 'none',
      timeoutMs: 60_000,
      runtime: runtime || undefined,
      command: ['nvidia-smi', '-L'],
    });
    if (check.exitCode !== 0) {
      throw new Error(
        'The GPU is not visible inside the job sandbox:\n' +
          `${(check.stderr || check.stdout).trim()}\n` +
          'Check that the NVIDIA Container Toolkit works: ' +
          'docker run --rm --gpus all ubuntu:24.04 nvidia-smi',
      );
    }
  } finally {
    await rm(emptyDir, { recursive: true, force: true });
  }

  const lines = [
    'Sandbox check passed: the GPU is visible inside the job sandbox.',
    'Jobs run without network, as an unprivileged user with no capabilities,',
    'on a read-only file system, with memory, CPU and process limits.',
  ];
  if (runtime === 'runsc') {
    lines.push('gVisor is on: programs talk to a sandbox kernel, not to this machine’s kernel.');
  } else if (available.includes('runsc')) {
    lines.push('gVisor is installed but not used: set AGENT_RUNTIME=runsc to turn it on.');
  } else {
    lines.push('For stronger isolation, install gVisor and set AGENT_RUNTIME=runsc (SECURITY.md).');
  }
  return lines;
}
