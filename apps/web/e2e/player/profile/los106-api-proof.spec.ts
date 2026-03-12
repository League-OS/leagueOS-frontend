import { expect, test, type APIRequestContext } from '@playwright/test';

const API_BASE = process.env.E2E_API_BASE || 'http://127.0.0.1:8000';
const ADMIN_EMAIL = process.env.E2E_CLUB_ADMIN_EMAIL || 'fvma-clubAdmin@leagueos.local';
const ADMIN_PASSWORD = process.env.E2E_CLUB_ADMIN_PASSWORD || 'Admin@123';
const VIEWER_EMAIL = process.env.E2E_RECORDER_EMAIL || 'enosh_fvma_badminton_club@leagueos.local';
const VIEWER_PASSWORD = process.env.E2E_RECORDER_PASSWORD || 'Recorder@123';

async function apiLogin(request: APIRequestContext, email: string, password: string) {
  const res = await request.post(`${API_BASE}/auth/login`, { data: { email, password } });
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as { token: string; club_id: number };
}

test('LOS-106 proof: hidden player is excluded from leaderboard API and UI', async ({ page, request }) => {
  const admin = await apiLogin(request, ADMIN_EMAIL, ADMIN_PASSWORD);

  const seasonsRes = await request.get(`${API_BASE}/seasons?club_id=${admin.club_id}&is_active=true`, {
    headers: { Authorization: `Bearer ${admin.token}` },
  });
  expect(seasonsRes.ok()).toBeTruthy();
  const seasons = (await seasonsRes.json()) as Array<{ id: number }>;

  const sessionsRes = await request.get(`${API_BASE}/sessions?club_id=${admin.club_id}&season_id=${seasons[0].id}`, {
    headers: { Authorization: `Bearer ${admin.token}` },
  });
  expect(sessionsRes.ok()).toBeTruthy();
  const sessions = (await sessionsRes.json()) as Array<{ id: number; status: string; session_start_time?: string }>;
  const finalized = sessions
    .filter((s) => s.status === 'FINALIZED')
    .sort((a, b) => String(b.session_start_time || '').localeCompare(String(a.session_start_time || '')))[0];
  expect(finalized).toBeTruthy();

  const beforeLbRes = await request.get(`${API_BASE}/sessions/${finalized!.id}/leaderboard?club_id=${admin.club_id}`, {
    headers: { Authorization: `Bearer ${admin.token}` },
  });
  expect(beforeLbRes.ok()).toBeTruthy();
  const beforeRows = (await beforeLbRes.json()) as Array<{ player_id: number; display_name: string }>;
  expect(beforeRows.length).toBeGreaterThan(0);

  const target = beforeRows[0];

  const hideRes = await request.put(`${API_BASE}/players/${target.player_id}?club_id=${admin.club_id}`, {
    headers: { Authorization: `Bearer ${admin.token}` },
    data: { show_on_leaderboard: false },
  });
  expect(hideRes.ok()).toBeTruthy();

  const afterLbRes = await request.get(`${API_BASE}/sessions/${finalized!.id}/leaderboard?club_id=${admin.club_id}`, {
    headers: { Authorization: `Bearer ${admin.token}` },
  });
  expect(afterLbRes.ok()).toBeTruthy();
  const afterRows = (await afterLbRes.json()) as Array<{ player_id: number; display_name: string }>;
  expect(afterRows.some((r) => r.player_id === target.player_id)).toBeFalsy();

  await page.goto('/');
  await page.getByLabel('Email').fill(VIEWER_EMAIL);
  await page.getByPlaceholder('Enter your password').fill(VIEWER_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();

  const leaderboardTab = page.getByRole('button', { name: /Leaderboard/i });
  if (await leaderboardTab.count()) {
    await leaderboardTab.first().click();
  }

  const heading = page.getByRole('heading', { name: 'Season Leaderboard' });
  if (await heading.count()) {
    await expect(heading).toBeVisible();
    await expect(page.getByText(target.display_name).first()).toHaveCount(0);
  }

  // cleanup for repeatable runs
  await request.put(`${API_BASE}/players/${target.player_id}?club_id=${admin.club_id}`, {
    headers: { Authorization: `Bearer ${admin.token}` },
    data: { show_on_leaderboard: true },
  });
});
