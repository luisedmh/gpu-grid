import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

/** File names used inside every job folder. */
export const SOURCE_FILE = 'main.cu';
export const BINARY_FILE = 'program';

export interface CompileResult {
  success: boolean;
  /** Everything nvcc printed (warnings and errors), in order. */
  output: string;
  timedOut: boolean;
}

/** Compiles the source file found in a job folder, leaving the binary next to it. */
export type Compiler = (workDir: string) => Promise<CompileResult>;

/**
 * Builds a fat binary: native code for Turing, Ampere, Ada, Hopper and Blackwell GPUs,
 * plus PTX so newer GPUs can compile it at load time.
 */
const NATIVE_ARCHS = ['75', '80', '86', '89', '90', '120'];
const PTX_ARCH = '120';
const NVCC_ARCH_FLAGS = [
  ...NATIVE_ARCHS.flatMap((sm) => ['-gencode', `arch=compute_${sm},code=sm_${sm}`]),
  '-gencode',
  `arch=compute_${PTX_ARCH},code=compute_${PTX_ARCH}`,
];

const MAX_OUTPUT_CHARS = 100_000;

/**
 * Compiler that runs nvcc in a throwaway container: no network, no GPU,
 * limited memory, CPU and processes, and a time limit.
 */
export function createDockerCompiler(options: { image: string; timeoutMs: number }): Compiler {
  return (workDir) =>
    new Promise((resolve, reject) => {
      const containerName = `gpugrid-compile-${randomUUID()}`;
      const user = `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`;

      const args = [
        'run',
        '--rm',
        '--name',
        containerName,
        '--network',
        'none',
        '--user',
        user,
        '--memory',
        '2g',
        '--cpus',
        '2',
        '--pids-limit',
        '256',
        '-v',
        `${workDir}:/work`,
        '-w',
        '/work',
        // Call nvcc directly: skips the image's welcome banner and GPU warning
        '--entrypoint',
        'nvcc',
        options.image,
        '-O2',
        '-o',
        BINARY_FILE,
        SOURCE_FILE,
        ...NVCC_ARCH_FLAGS,
      ];

      const child = spawn('docker', args);
      let output = '';
      let timedOut = false;

      const append = (chunk: Buffer) => {
        if (output.length < MAX_OUTPUT_CHARS) output += chunk.toString();
      };
      child.stdout.on('data', append);
      child.stderr.on('data', append);

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
        resolve({ success: code === 0 && !timedOut, output: output.trimEnd(), timedOut });
      });
    });
}
