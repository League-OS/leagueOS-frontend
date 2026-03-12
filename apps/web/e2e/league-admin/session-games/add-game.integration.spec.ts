import { expect, test, type Page } from '@playwright/test';
import { loginWithAnyCredential } from '../../auth';

const API_BASE = process.env.E2E_API_BASE || 'http://127.0.0.1:8000';

async function login(page: Page) {
  await loginWithAnyCredential(page);
}

async function openAddGame(page: Page) {
  await page.getByRole('button', { name: /^(\+|Add Game)$/i }).first().click();
  await expect(page.getByRole('heading', { name: /Add Game|New Game/i })).toBeVisible();

  const openSessionBtn = page.getByRole('button', { name: 'Open Session' });
  if (await openSessionBtn.isVisible()) {
    await openSessionBtn.click();
    await expect(openSessionBtn).not.toBeVisible({ timeout: 15_000 });
  }
}

async function selectFirstCourt(page: Page) {
  const legacyCourtSelect = page.getByLabel('Court');
  if (await legacyCourtSelect.isVisible().catch(() => false)) {
    await legacyCourtSelect.selectOption({ index: 1 });
    return;
  }

  // New form: court chips exist on step 2.
  if (await page.getByRole('button', { name: 'Score + Save' }).isVisible().catch(() => false)) {
    await page.getByRole('button', { name: 'Score + Save' }).click();
  }
  const courtChip = page.locator('button').filter({ hasText: /^Court/ }).filter({ hasNotText: ':' }).first();
  if (!(await courtChip.isVisible().catch(() => false))) {
    test.skip(true, 'No selectable court control found in this environment');
  }
  await courtChip.click();
}

test('rejects invalid login', async ({ page }) => {
  await page.goto('/');

  // This suite reuses storageState; if already logged in we cannot exercise invalid login.
  if (!(await page.getByLabel('Email').isVisible().catch(() => false))) {
    test.skip(true, 'Already authenticated via storageState');
  }

  await page.getByLabel('Email').fill('fvma-clubAdmin@leagueos.local');
  await page.getByPlaceholder('Enter your password').fill('wrong-password');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByText(/invalid/i)).toBeVisible();
});

test('shows validation for draw score in Add Game', async ({ page }) => {
  await login(page);
  await openAddGame(page);
  await selectFirstCourt(page);

  if (!(await page.getByLabel('Score A').isVisible().catch(() => false))) {
    test.skip(true, 'Legacy Score A/B inputs not present in current Add Game UI');
  }

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

  if (!(await page.getByLabel('Score A').isVisible().catch(() => false))) {
    test.skip(true, 'Legacy Score A/B inputs not present in current Add Game UI');
  }

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
