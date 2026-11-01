import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SANDBOX_USER, sandboxArgs } from './runner.js';

const options = { binaryDir: '/tmp/job', binaryName: 'program', timeoutMs: 1000 };

/** The value that follows a flag, e.g. valueOf(args, '--network') === 'none'. */
const valueOf = (args: string[], flag: string) => args[args.indexOf(flag) + 1];

describe('sandboxArgs', () => {
  const args = sandboxArgs(options, 'test-container');

  it('cuts the program off from the network', () => {
    assert.equal(valueOf(args, '--network'), 'none');
  });

  it('runs it as an unprivileged user that can never gain privileges', () => {
    assert.equal(valueOf(args, '--user'), SANDBOX_USER);
    assert.equal(valueOf(args, '--cap-drop'), 'ALL');
    assert.equal(valueOf(args, '--security-opt'), 'no-new-privileges');
  });

  it('makes the file system read-only, with a /tmp nothing can be run from', () => {
    assert.ok(args.includes('--read-only'));
    assert.match(valueOf(args, '--tmpfs'), /^\/tmp:.*noexec/);
    assert.equal(valueOf(args, '-v'), '/tmp/job:/work:ro');
  });

  it('limits memory without swap, CPU and processes', () => {
    assert.equal(valueOf(args, '--memory'), valueOf(args, '--memory-swap'));
    assert.ok(valueOf(args, '--cpus'));
    assert.ok(Number(valueOf(args, '--pids-limit')) <= 64);
  });

  it('gives access to the GPU and runs the binary', () => {
    assert.equal(valueOf(args, '--gpus'), 'all');
    assert.equal(args.at(-1), '/work/program');
  });

  it('can run another command in the same sandbox, for the start-up check', () => {
    const check = sandboxArgs({ ...options, command: ['nvidia-smi', '-L'] }, 'check');
    assert.deepEqual(check.slice(-2), ['nvidia-smi', '-L']);
    assert.equal(valueOf(check, '--network'), 'none');
  });

  it('uses gVisor only when asked to', () => {
    assert.ok(!args.includes('--runtime'));
    const withGvisor = sandboxArgs({ ...options, runtime: 'runsc' }, 'test-container');
    assert.equal(valueOf(withGvisor, '--runtime'), 'runsc');
    // The runtime must come before the image: everything after it is the command
    assert.ok(withGvisor.indexOf('--runtime') < withGvisor.indexOf('ubuntu:24.04'));
  });
});
