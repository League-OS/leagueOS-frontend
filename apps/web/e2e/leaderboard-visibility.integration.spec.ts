import { expect, test } from '@playwright/test';

const API_BASE = process.env.E2E_API_BASE || 'http://127.0.0.1:8000';
const UI_EMAIL = process.env.E2E_PLAYER_EMAIL || 'playerone@leagueos.local';
const UI_PASSWORD = process.env.E2E_PLAYER_PASSWORD || 'PlayerOne@123';

async function apiLogin(request: Parameters<typeof test>[0]['request'], email: string, password: string) {
  const res = await request.post(`${API_BASE}/auth/login`, { data: { email, password } });
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as { token: string; club_id: number };
}

test('profile leaderboard visibility toggle hides player from leaderboard and keeps contiguous ranks', async ({ page, request }) => {
  const auth = await apiLogin(request, UI_EMAIL, UI_PASSWORD);

  const profileRes = await request.get(`${API_BASE}/profile`, { headers: { Authorization: `Bearer ${auth.token}` } });
  expect(profileRes.ok()).toBeTruthy();
  const profile = (await profileRes.json()) as { email: string; display_name?: string | null; full_name?: string | null };

  const playersRes = await request.get(`${API_BASE}/players?club_id=${auth.club_id}&is_active=true`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  });
  expect(playersRes.ok()).toBeTruthy();
  const players = (await playersRes.json()) as Array<{ id: number; email?: string | null; display_name: string }>;
  const profileNames = [profile.display_name || '', profile.full_name || '']
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  const me =
    players.find((p) => (p.email || '').toLowerCase() === profile.email.toLowerCase()) ||
    players.find((p) => profileNames.includes((p.display_name || '').trim().toLowerCase()));
  expect(me).toBeTruthy();

  const seasonsRes = await request.get(`${API_BASE}/seasons?club_id=${auth.club_id}&is_active=true`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  });
  expect(seasonsRes.ok()).toBeTruthy();
  const seasons = (await seasonsRes.json()) as Array<{ id: number }>;

  const sessionsRes = await request.get(`${API_BASE}/sessions?club_id=${auth.club_id}&season_id=${seasons[0].id}`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  });
  expect(sessionsRes.ok()).toBeTruthy();
  const sessions = (await sessionsRes.json()) as Array<{ id: number; status: string }>;
  const finalized = sessions.find((s) => s.status === 'FINALIZED');
  expect(finalized).toBeTruthy();

  await page.goto('/');
  await page.getByLabel('Email').fill(UI_EMAIL);
  await page.getByPlaceholder('Enter your password').fill(UI_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();

  await page.getByRole('button', { name: 'Profile' }).click();
  await page.getByLabel('Show my name on leaderboards').uncheck();

  await page.getByRole('button', { name: 'Leaderboard' }).click();
  await expect(page.getByRole('heading', { name: 'Season Leaderboard' })).toBeVisible();
  await expect(page.getByText(me!.display_name).first()).toHaveCount(0);

  const lbRes = await request.get(`${API_BASE}/sessions/${finalized!.id}/leaderboard?club_id=${auth.club_id}`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  });
  expect(lbRes.ok()).toBeTruthy();
  const rows = (await lbRes.json()) as Array<{ rank?: number; player_id: number }>;
  expect(rows.some((r) => r.player_id === me!.id)).toBeFalsy();
  rows.forEach((row, idx) => {
    if (typeof row.rank === 'number') {
      expect(row.rank).toBe(idx + 1);
    }
  });

  // cleanup: opt back in for future runs
  const resetRes = await request.put(`${API_BASE}/profile`, {
    headers: { Authorization: `Bearer ${auth.token}` },
    data: { show_on_leaderboard: true },
  });
  expect(resetRes.ok()).toBeTruthy();
});
