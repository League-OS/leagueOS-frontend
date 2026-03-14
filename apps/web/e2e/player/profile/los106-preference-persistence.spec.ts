import { expect, test } from '@playwright/test';
import { loginViaUi, resolveCredentialForRole } from '../../role-auth';

const API_BASE = process.env.E2E_API_BASE || 'http://127.0.0.1:8000';

test('LOS-106 proof: show_on_leaderboard preference persists via profile API', async ({ page, request }) => {
  const { creds, login } = await resolveCredentialForRole(request, 'USER');
  await loginViaUi(page, creds);
  const auth = { token: login.token };

  const setFalse = await request.put(`${API_BASE}/profile`, {
    headers: { Authorization: `Bearer ${auth.token}` },
    data: { show_on_leaderboard: false },
  });
  expect(setFalse.ok()).toBeTruthy();

  const profileFalse = await request.get(`${API_BASE}/profile`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  });
  expect(profileFalse.ok()).toBeTruthy();
  const pFalse = (await profileFalse.json()) as { show_on_leaderboard?: boolean };
  expect(pFalse.show_on_leaderboard).toBe(false);

  const setTrue = await request.put(`${API_BASE}/profile`, {
    headers: { Authorization: `Bearer ${auth.token}` },
    data: { show_on_leaderboard: true },
  });
  expect(setTrue.ok()).toBeTruthy();

  const profileTrue = await request.get(`${API_BASE}/profile`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  });
  expect(profileTrue.ok()).toBeTruthy();
  const pTrue = (await profileTrue.json()) as { show_on_leaderboard?: boolean };
  expect(pTrue.show_on_leaderboard).toBe(true);
});
