import { expect, test, type APIRequestContext } from '@playwright/test';

const API_BASE = process.env.E2E_API_BASE || 'http://127.0.0.1:8000';
const EMAIL = process.env.E2E_PLAYER_EMAIL || 'playerone@leagueos.local';
const PASSWORD = process.env.E2E_PLAYER_PASSWORD || 'PlayerOne@123';

async function apiLogin(request: APIRequestContext, email: string, password: string) {
  const res = await request.post(`${API_BASE}/auth/login`, { data: { email, password } });
  if (!res.ok()) {
    throw new Error(`API login failed: ${res.status()} ${await res.text()}`);
  }
  return (await res.json()) as { token: string };
}

test('LOS-106 proof: show_on_leaderboard preference persists via profile API', async ({ page, request }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByPlaceholder('Enter your password').fill(PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();

  const loginRes = await request.post(`${API_BASE}/auth/login`, { data: { email: EMAIL, password: PASSWORD } });
  if (!loginRes.ok()) {
    test.skip(true, `API login failed ${loginRes.status()} (check E2E_API_BASE and credentials)`);
  }
  const auth = (await loginRes.json()) as { token: string };

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
