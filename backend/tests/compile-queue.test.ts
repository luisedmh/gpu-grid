import { describe, expect, it, vi } from 'vitest';
import { CompileQueue } from '../src/compiler/compile-queue.js';

/** Resolves once every pending promise callback has had a chance to run. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('CompileQueue', () => {
  it('never runs more tasks at once than its concurrency', async () => {
    let running = 0;
    let maxRunning = 0;
    const finishers: Array<() => void> = [];

    const queue = new CompileQueue(2, async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise<void>((resolve) => finishers.push(resolve));
      running--;
    });

    ['a', 'b', 'c', 'd'].forEach((id) => queue.add(id));
    expect(running).toBe(2);
    expect(queue.size).toBe(4);

    while (finishers.length > 0) {
      finishers.shift()?.();
      await settle();
    }

    expect(maxRunning).toBe(2);
    expect(queue.size).toBe(0);
  });

  it('keeps going when a task fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const done: string[] = [];
    const queue = new CompileQueue(1, async (id) => {
      if (id === 'bad') throw new Error('boom');
      done.push(id);
    });

    queue.add('bad');
    queue.add('good');
    await settle();
    await settle();

    expect(done).toEqual(['good']);
  });
});
