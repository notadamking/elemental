import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'path';

const projectRoot = resolve(__dirname, '../..');
const testDbPath = resolve(projectRoot, '.elemental-test/elemental.db');

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'list',
  globalSetup: './tests/global-setup.ts',
  globalTeardown: './tests/global-teardown.ts',
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: `ELEMENTAL_DB_PATH=${testDbPath} DAEMON_AUTO_START=false tsx ${resolve(projectRoot, 'apps/orchestrator-server/src/index.ts')}`,
      port: 3457,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run dev',
      port: 5174,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
