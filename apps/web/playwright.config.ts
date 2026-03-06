import { defineConfig, devices } from '@playwright/test';

const artifactDir = process.env.E2E_ARTIFACT_DIR || 'artifacts/integration-e2e/latest';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: `${artifactDir}/html-report`, open: 'never' }],
    ['json', { outputFile: `${artifactDir}/results.json` }],
  ],
  outputDir: `${artifactDir}/test-output`,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:3000',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    trace: 'on',
    video: 'on',
    screenshot: 'on',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
