/**
 * Playwright global setup: login once and save auth storage state.
 * All tests then reuse the saved state to avoid repeated logins
 * (which can trigger API rate limiting).
 */

import { chromium } from '@playwright/test';
import path from 'path';

const EMAIL    = process.env.E2E_EMAIL    || 'playerone@leagueos.local';
const PASSWORD = process.env.E2E_PASSWORD || 'PlayerOne@123';

export const AUTH_STATE_PATH = path.resolve(__dirname, '../.auth-state.json');

export default async function globalSetup() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(process.env.E2E_BASE_URL || 'http://127.0.0.1:3000');

  await page.getByLabel('Email').fill(EMAIL);
  await page.getByPlaceholder('Enter your password').fill(PASSWORD);
  await page.getByRole('button', { name: /Sign In/i }).click();

  // Wait until dashboard is ready
  await page.getByRole('button', { name: '+' }).waitFor({ timeout: 20_000 });

  await context.storageState({ path: AUTH_STATE_PATH });
  await browser.close();
}
