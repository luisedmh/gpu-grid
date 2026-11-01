import { randomInt } from 'node:crypto';

/**
 * Verification jobs: small CUDA programs whose correct output only the platform knows.
 *
 * Each one gets random parameters, so its answer cannot be guessed or remembered,
 * and to the machine it is just another job. The platform works out the answer
 * itself, on the CPU, with exactly the same integer arithmetic as the GPU.
 */

export interface CheckProgram {
  sourceCode: string;
  /** The line the program must print */
  expectedOutput: string;
}

/** Arithmetic modulo 2^64, like `unsigned long long` in CUDA. */
const MASK = (1n << 64n) - 1n;
const MULTIPLIER = 0x9e3779b97f4a7c15n;

/** What each GPU thread computes for its index i: a few rounds of integer mixing. */
function mix(i: bigint, a: bigint, b: bigint): bigint {
  let x = (i * a + b) & MASK;
  x ^= x >> 13n;
  x = (x * MULTIPLIER) & MASK;
  x ^= x >> 29n;
  return x;
}

/** The sum (modulo 2^64) of what every thread computes: the expected answer. */
export function expectedChecksum(n: number, a: number, b: number): bigint {
  const bigA = BigInt(a);
  const bigB = BigInt(b);
  let sum = 0n;
  for (let i = 0n; i < BigInt(n); i++) sum = (sum + mix(i, bigA, bigB)) & MASK;
  return sum;
}

/** Writes the CUDA program for some parameters. */
export function checkSource(n: number, a: number, b: number): string {
  return `#include <cstdio>

__global__ void mix(unsigned long long *sum, unsigned int n, unsigned int a, unsigned int b) {
  unsigned int i = blockIdx.x * blockDim.x + threadIdx.x;
  if (i >= n) return;
  unsigned long long x = (unsigned long long)i * a + b;
  x ^= x >> 13;
  x *= 0x9E3779B97F4A7C15ull;
  x ^= x >> 29;
  atomicAdd(sum, x);  // additions modulo 2^64: the order does not matter
}

int main() {
  const unsigned int n = ${n}u, a = ${a}u, b = ${b}u;
  unsigned long long *sum, result = 0;
  cudaMalloc(&sum, sizeof(result));
  cudaMemset(sum, 0, sizeof(result));
  mix<<<(n + 255) / 256, 256>>>(sum, n, a, b);
  cudaError_t err = cudaMemcpy(&result, sum, sizeof(result), cudaMemcpyDeviceToHost);
  if (err != cudaSuccess) {
    printf("CUDA error: %s\\n", cudaGetErrorString(err));
    return 1;
  }
  printf("checksum %llu\\n", result);
  return 0;
}
`;
}

/** A new verification program with random parameters, and its answer. */
export function generateCheck(): CheckProgram {
  // Enough threads to need the GPU, few enough that the CPU checks it in a moment
  const n = randomInt(100_000, 200_000);
  const a = randomInt(1, 2 ** 32 - 1);
  const b = randomInt(0, 2 ** 32 - 1);
  return {
    sourceCode: checkSource(n, a, b),
    expectedOutput: `checksum ${expectedChecksum(n, a, b)}`,
  };
}
