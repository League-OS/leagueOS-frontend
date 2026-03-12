import { expect, test } from '@playwright/test';
import { loginWithAnyCredential } from '../../auth';

test('authenticated home loads without sign-in button', async ({ page }) => {
  await loginWithAnyCredential(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: /sign in/i })).toHaveCount(0);
});

test('home renders recent games section', async ({ page }) => {
  await loginWithAnyCredential(page);
  await page.goto('/');
  await expect(page.getByText(/Recent Games|No games yet/i).first()).toBeVisible();
});
