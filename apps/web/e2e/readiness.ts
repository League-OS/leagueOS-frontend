import type { Page } from '@playwright/test';

export async function waitForPostLoginReady(page: Page, timeout = 20_000) {
  const readinessChecks: Promise<unknown>[] = [
    page.getByRole('button', { name: '+' }).waitFor({ timeout }),
    page.getByRole('heading', { name: /dashboard|admin/i }).waitFor({ timeout }),
    page.getByRole('button', { name: /sign out|logout/i }).waitFor({ timeout }),
    page.waitForURL((url) => !/\/login|\/signin/i.test(url.pathname), { timeout }),
  ];

  await Promise.any(readinessChecks);
}
