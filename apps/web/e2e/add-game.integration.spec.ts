import { expect, test } from '@playwright/test';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'enosh_fvma_badminton_club@leagueos.local';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'Recorder@123';
const API_BASE = process.env.E2E_API_BASE || 'http://127.0.0.1:8000';

async function login(page: Parameters<typeof test>[0]['page']) {
  await page.goto('/');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.locator('button').filter({ hasText: '+' }).first()).toBeVisible();
}

async function openAddGame(page: Parameters<typeof test>[0]['page']) {
  await page.locator('button').filter({ hasText: '+' }).first().click();
  await expect(page.getByRole('heading', { name: 'Add Game' })).toBeVisible();

  const openSessionBtn = page.getByRole('button', { name: 'Open Session' });
  if (await openSessionBtn.isVisible()) {
    await openSessionBtn.click();
    await expect(openSessionBtn).not.toBeVisible({ timeout: 15_000 });
  }
}

async function selectFirstCourt(page: Parameters<typeof test>[0]['page']) {
  await page.getByLabel('Court').selectOption({ index: 1 });
}

test('rejects invalid login', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill('fvma-clubAdmin@leagueos.local');
  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByText(/invalid/i)).toBeVisible();
});

test('shows validation for draw score in Add Game', async ({ page }) => {
  await login(page);
  await openAddGame(page);
  await selectFirstCourt(page);

  await page.getByLabel('Score A').fill('21');
  await page.getByLabel('Score B').fill('21');
  await page.getByRole('button', { name: 'Save Game' }).click();

  await expect(page.getByText('Draw is not allowed. Scores must differ.')).toBeVisible();
});

test('creates game from UI and reflects via API', async ({ page, request }) => {
  await login(page);

  const auth = await page.evaluate(() => {
    const raw = window.localStorage.getItem('leagueos.player.auth');
    if (!raw) return null;
    try {
      return JSON.parse(raw) as { token: string; clubId: number };
    } catch {
      return null;
    }
  });
  expect(auth).toBeTruthy();

  const beforeResp = await request.get(`${API_BASE}/games?club_id=${auth!.clubId}`, {
    headers: { Authorization: `Bearer ${auth!.token}` },
  });
  expect(beforeResp.ok()).toBeTruthy();
  const beforeGames = (await beforeResp.json()) as Array<{ id: number }>;

  await openAddGame(page);
  await selectFirstCourt(page);
  await page.getByLabel('Score A').fill('21');
  await page.getByLabel('Score B').fill('18');

  const saveBtn = page.getByRole('button', { name: 'Save Game' });
  await saveBtn.click();
  await expect(page.getByRole('heading', { name: 'Add Game' })).not.toBeVisible({ timeout: 20_000 });

  const afterResp = await request.get(`${API_BASE}/games?club_id=${auth!.clubId}`, {
    headers: { Authorization: `Bearer ${auth!.token}` },
  });
  expect(afterResp.ok()).toBeTruthy();
  const afterGames = (await afterResp.json()) as Array<{ id: number }>;

  expect(afterGames.length).toBeGreaterThan(beforeGames.length);
});
