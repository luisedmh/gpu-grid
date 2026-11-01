import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseNvidiaSmi } from './gpu-info.js';

describe('parseNvidiaSmi', () => {
  it('reads one GPU per line', () => {
    const gpus = parseNvidiaSmi(
      'NVIDIA GeForce RTX 3060 Ti, 8192, 8.6\nNVIDIA GeForce RTX 4090, 24564, 8.9\n',
    );
    assert.deepEqual(gpus, [
      { name: 'NVIDIA GeForce RTX 3060 Ti', memoryMb: 8192, computeCapability: '8.6' },
      { name: 'NVIDIA GeForce RTX 4090', memoryMb: 24564, computeCapability: '8.9' },
    ]);
  });

  it('returns nothing for empty output', () => {
    assert.deepEqual(parseNvidiaSmi('\n'), []);
  });
});
