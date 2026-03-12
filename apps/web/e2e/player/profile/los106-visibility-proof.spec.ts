import { expect, test } from '@playwright/test';

const API_BASE = process.env.E2E_API_BASE || 'http://127.0.0.1:8000';
const EMAIL = process.env.E2E_PLAYER_EMAIL || 'playerone@leagueos.local';
const PASSWORD = process.env.E2E_PLAYER_PASSWORD || 'PlayerOne@123';

test('LOS-106 proof: player can toggle leaderboard visibility preference', async ({ page, request }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByPlaceholder('Enter your password').fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();

  const profileTab = page.getByRole('button', { name: /^[◉◎]\s*Profile$/ });
  if (await profileTab.count()) {
    await profileTab.first().click();
  } else {
    await page.getByRole('button', { name: /Open profile/i }).first().click();
  }

  const toggle = page.getByLabel('Hide my name on leaderboard');
  await expect(toggle).toBeVisible();

  const authRaw = await page.evaluate(() => window.localStorage.getItem('leagueos.player.auth'));
  expect(authRaw).toBeTruthy();
  const auth = JSON.parse(String(authRaw)) as { token: string };

  await toggle.click();

  await expect.poll(async () => {
    const profileRes = await request.get(`${API_BASE}/profile`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    });
    if (!profileRes.ok()) return 'error';
    const profile = (await profileRes.json()) as { show_on_leaderboard?: boolean };
    return String(profile.show_on_leaderboard);
  }).toBe('false');

  await toggle.click();

  await expect.poll(async () => {
    const profileRes = await request.get(`${API_BASE}/profile`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    });
    if (!profileRes.ok()) return 'error';
    const profile = (await profileRes.json()) as { show_on_leaderboard?: boolean };
    return String(profile.show_on_leaderboard);
  }).toBe('true');
});
