import { runBinary } from './runner.js';

const [binaryDir, binaryName, timeoutSeconds = '30'] = process.argv.slice(2);

if (!binaryDir || !binaryName) {
  console.error('Usage: npm run run-local -- <binary-dir> <binary-name> [timeout-seconds]');
  process.exit(1);
}

const result = await runBinary({
  binaryDir,
  binaryName,
  timeoutMs: Number(timeoutSeconds) * 1000,
});

console.log('--- stdout ---');
console.log(result.stdout.trimEnd());
console.log('--- stderr ---');
console.log(result.stderr.trimEnd());
console.log('--- result ---');
console.log({
  exitCode: result.exitCode,
  durationMs: result.durationMs,
  timedOut: result.timedOut,
});
