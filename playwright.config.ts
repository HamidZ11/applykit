import { defineConfig } from '@playwright/test';

const FIXTURE_PORT = '4399';

export default defineConfig({
  testDir: 'e2e',
  // Tests share one browser with the extension loaded and one toolbar.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    baseURL: `http://127.0.0.1:${FIXTURE_PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/serve-fixtures.mjs',
    url: `http://127.0.0.1:${FIXTURE_PORT}/basic-application.html`,
    env: { PORT: FIXTURE_PORT },
    reuseExistingServer: false,
  },
});
