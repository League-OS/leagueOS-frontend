import { test, expect } from '@playwright/test';

test('tournaments route is reachable', async ({ page }) => {
  await page.goto('/tournaments/1');
  await expect(page).toHaveURL(/\/tournaments\/1/);
});
