import path from 'path';
import { defineConfig, devices } from '@playwright/test';

const artifactDir = process.env.E2E_ARTIFACT_DIR || 'artifacts/integration-e2e/latest';
const authStatePath = path.resolve(__dirname, '.auth-state.json');

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  globalSetup: './e2e/global-setup.ts',
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
    storageState: authStatePath,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], storageState: authStatePath },
      testIgnore: [
        /add-game\.integration\.spec\.ts/,
        /login-redirect-by-role\.integration\.spec\.ts/,
        /leaderboard\.integration\.spec\.ts/,
        /leaderboard-visibility\.integration\.spec\.ts/,
        /los106-(api-proof|preference-persistence|visibility-proof)\.spec\.ts/,
      ],
    },
    {
      name: 'chromium-no-auth',
      use: { ...devices['Desktop Chrome'], storageState: { cookies: [], origins: [] } },
      testMatch: [
        '**/add-game.integration.spec.ts',
        '**/login-redirect-by-role.integration.spec.ts',
        '**/leaderboard.integration.spec.ts',
        '**/leaderboard-visibility.integration.spec.ts',
        '**/los106-api-proof.spec.ts',
        '**/los106-preference-persistence.spec.ts',
        '**/los106-visibility-proof.spec.ts',
      ],
    },
  ],
});
