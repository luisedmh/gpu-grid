import { config } from 'dotenv';
import { defineConfig } from 'vitest/config';

// Tests run against their own database, never the development one
const testEnv = config({ path: '.env.test', override: true, quiet: true }).parsed ?? {};

export default defineConfig({
  test: {
    env: testEnv,
    globalSetup: ['tests/global-setup.ts'],
    // Test files share one database, so they must not run at the same time
    fileParallelism: false,
  },
});
