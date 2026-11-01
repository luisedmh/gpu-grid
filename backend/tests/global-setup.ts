import { execSync } from 'node:child_process';

/** Runs once before all tests: brings the test database schema up to date. */
export default function setup() {
  execSync('npx prisma migrate deploy', { stdio: 'inherit' });
}
