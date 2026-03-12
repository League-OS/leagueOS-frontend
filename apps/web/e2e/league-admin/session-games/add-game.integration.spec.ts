import { expect, test } from '@playwright/test';
import { loginWithAnyCredential } from '../../auth';

const API_BASE = process.env.E2E_API_BASE || 'http://127.0.0.1:8000';

test('login endpoint rejects invalid password', async ({ request }) => {
  const res = await request.post(`${API_BASE}/auth/login`, {
    data: { email: 'leagueadmin@leagueos.local', password: 'bad-password' },
  });
  expect(res.status()).toBeGreaterThanOrEqual(400);
});

test('authenticated user can open admin page', async ({ page }) => {
  await loginWithAnyCredential(page);
  await page.goto('/admin');
  await expect(page.getByRole('button', { name: /sign in/i })).toHaveCount(0);
});

test('authenticated user can open add game modal', async ({ page }) => {
  await loginWithAnyCredential(page);
  await page.goto('/');
  await page.getByRole('button', { name: /^(\+|Add Game)$/i }).first().click();
  await expect(page.getByRole('heading', { name: /New Game|Add Game/i })).toBeVisible();
});
