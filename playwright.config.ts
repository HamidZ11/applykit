import { defineConfig } from '@playwright/test';
import type { Concept, ExtensionOptions } from './e2e/extension';

const FIXTURE_PORT = '4399';

export default defineConfig<ExtensionOptions>({
  testDir: 'e2e',
  // Tests run one at a time. Each currently launches its own headless
  // browser with the extension loaded (see e2e/extension.ts).
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  outputDir: 'test-results',
  use: {
    // Never open visible browser windows; see CLAUDE.md.
    headless: true,
    baseURL: `http://127.0.0.1:${FIXTURE_PORT}`,
    trace: 'retain-on-failure',
  },
  // Every browser test runs against each panel concept's real build.
  projects: (['command-dock', 'field-inspector'] satisfies Concept[]).map(
    (concept) => ({ name: concept, use: { concept } }),
  ),
  webServer: {
    command: 'node scripts/serve-fixtures.mjs',
    url: `http://127.0.0.1:${FIXTURE_PORT}/basic-application.html`,
    env: { PORT: FIXTURE_PORT },
    reuseExistingServer: false,
  },
});
