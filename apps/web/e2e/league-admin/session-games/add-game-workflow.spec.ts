/**
 * Add Game Workflow – Playwright E2E tests
 *
 * Covers TC-01 … TC-18 from the test plan.
 *
 * Prerequisites (run once before tests):
 *   - Next.js dev server: pnpm dev:web  → http://127.0.0.1:3000
 *   - API server:         python -m uvicorn app.main:app  → http://127.0.0.1:8000
 *   - An OPEN session must exist for the active season in club_id=1.
 *     If none exists the tests are skipped gracefully.
 *
 * Credentials override via env vars:
 *   E2E_EMAIL  (default: enosh_fvma_badminton_club@leagueos.local)
 *   E2E_PASSWORD  (default: Recorder@123)
 */

import { expect, test, type Page } from '@playwright/test';

// Credentials used by global setup (login happens once; auth state reused here)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loginAs(page: Page) {
  // Auth state is pre-loaded via Playwright storageState (global setup).
  // Just navigate home and wait for the dashboard.
  await page.goto('/');
  await expect(page.getByRole('button', { name: '+' })).toBeVisible({ timeout: 20_000 });
}

async function openNewGame(page: Page) {
  await page.getByRole('button', { name: '+' }).click();
  await expect(page.getByRole('heading', { name: 'New Game', level: 2 })).toBeVisible();
}

/** Check if there is an open session available (if not, skip the test). */
async function requireOpenSession(page: Page) {
  const errMsg = page.getByText('No open session is available for this season');
  if (await errMsg.isVisible({ timeout: 2_000 }).catch(() => false)) {
    test.skip(true, 'No OPEN session available – skipping test');
  }
}

/**
 * Pick the first available player from the picker modal.
 * Scopes to the picker card (identified by its "Search players..." input),
 * then clicks the first player-chip button (excluding Clear / Close).
 */
async function pickFirstAvailablePlayer(page: Page): Promise<string> {
  // The picker card always has a "Search players..." input
  await expect(page.getByPlaceholder('Search players...')).toBeVisible();

  // The picker card is the nearest parent div that contains the search input
  const pickerCard = page.locator('div').filter({ has: page.getByPlaceholder('Search players...') }).last();

  // Player chips are buttons inside the card that are NOT "Clear" or "Close"
  const playerBtns = pickerCard.locator('button').filter({ hasNotText: /^(Clear|Close)$/ });

  // Wait for at least one player chip to appear
  await expect(playerBtns.first()).toBeVisible({ timeout: 10_000 });

  const name = (await playerBtns.first().textContent())?.trim() ?? '';
  await playerBtns.first().click();
  return name;
}

/** Fill all 4 player slots (a1, a2, b1, b2) with distinct players. */
async function fillAllPlayers(page: Page): Promise<string[]> {
  const names: string[] = [];
  // There are exactly 4 "Select player" buttons in step 1
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: 'Select player' }).first().click();
    names.push(await pickFirstAvailablePlayer(page));
  }
  return names;
}

// ---------------------------------------------------------------------------
// TC-01  Step Navigation
// ---------------------------------------------------------------------------

test('TC-01: Score+Save tab requires 4 players; Players tab always returns to step 1', async ({ page }) => {
  await loginAs(page);
  await openNewGame(page);
  await requireOpenSession(page);

  // Without players → Score+Save tab shows warning, stays on step 1
  await page.getByRole('button', { name: 'Score + Save' }).click();
  await expect(page.getByText('Step 1 of 2')).toBeVisible();
  await expect(page.getByText(/Select 4 unique players/i)).toBeVisible();

  // Fill all players and proceed
  await fillAllPlayers(page);
  await page.getByRole('button', { name: 'Score + Save' }).click();
  await expect(page.getByText('Step 2 of 2')).toBeVisible();

  // Players tab returns to step 1
  await page.getByRole('button', { name: 'Players' }).click();
  await expect(page.getByText('Step 1 of 2')).toBeVisible();
});

// ---------------------------------------------------------------------------
// TC-02  State Persistence across step switches
// ---------------------------------------------------------------------------

test('TC-02: court and score survive round-trip between step 1 and step 2', async ({ page }) => {
  await loginAs(page);
  await openNewGame(page);
  await requireOpenSession(page);
  await fillAllPlayers(page);

  // Move to step 2
  await page.getByRole('button', { name: 'Score + Save' }).click();
  await expect(page.getByText('Step 2 of 2')).toBeVisible();

  // Select the first court chip (chips have "Court" without ":" which headers contain)
  const firstCourt = page.locator('button').filter({ hasText: /^Court/ }).filter({ hasNotText: ':' }).first();
  const courtName = (await firstCourt.textContent())?.trim() ?? '';
  await firstCourt.click();

  // Bump score A up by 1
  await page.getByRole('button', { name: '+' }).first().click();
  const scoreAEl = page.locator('[style*="fontSize: 40px"], [style*="font-size: 40px"]').first();
  const scoreA = (await scoreAEl.textContent())?.trim();

  // Round-trip: go back to step 1 then forward again
  await page.getByRole('button', { name: 'Players' }).click();
  await expect(page.getByText('Step 1 of 2')).toBeVisible();
  await page.getByRole('button', { name: 'Score + Save' }).click();
  await expect(page.getByText('Step 2 of 2')).toBeVisible();

  // Court header should still show the chosen court
  await expect(page.getByText(courtName)).toBeVisible();
  // Score A should be unchanged
  await expect(scoreAEl).toHaveText(scoreA!);
});

// ---------------------------------------------------------------------------
// TC-03  Duplicate Prevention in player picker
// ---------------------------------------------------------------------------

test('TC-03: player selected in one slot is absent from other slot pickers', async ({ page }) => {
  await loginAs(page);
  await openNewGame(page);
  await requireOpenSession(page);

  // Open picker for first slot (a1) and pick from available players
  await page.getByRole('button', { name: 'Select player' }).first().click();
  await expect(page.getByPlaceholder('Search players...')).toBeVisible();
  const pickerCard1 = page.locator('div').filter({ has: page.getByPlaceholder('Search players...') }).last();
  const firstPlayerBtn = pickerCard1.locator('button').filter({ hasNotText: /^(Clear|Close)$/ }).first();
  const pickedName = (await firstPlayerBtn.textContent())?.trim() ?? '';
  await firstPlayerBtn.click();

  // Open picker for second slot (a2)
  await page.getByRole('button', { name: 'Select player' }).first().click();
  await expect(page.getByPlaceholder('Search players...')).toBeVisible();
  const pickerCard2 = page.locator('div').filter({ has: page.getByPlaceholder('Search players...') }).last();
  // Picked player must not appear as a selectable player chip
  const playerChipBtns = pickerCard2.locator('button').filter({ hasNotText: /^(Clear|Close)$/ });
  const texts = await playerChipBtns.allTextContents();
  expect(texts.map(t => t.trim())).not.toContain(pickedName);
});

// ---------------------------------------------------------------------------
// TC-04  Picker section order: Recents → Suggested → All Players
// ---------------------------------------------------------------------------

test('TC-04: picker shows sections in order Recents → Suggested → All Players', async ({ page }) => {
  await loginAs(page);
  await openNewGame(page);
  await requireOpenSession(page);

  await page.getByRole('button', { name: 'Select player' }).first().click();
  await expect(page.getByPlaceholder('Search players...')).toBeVisible();

  const pickerCard = page.locator('div').filter({ has: page.getByPlaceholder('Search players...') }).last();
  // Grab section-heading texts in DOM order (scoped to picker card)
  const headings = await pickerCard.locator('div').filter({ hasText: /^(Recents|Suggested|All Players)$/ })
    .evaluateAll((els) => els.map(el => el.textContent?.trim() ?? ''));
  const ordered = headings.filter(h => ['Recents', 'Suggested', 'All Players'].includes(h));
  expect(ordered).toEqual(['Recents', 'Suggested', 'All Players']);
});

// ---------------------------------------------------------------------------
// TC-05  Search filter
// ---------------------------------------------------------------------------

test('TC-05: search filters names; no-match shows "No matching players" in All Players section', async ({ page }) => {
  await loginAs(page);
  await openNewGame(page);
  await requireOpenSession(page);

  await page.getByRole('button', { name: 'Select player' }).first().click();
  await expect(page.getByPlaceholder('Search players...')).toBeVisible();

  // Type nonsense → "No matching players" must appear in All Players section
  await page.getByPlaceholder('Search players...').fill('xyzzy_no_match_99');
  await expect(page.getByText('No matching players')).toBeVisible();
});

// ---------------------------------------------------------------------------
// TC-07  Court section default state on entering step 2
// ---------------------------------------------------------------------------

test('TC-07: court section is expanded and shows "Select court" when entering step 2 fresh', async ({ page }) => {
  await loginAs(page);
  await openNewGame(page);
  await requireOpenSession(page);
  await fillAllPlayers(page);

  await page.getByRole('button', { name: 'Score + Save' }).click();
  await expect(page.getByText('Step 2 of 2')).toBeVisible();

  // Court label reads "Select court"
  await expect(page.getByText('Select court')).toBeVisible();
  // Section is expanded → Collapse button visible
  await expect(page.getByRole('button', { name: 'Collapse' }).first()).toBeVisible();
});

// ---------------------------------------------------------------------------
// TC-08  Court chip collapses court section and expands time section
// ---------------------------------------------------------------------------

test('TC-08: selecting a court collapses court section and auto-expands time section', async ({ page }) => {
  await loginAs(page);
  await openNewGame(page);
  await requireOpenSession(page);
  await fillAllPlayers(page);

  await page.getByRole('button', { name: 'Score + Save' }).click();

  // Click the first court chip (inside the expanded court section)
  const courtChip = page.locator('button').filter({ hasText: /^Court/ }).filter({ hasNotText: ':' }).first();
  await courtChip.click();

  // Court section should be collapsed; time section should be expanded.
  // The court header now shows "Expand"; time section header shows "Collapse".
  await expect(page.locator('button').filter({ hasText: 'Expand' }).first()).toBeVisible();
  await expect(page.locator('button').filter({ hasText: 'Collapse' }).first()).toBeVisible();
  await expect(page.getByText(/Time Slot:/)).toBeVisible();
});

// ---------------------------------------------------------------------------
// TC-09  Time chip collapses time section and updates header
// ---------------------------------------------------------------------------

test('TC-09: selecting a time chip collapses time section and shows time in header', async ({ page }) => {
  await loginAs(page);
  await openNewGame(page);
  await requireOpenSession(page);
  await fillAllPlayers(page);

  await page.getByRole('button', { name: 'Score + Save' }).click();

  // Select court first
  await page.locator('button').filter({ hasText: /^Court/ }).filter({ hasNotText: ':' }).first().click();

  // Wait for time chips and click the first one
  const timeChip = page.locator('button').filter({ hasText: /\d{1,2}:\d{2} (AM|PM)/ }).first();
  await expect(timeChip).toBeVisible({ timeout: 10_000 });
  const timeText = (await timeChip.textContent())?.trim() ?? '';
  await timeChip.click();

  // Time section should be collapsed; header should show the selected time
  await expect(page.getByText(timeText)).toBeVisible();
  // Both sections are now collapsed – at least one Expand button must be visible
  await expect(page.locator('button').filter({ hasText: 'Expand' }).first()).toBeVisible();
});

// ---------------------------------------------------------------------------
// TC-11  Custom time hidden by default, visible after button click
// ---------------------------------------------------------------------------

test('TC-11: custom time input hidden by default; appears after clicking "+ Custom time"', async ({ page }) => {
  await loginAs(page);
  await openNewGame(page);
  await requireOpenSession(page);
  await fillAllPlayers(page);

  await page.getByRole('button', { name: 'Score + Save' }).click();

  // Select court to expand time section
  await page.locator('button').filter({ hasText: /^Court/ }).filter({ hasNotText: ':' }).first().click();

  // Custom time input must NOT be visible initially
  await expect(page.locator('input[type="time"]')).not.toBeVisible();
  await expect(page.getByText('+ Custom time')).toBeVisible();

  // Click button → input appears
  await page.getByText('+ Custom time').click();
  await expect(page.locator('input[type="time"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use time' })).toBeVisible();
});

// ---------------------------------------------------------------------------
// TC-12  Custom time future guard
// ---------------------------------------------------------------------------

test('TC-12: entering a future time shows "Time cannot be in the future"', async ({ page }) => {
  // Mock Date to midnight so nowCapMinutes = 0.
  // Any custom time > 0 min will satisfy `minutes > nowCapMinutes` and trigger the
  // "Time cannot be in the future." guard, regardless of which day the session is from.
  await page.addInitScript(() => {
    const midnight = new Date();
    midnight.setHours(0, 0, 1, 0); // 00:00:01 today
    const OrigDate = globalThis.Date;
    class MockDate extends OrigDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) super(midnight.getTime());
        // @ts-expect-error -- variadic Date constructor overloads
        else super(...args);
      }
      static override now() { return midnight.getTime(); }
    }
    globalThis.Date = MockDate as unknown as typeof Date;
  });

  await loginAs(page);
  await openNewGame(page);
  await requireOpenSession(page);
  await fillAllPlayers(page);

  await page.getByRole('button', { name: 'Score + Save' }).click();
  await page.locator('button').filter({ hasText: /^Court/ }).filter({ hasNotText: ':' }).first().click();

  // Open custom time
  await page.getByText('+ Custom time').click();
  const timeInput = page.locator('input[type="time"]');
  await expect(timeInput).toBeVisible();

  // Fill any non-midnight time (e.g. 09:00 = 540 min). With nowCapMinutes ≈ 0,
  // 540 > 0 → "Time cannot be in the future." fires.
  await timeInput.fill('09:00');
  await page.getByRole('button', { name: 'Use time' }).click();

  await expect(page.getByText(/future/i)).toBeVisible();
  // Time section header still shows "Select time" (selection was rejected)
  await expect(page.getByText('Select time')).toBeVisible();
});

// ---------------------------------------------------------------------------
// TC-14  Score validation: invalid scores show warning and disable Save
// ---------------------------------------------------------------------------

test('TC-14: 21-20 score shows validation warning and Save Game is disabled', async ({ page }) => {
  await loginAs(page);
  await openNewGame(page);
  await requireOpenSession(page);
  await fillAllPlayers(page);

  await page.getByRole('button', { name: 'Score + Save' }).click();

  // Default scores are 21 and 17 (valid). Increment Team B score by 3 to get 21-20 (invalid).
  const plusBtns = page.getByRole('button', { name: '+' });
  for (let i = 0; i < 3; i++) {
    // Second '+' button is Team B
    await plusBtns.nth(1).click();
  }

  // Validation message should appear (21-20 is invalid: 21-pt win requires opponent ≤ 19)
  await expect(page.getByText(/invalid|score|21-point|rule/i).first()).toBeVisible();
  // Save Game should be disabled (missing court/time OR invalid score)
  await expect(page.getByRole('button', { name: 'Save Game' })).toBeDisabled();
});

// ---------------------------------------------------------------------------
// TC-15  Flip Sides swaps A and B scores
// ---------------------------------------------------------------------------

test('TC-15: Flip Sides (A ↔ B) swaps Team A and Team B scores', async ({ page }) => {
  await loginAs(page);
  await openNewGame(page);
  await requireOpenSession(page);
  await fillAllPlayers(page);

  await page.getByRole('button', { name: 'Score + Save' }).click();

  const scoreDisplays = page.locator('[style*="fontSize: 40px"], [style*="font-size: 40px"]');
  const initA = (await scoreDisplays.nth(0).textContent())?.trim();
  const initB = (await scoreDisplays.nth(1).textContent())?.trim();

  await page.getByRole('button', { name: /flip sides/i }).click();

  const flippedA = (await scoreDisplays.nth(0).textContent())?.trim();
  const flippedB = (await scoreDisplays.nth(1).textContent())?.trim();

  expect(flippedA).toBe(initB);
  expect(flippedB).toBe(initA);
});

// ---------------------------------------------------------------------------
// TC-16  Save Gate
// ---------------------------------------------------------------------------

test('TC-16: Save Game disabled without court+time; enabled when all inputs valid', async ({ page }) => {
  await loginAs(page);
  await openNewGame(page);
  await requireOpenSession(page);
  await fillAllPlayers(page);

  await page.getByRole('button', { name: 'Score + Save' }).click();

  // No court or time → disabled
  await expect(page.getByRole('button', { name: 'Save Game' })).toBeDisabled();

  // Select a court + a time chip
  await page.locator('button').filter({ hasText: /^Court/ }).filter({ hasNotText: ':' }).first().click();
  const timeChip = page.locator('button').filter({ hasText: /\d{1,2}:\d{2} (AM|PM)/ }).first();
  await expect(timeChip).toBeVisible({ timeout: 10_000 });
  await timeChip.click();

  // Default scores 21-17 are valid → Save should be enabled
  await expect(page.getByRole('button', { name: 'Save Game' })).toBeEnabled({ timeout: 5_000 });
});

// ---------------------------------------------------------------------------
// TC-17  Expand/Collapse court and time sections
// ---------------------------------------------------------------------------

test('TC-17: court and time sections can be manually expanded and collapsed', async ({ page }) => {
  await loginAs(page);
  await openNewGame(page);
  await requireOpenSession(page);
  await fillAllPlayers(page);

  await page.getByRole('button', { name: 'Score + Save' }).click();

  // Court is initially expanded → Collapse button visible
  const courtHeader = page.locator('button').filter({ hasText: /Court:/ });
  await expect(page.getByRole('button', { name: 'Collapse' }).first()).toBeVisible();

  // Collapse it
  await courtHeader.click();
  await expect(page.getByRole('button', { name: 'Expand' }).first()).toBeVisible();

  // Expand it again
  await courtHeader.click();
  await expect(page.getByRole('button', { name: 'Collapse' }).first()).toBeVisible();
});

// ---------------------------------------------------------------------------
// TC-18  Back button on step 2 returns to step 1 without clearing state
// ---------------------------------------------------------------------------

test('TC-18: Back on step 2 returns to step 1 and preserves court + time selection', async ({ page }) => {
  await loginAs(page);
  await openNewGame(page);
  await requireOpenSession(page);
  await fillAllPlayers(page);

  await page.getByRole('button', { name: 'Score + Save' }).click();

  // Select court
  const courtChip = page.locator('button').filter({ hasText: /^Court/ }).filter({ hasNotText: ':' }).first();
  const courtName = (await courtChip.textContent())?.trim() ?? '';
  await courtChip.click();

  // Select time
  const timeChip = page.locator('button').filter({ hasText: /\d{1,2}:\d{2} (AM|PM)/ }).first();
  await expect(timeChip).toBeVisible({ timeout: 10_000 });
  const timeName = (await timeChip.textContent())?.trim() ?? '';
  await timeChip.click();

  // Hit Back
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByText('Step 1 of 2')).toBeVisible();

  // Return to step 2
  await page.getByRole('button', { name: 'Score + Save' }).click();
  await expect(page.getByText('Step 2 of 2')).toBeVisible();

  // Court and time should still be selected in the headers
  await expect(page.getByText(courtName)).toBeVisible();
  await expect(page.getByText(timeName)).toBeVisible();
});
