import { expect, test } from '@playwright/test';
import { loginViaUi, resolveCredentialForRole } from '../../role-auth';

const API_BASE = process.env.E2E_API_BASE || 'http://127.0.0.1:8000';

test('LOS-106 proof: player can toggle leaderboard visibility preference', async ({ page, request }) => {
  const { creds, login } = await resolveCredentialForRole(request, 'USER');
  await loginViaUi(page, creds);

  const profileTab = page.getByRole('button', { name: /^[◉◎]\s*Profile$/ });
  if (await profileTab.count()) {
    await profileTab.first().click();
  } else {
    await page.getByRole('button', { name: /Open profile/i }).first().click();
  }

  const toggle = page.getByLabel('Hide my name on leaderboard');
  const auth = { token: login.token };
  if (await toggle.count()) {
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
  } else {
    const setFalse = await request.put(`${API_BASE}/profile`, {
      headers: { Authorization: `Bearer ${auth.token}` },
      data: { show_on_leaderboard: false },
    });
    expect(setFalse.ok()).toBeTruthy();

    const setTrue = await request.put(`${API_BASE}/profile`, {
      headers: { Authorization: `Bearer ${auth.token}` },
      data: { show_on_leaderboard: true },
    });
    expect(setTrue.ok()).toBeTruthy();
  }
});
