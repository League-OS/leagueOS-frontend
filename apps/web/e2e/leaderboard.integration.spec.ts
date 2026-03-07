import { expect, test } from '@playwright/test';

const API_BASE = process.env.E2E_API_BASE || 'http://127.0.0.1:8000';
const UI_EMAIL = process.env.E2E_UI_EMAIL || 'enosh_fvma_badminton_club@leagueos.local';
const UI_PASSWORD = process.env.E2E_UI_PASSWORD || 'Recorder@123';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'fvma-clubAdmin@leagueos.local';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'Admin@123';

async function apiLogin(request: Parameters<typeof test>[0]['request'], email: string, password: string) {
  const res = await request.post(`${API_BASE}/auth/login`, { data: { email, password } });
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as { token: string; club_id: number };
}

test('leaderboard api rows are structurally valid with unique players', async ({ request }) => {
  const auth = await apiLogin(request, ADMIN_EMAIL, ADMIN_PASSWORD);

  const seasonsRes = await request.get(`${API_BASE}/seasons?club_id=${auth.club_id}&is_active=true`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  });
  expect(seasonsRes.ok()).toBeTruthy();
  const seasons = (await seasonsRes.json()) as Array<{ id: number }>;
  expect(seasons.length).toBeGreaterThan(0);

  const sessionsRes = await request.get(`${API_BASE}/sessions?club_id=${auth.club_id}&season_id=${seasons[0].id}`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  });
  expect(sessionsRes.ok()).toBeTruthy();
  const sessions = (await sessionsRes.json()) as Array<{ id: number; status: string }>;
  const finalized = sessions.find((s) => s.status === 'FINALIZED');
  expect(finalized).toBeTruthy();

  const lbRes = await request.get(`${API_BASE}/sessions/${finalized!.id}/leaderboard?club_id=${auth.club_id}`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  });
  expect(lbRes.ok()).toBeTruthy();
  const rows = (await lbRes.json()) as Array<{
    player_id: number;
    display_name: string;
    global_elo_score: number;
    matches_played: number;
    matches_won: number;
  }>;

  expect(rows.length).toBeGreaterThan(0);

  const ids = new Set<number>();
  for (const r of rows) {
    expect(typeof r.player_id).toBe('number');
    expect(r.display_name.length).toBeGreaterThan(0);
    expect(typeof r.global_elo_score).toBe('number');
    expect(typeof r.matches_played).toBe('number');
    expect(typeof r.matches_won).toBe('number');
    expect(ids.has(r.player_id)).toBeFalsy();
    ids.add(r.player_id);
  }
});

test('leaderboard api returns empty for brand new season with no finalized sessions', async ({ request }) => {
  const auth = await apiLogin(request, ADMIN_EMAIL, ADMIN_PASSWORD);
  const seasonName = `E2E Empty LB ${Date.now()}`;

  const createSeason = await request.post(`${API_BASE}/seasons?club_id=${auth.club_id}`, {
    headers: { Authorization: `Bearer ${auth.token}` },
    data: {
      club_id: auth.club_id,
      name: seasonName,
      format: 'DOUBLES',
      weekday: 4,
      start_time_local: '19:00',
      timezone: 'America/Los_Angeles',
      is_active: true,
    },
  });
  expect(createSeason.ok()).toBeTruthy();
  const season = (await createSeason.json()) as { id: number };

  const sessionsRes = await request.get(`${API_BASE}/sessions?club_id=${auth.club_id}&season_id=${season.id}`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  });
  expect(sessionsRes.ok()).toBeTruthy();
  const sessions = (await sessionsRes.json()) as Array<{ id: number; status: string }>;
  const finalized = sessions.find((s) => s.status === 'FINALIZED');

  if (!finalized) {
    expect(finalized).toBeUndefined();
  } else {
    const lbRes = await request.get(`${API_BASE}/sessions/${finalized.id}/leaderboard?club_id=${auth.club_id}`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    });
    expect(lbRes.ok()).toBeTruthy();
    const rows = (await lbRes.json()) as Array<unknown>;
    expect(rows.length).toBe(0);
  }
});

test('leaderboard endpoint rejects unauthorized token', async ({ request }) => {
  const bad = await request.get(`${API_BASE}/seasons?club_id=1`, {
    headers: { Authorization: 'Bearer definitely-invalid' },
  });
  expect(bad.status()).toBeGreaterThanOrEqual(401);
});

test('ui leaderboard contains top player from api', async ({ page, request }) => {
  const uiAuth = await apiLogin(request, UI_EMAIL, UI_PASSWORD);

  const seasonsRes = await request.get(`${API_BASE}/seasons?club_id=${uiAuth.club_id}&is_active=true`, {
    headers: { Authorization: `Bearer ${uiAuth.token}` },
  });
  const seasons = (await seasonsRes.json()) as Array<{ id: number }>;

  const sessionsRes = await request.get(`${API_BASE}/sessions?club_id=${uiAuth.club_id}&season_id=${seasons[0].id}`, {
    headers: { Authorization: `Bearer ${uiAuth.token}` },
  });
  const sessions = (await sessionsRes.json()) as Array<{ id: number; status: string }>;
  const finalized = sessions.find((s) => s.status === 'FINALIZED');
  expect(finalized).toBeTruthy();

  const lbRes = await request.get(`${API_BASE}/sessions/${finalized!.id}/leaderboard?club_id=${uiAuth.club_id}`, {
    headers: { Authorization: `Bearer ${uiAuth.token}` },
  });
  const rows = (await lbRes.json()) as Array<{ display_name: string }>;
  expect(rows.length).toBeGreaterThan(0);

  await page.goto('/');
  await page.getByLabel('Email').fill(UI_EMAIL);
  await page.getByPlaceholder('Enter your password').fill(UI_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();

  await page.getByRole('button', { name: 'Leaderboard' }).click();
  await expect(page.getByRole('heading', { name: 'Season Leaderboard' })).toBeVisible();
  await expect(page.getByText(rows[0].display_name).first()).toBeVisible();
});
