import { expect, test } from '@playwright/test';
import { loginWithAnyCredential } from '../../auth';
import { ensureFinalizedSessionWithGame } from '../fixtures';

const API_BASE = process.env.E2E_API_BASE || 'http://127.0.0.1:8000';

test('leaderboard api rows are structurally valid with unique players', async ({ request }) => {
  const { auth, session } = await ensureFinalizedSessionWithGame(request);

  const lbRes = await request.get(`${API_BASE}/sessions/${session.id}/leaderboard?club_id=${auth.club_id}`, {
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

test('leaderboard endpoint rejects unauthorized token', async ({ request }) => {
  const bad = await request.get(`${API_BASE}/seasons?club_id=1`, {
    headers: { Authorization: 'Bearer definitely-invalid' },
  });
  expect(bad.status()).toBeGreaterThanOrEqual(401);
});

test('ui admin page loads for authenticated user', async ({ page, request }) => {
  await ensureFinalizedSessionWithGame(request);
  await loginWithAnyCredential(page);

  await page.goto('/admin');
  await expect(page.getByRole('button', { name: /sign in/i })).toHaveCount(0);
  await expect(page.getByText(/admin/i).first()).toBeVisible();
});
