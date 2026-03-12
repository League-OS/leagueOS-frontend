import type { Page } from '@playwright/test';

export async function waitForPostLoginReady(page: Page, timeout = 20_000) {
  // Authenticated-shell signals. Avoid URL-only checks because login page can also be at '/'.
  const readinessChecks: Promise<unknown>[] = [
    page.getByRole('button', { name: /^(\+|Add Game)$/i }).first().waitFor({ timeout }),
    page.getByRole('heading', { name: /season leaderboard|new game|edit game/i }).first().waitFor({ timeout }),
    page.getByRole('button', { name: /sign out|logout/i }).first().waitFor({ timeout }),
    page.getByRole('button', { name: /home|leaderboard/i }).first().waitFor({ timeout }),
  ];

  await Promise.any(readinessChecks);

  // Guard against false positives where the Sign In screen is still visible.
  const signInVisible = await page.getByRole('button', { name: /sign in/i }).isVisible().catch(() => false);
  const emailVisible = await page.getByLabel('Email').isVisible().catch(() => false);
  if (signInVisible && emailVisible) {
    throw new Error('Post-login readiness failed: still on Sign In view');
  }
}
