import { expect, test } from '@playwright/test';
import { loginWithAnyCredential } from '../../auth';

test('home loads for league admin', async ({ page }) => {
  await loginWithAnyCredential(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: /sign in/i })).toHaveCount(0);
});

test('add game trigger is visible', async ({ page }) => {
  await loginWithAnyCredential(page);
  await page.goto('/');
  await expect(page.getByRole('button', { name: /^(\+|Add Game)$/i }).first()).toBeVisible();
});

test('open add game modal from home', async ({ page }) => {
  await loginWithAnyCredential(page);
  await page.goto('/');
  await page.getByRole('button', { name: /^(\+|Add Game)$/i }).first().click();
  await expect(page.getByRole('heading', { name: /New Game|Add Game/i })).toBeVisible();
});
