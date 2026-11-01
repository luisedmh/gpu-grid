import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { GpuInfo } from './protocol.js';

const execFileAsync = promisify(execFile);

/** Asks the NVIDIA driver which GPUs this machine has. */
export async function readGpuInfo(): Promise<GpuInfo[]> {
  try {
    const { stdout } = await execFileAsync('nvidia-smi', [
      '--query-gpu=name,memory.total,compute_cap',
      '--format=csv,noheader,nounits',
    ]);
    return parseNvidiaSmi(stdout);
  } catch (err) {
    console.warn('Could not read GPU information from nvidia-smi:', (err as Error).message);
    return [];
  }
}

/** Parses lines like "NVIDIA GeForce RTX 3060 Ti, 8192, 8.6". */
export function parseNvidiaSmi(output: string): GpuInfo[] {
  return output
    .trim()
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const [name, memory, computeCapability] = line.split(',').map((part) => part.trim());
      return { name, memoryMb: Number(memory), computeCapability };
    });
}
