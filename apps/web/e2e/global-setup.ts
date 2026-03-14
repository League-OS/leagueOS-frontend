/**
 * Playwright global setup: login once and save auth storage state.
 * All tests then reuse the saved state to avoid repeated logins
 * (which can trigger API rate limiting).
 */

import { chromium } from '@playwright/test';
import path from 'path';
import { loginWithAnyCredential } from './auth';

export const AUTH_STATE_PATH = path.resolve(__dirname, '../.auth-state.json');

export default async function globalSetup() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(process.env.E2E_BASE_URL || 'http://127.0.0.1:3000');
  try {
    await loginWithAnyCredential(page);
  } catch {
    // Keep setup resilient to temporary auth rate-limits; tests can still login as needed.
  }

  await context.storageState({ path: AUTH_STATE_PATH });
  await browser.close();
}
