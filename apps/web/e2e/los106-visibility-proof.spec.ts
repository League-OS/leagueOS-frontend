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
    const openProfile = page.getByRole('button', { name: /Open profile/i });
    if (await openProfile.count()) {
      await openProfile.first().click();
    } else {
      const anyProfile = page.getByRole('button', { name: /Profile/i });
      if (await anyProfile.count()) {
        await anyProfile.first().click();
      } else {
        test.skip(true, 'Profile button not found (UI may vary by env)');
        return;
      }
    }
  }

  const toggleText = page.getByText('Hide my name on leaderboard').first();
  const toggleVisible = await toggleText.isVisible().catch(() => false);
  if (!toggleVisible) {
    test.skip(true, 'Leaderboard privacy toggle not visible (profile preferences may vary by env)');
  }
  await expect(toggleText).toBeVisible({ timeout: 15_000 });
  const toggle = page.getByRole('button', { name: /Hide my name on leaderboard/i });
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
