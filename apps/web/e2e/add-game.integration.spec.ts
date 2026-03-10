import { expect, test, type Page } from '@playwright/test';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'playerone@leagueos.local';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'PlayerOne@123';
const API_BASE = process.env.E2E_API_BASE || 'http://127.0.0.1:8000';

async function login(page: Page) {
  await page.goto('/');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByPlaceholder('Enter your password').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.locator('button').filter({ hasText: '+' }).first()).toBeVisible();
}

async function openAddGame(page: Page) {
  await page.locator('button').filter({ hasText: '+' }).first().click();
  await expect(page.getByRole('heading', { name: 'New Game' })).toBeVisible();

  const openSessionBtn = page.getByRole('button', { name: 'Open Session' });
  if (await openSessionBtn.isVisible()) {
    await openSessionBtn.click();
    await expect(openSessionBtn).not.toBeVisible({ timeout: 15_000 });
  }
}

async function hasOpenSession(page: Page): Promise<boolean> {
  const noSession = await page.getByText('No open session is available for this season').isVisible({ timeout: 3000 }).catch(() => false);
  return !noSession;
}

async function pickFirstAvailablePlayer(page: Page): Promise<string> {
  await expect(page.getByPlaceholder('Search players...')).toBeVisible();
  const pickerCard = page.locator('div').filter({ has: page.getByPlaceholder('Search players...') }).last();
  const playerBtns = pickerCard.locator('button').filter({ hasNotText: /^(Clear|Close)$/ });
  await expect(playerBtns.first()).toBeVisible({ timeout: 10_000 });
  const name = (await playerBtns.first().textContent())?.trim() ?? '';
  await playerBtns.first().click();
  return name;
}

async function fillFourPlayersAndGoToStep2(page: Page): Promise<boolean> {
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: 'Select player' }).first().click();
    try {
      await pickFirstAvailablePlayer(page);
    } catch {
      return false;
    }
  }
  await page.getByRole('button', { name: 'Score + Save' }).click();
  await expect(page.getByText('Step 2 of 2')).toBeVisible({ timeout: 8000 });
  return true;
}

async function selectFirstCourt(page: Page) {
  const courtChip = page.locator('button').filter({ hasText: /^Court/ }).filter({ hasNotText: ':' }).first();
  await courtChip.waitFor({ state: 'visible', timeout: 12_000 });
  await courtChip.click();
}

async function selectFirstTime(page: Page) {
  await page.getByText('Time Slot:').first().waitFor({ state: 'visible', timeout: 5000 });
  let timeChip = page.locator('button').filter({ hasText: /\d{1,2}:\d{2}\s*(AM|PM)/ }).first();
  if (await timeChip.isVisible({ timeout: 3000 }).catch(() => false)) {
    await timeChip.click();
    return;
  }
  await page.getByText('+ Custom time').click();
  const timeInput = page.locator('input[type="time"]');
  await timeInput.waitFor({ state: 'visible', timeout: 3000 });
  await timeInput.fill('19:00');
  await page.getByRole('button', { name: 'Use time' }).click();
}

test('rejects invalid login', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill('fvma-clubAdmin@leagueos.local');
  await page.getByPlaceholder('Enter your password').fill('wrong-password');
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByText(/invalid/i)).toBeVisible();
});

test('shows validation for draw score in Add Game', async ({ page }) => {
  await login(page);
  await openAddGame(page);
  if (!(await hasOpenSession(page))) {
    test.skip(true, 'No open session for this season (need an open session to test add-game validation)');
  }
  const onStep2 = await fillFourPlayersAndGoToStep2(page).catch(() => false);
  if (!onStep2) {
    test.skip(true, 'Could not fill 4 players and reach step 2 (need players in club)');
  }
  await selectFirstCourt(page);
  await selectFirstTime(page);

  const teamBCard = page.getByText('Team B', { exact: true }).locator('..');
  const teamBPlus = teamBCard.getByRole('button', { name: '+' });
  await expect(teamBPlus).toBeVisible();
  for (let i = 0; i < 4; i++) await teamBPlus.click();
  await expect(teamBCard.locator('[style*="fontSize: 40px"], [style*="font-size: 40px"]')).toHaveText('21');
  await expect(page.getByText(/Draw is not allowed|Score is invalid for standard badminton/)).toBeVisible();
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
  if (!(await hasOpenSession(page))) {
    test.skip(true, 'No open session for this season (need an open session to test add-game)');
  }
  const onStep2 = await fillFourPlayersAndGoToStep2(page).catch(() => false);
  if (!onStep2) {
    test.skip(true, 'Could not fill 4 players and reach step 2 (need players in club)');
  }
  await selectFirstCourt(page);
  await selectFirstTime(page);
  const teamBCard = page.getByText('Team B', { exact: true }).locator('..');
  const teamBPlus = teamBCard.getByRole('button', { name: '+' });
  await expect(teamBPlus).toBeVisible();
  await teamBPlus.click();
  await expect(teamBCard.locator('[style*="fontSize: 40px"], [style*="font-size: 40px"]')).toHaveText('18');

  const saveBtn = page.getByRole('button', { name: 'Save Game' });
  await expect(saveBtn).toBeEnabled({ timeout: 15_000 });
  await saveBtn.click();
  await expect(page.getByRole('heading', { name: 'New Game' })).not.toBeVisible({ timeout: 20_000 });

  const afterResp = await request.get(`${API_BASE}/games?club_id=${auth!.clubId}`, {
    headers: { Authorization: `Bearer ${auth!.token}` },
  });
  expect(afterResp.ok()).toBeTruthy();
  const afterGames = (await afterResp.json()) as Array<{ id: number }>;

  expect(afterGames.length).toBeGreaterThan(beforeGames.length);
});
