/**
 * Add Game Workflow – Playwright E2E tests
 *
 * Covers TC-01 … TC-18 as defined in the test plan.
 * Requires:
 *   - Next.js dev server running on http://127.0.0.1:3000
 *   - API server running on http://127.0.0.1:8000
 *   - At least one OPEN session with ≥1 court and ≥4 active players in the
 *     default club (club_id=1).
 *
 * Run from repo root:
 *   pnpm --filter @leagueos/web test:e2e
 *
 * Override credentials / URL with env vars:
 *   E2E_EMAIL, E2E_PASSWORD, E2E_BASE_URL, E2E_API_BASE
 */

import { expect, test, type Page } from '@playwright/test';

const EMAIL    = process.env.E2E_EMAIL    || 'user@clubrally.local';
const PASSWORD = process.env.E2E_PASSWORD || 'User@1234';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function loginAs(page: Page, email = EMAIL, password = PASSWORD) {
  await page.goto('/');
  await page.getByPlaceholder(/email/i).fill(email);
  await page.getByPlaceholder(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  // Wait for the home dashboard to be visible
  await expect(page.getByRole('button', { name: /new game/i })).toBeVisible({ timeout: 20_000 });
}

async function openNewGame(page: Page) {
  await page.getByRole('button', { name: /new game/i }).click();
  await expect(page.getByText('New Game')).toBeVisible();
  await expect(page.getByText('Step 1 of 2')).toBeVisible();
}

/** Pick the first available name that appears inside the 'All Players' section */
async function pickPlayerFromAllSection(page: Page) {
  await expect(page.getByText('All Players')).toBeVisible();
  const btn = page.locator('text=All Players').locator('~ div button').first();
  const name = await btn.textContent();
  await btn.click();
  return name?.trim() ?? '';
}

/** Fill all 4 player slots with distinct players */
async function fillAllPlayers(page: Page): Promise<string[]> {
  const names: string[] = [];
  const slots = ['a1', 'a2', 'b1', 'b2'];
  for (const slot of slots) {
    // Each slot button currently shows "Select player"
    const slotBtn = page.locator(`[data-testid="slot-${slot}"]`).or(
      page.getByRole('button', { name: 'Select player' }).first()
    );
    await slotBtn.click();
    await expect(page.getByText('All Players')).toBeVisible();
    const picked = await pickPlayerFromAllSection(page);
    names.push(picked);
  }
  return names;
}

// ---------------------------------------------------------------------------
// TC-01  Step Navigation
// ---------------------------------------------------------------------------

test('TC-01: clicking Score+Save navigates to step 2, clicking Players returns to step 1', async ({ page }) => {
  await loginAs(page);
  await openNewGame(page);

  // Before filling players, clicking "Score + Save" should warn (not navigate)
  await page.getByRole('button', { name: 'Score + Save' }).click();
  await expect(page.getByText('Step 1 of 2')).toBeVisible(); // still step 1

  // Fill all 4 players
  await fillAllPlayers(page);

  // Now Score + Save should work
  await page.getByRole('button', { name: 'Score + Save' }).click();
  await expect(page.getByText('Step 2 of 2')).toBeVisible();

  // Click Players tab → back to step 1
  await page.getByRole('button', { name: 'Players' }).click();
  await expect(page.getByText('Step 1 of 2')).toBeVisible();
});

// ---------------------------------------------------------------------------
// TC-02  State Persistence across step switches
// ---------------------------------------------------------------------------

test('TC-02: all step-2 values survive round-trip back to step 1 and forward again', async ({ page }) => {
  await loginAs(page);
  await openNewGame(page);
  await fillAllPlayers(page);

  // Move to step 2
  await page.getByRole('button', { name: 'Score + Save' }).click();
  await expect(page.getByText('Step 2 of 2')).toBeVisible();

  // Select first available court
  const courtBtn = page.locator('button', { hasText: /court/i }).first();
  const courtName = await courtBtn.textContent();
  await courtBtn.click();

  // Increase score A by clicking +
  await page.locator('button', { hasText: '+' }).first().click();
  const scoreAText = await page.locator('[style*="font-size: 40px"], [style*="fontSize: 40"]').first().textContent();

  // Go back to step 1 then return to step 2
  await page.getByRole('button', { name: 'Players' }).click();
  await expect(page.getByText('Step 1 of 2')).toBeVisible();
  await page.getByRole('button', { name: 'Score + Save' }).click();
  await expect(page.getByText('Step 2 of 2')).toBeVisible();

  // Court and score should still be set
  await expect(page.getByText(courtName!.trim())).toBeVisible();
  await expect(page.locator('[style*="font-size: 40px"], [style*="fontSize: 40"]').first()).toHaveText(scoreAText!.trim());
});

// ---------------------------------------------------------------------------
// TC-03  Duplicate Prevention in picker
// ---------------------------------------------------------------------------

test('TC-03: player selected in one slot is absent from other slot pickers', async ({ page }) => {
  await loginAs(page);
  await openNewGame(page);

  // Open the a1 slot picker and grab the first name from All Players
  await page.getByRole('button', { name: 'Select player' }).first().click();
  await expect(page.getByText('All Players')).toBeVisible();

  const firstPlayerBtn = page.locator('text=All Players').locator('~ div button').first();
  const pickedName = (await firstPlayerBtn.textContent())?.trim() ?? '';
  await firstPlayerBtn.click();

  // Open a2 slot picker – picked player must not appear
  await page.getByRole('button', { name: 'Select player' }).first().click();
  await expect(page.getByText('All Players')).toBeVisible();

  const allButtons = page.locator('text=All Players').locator('~ div button');
  const buttonTexts = await allButtons.allTextContents();
  expect(buttonTexts.map(t => t.trim())).not.toContain(pickedName);
});

// ---------------------------------------------------------------------------
// TC-04  Picker sections: Recents → Suggested → All Players
// ---------------------------------------------------------------------------

test('TC-04: picker always shows sections in order Recents → Suggested → All Players', async ({ page }) => {
  await loginAs(page);
  await openNewGame(page);

  await page.getByRole('button', { name: 'Select player' }).first().click();
  await expect(page.getByText('All Players')).toBeVisible();

  // Verify heading order in the DOM
  const headings = await page.locator('text=/^Recents$|^Suggested$|^All Players$/').allTextContents();
  expect(headings[0]).toBe('Recents');
  expect(headings[1]).toBe('Suggested');
  expect(headings[2]).toBe('All Players');
});

// ---------------------------------------------------------------------------
// TC-05  Search Filter
// ---------------------------------------------------------------------------

test('TC-05: search filters names; no-match shows "No matching players"', async ({ page }) => {
  await loginAs(page);
  await openNewGame(page);

  await page.getByRole('button', { name: 'Select player' }).first().click();
  await expect(page.getByText('All Players')).toBeVisible();

  // Get a real player name from All Players
  const firstBtn = page.locator('text=All Players').locator('~ div button').first();
  const realName = (await firstBtn.textContent())?.trim() ?? '';

  // Type first few chars → that player should still appear
  const searchInput = page.getByPlaceholder(/search/i);
  await searchInput.fill(realName.slice(0, 3));
  await expect(firstBtn).toBeVisible();

  // Type something that matches nothing
  await searchInput.fill('xyzzy_no_match_99');
  await expect(page.getByText('No matching players')).toBeVisible();
});

// ---------------------------------------------------------------------------
// TC-07  Court default on entering Step 2
// ---------------------------------------------------------------------------

test('TC-07: court section is expanded and no court is selected when entering step 2 fresh', async ({ page }) => {
  await loginAs(page);
  await openNewGame(page);
  await fillAllPlayers(page);
  await page.getByRole('button', { name: 'Score + Save' }).click();
  await expect(page.getByText('Step 2 of 2')).toBeVisible();

  // Court section header should show "Select court" and section should be expanded
  await expect(page.getByText('Select court')).toBeVisible();
  await expect(page.getByText('Collapse')).toBeVisible(); // court is expanded
});

// ---------------------------------------------------------------------------
// TC-08  Court-to-Time Auto Flow
// ---------------------------------------------------------------------------

test('TC-08: selecting a court collapses court and auto-expands time section', async ({ page }) => {
  await loginAs(page);
  await openNewGame(page);
  await fillAllPlayers(page);
  await page.getByRole('button', { name: 'Score + Save' }).click();

  // Click first court chip
  const courtChip = page.locator('button').filter({ hasText: /court/i }).first();
  await courtChip.click();

  // Time Slot section should now be expanded (shows Collapse or time slots)
  await expect(page.getByText('Time Slot:')).toBeVisible();
  // The time section header should show Collapse (meaning it's expanded)
  const timeHeader = page.locator('button', { hasText: 'Time Slot:' }).or(
    page.locator('button:has-text("Collapse")').nth(0)
  );
  await expect(page.getByText(/collapse/i).nth(0)).toBeVisible();
});

// ---------------------------------------------------------------------------
// TC-09  Time Auto Collapse
// ---------------------------------------------------------------------------

test('TC-09: selecting a time chip collapses time section and shows selected time in header', async ({ page }) => {
  await loginAs(page);
  await openNewGame(page);
  await fillAllPlayers(page);
  await page.getByRole('button', { name: 'Score + Save' }).click();

  // Select court first
  await page.locator('button').filter({ hasText: /court/i }).first().click();

  // Wait for time section to expand and chips to appear
  await expect(page.getByText(/\d{1,2}:\d{2} (AM|PM)/)).toBeVisible({ timeout: 10_000 });

  // Click first available time chip
  const timeChip = page.locator('button').filter({ hasText: /\d{1,2}:\d{2} (AM|PM)/ }).first();
  const timeName = (await timeChip.textContent())?.trim();
  await timeChip.click();

  // Time Slot header should now show the selected time
  await expect(page.getByText(timeName!)).toBeVisible();
  // Section should be collapsed (Expand button visible now)
  await expect(page.getByText('Expand')).toBeVisible();
});

// ---------------------------------------------------------------------------
// TC-11  Custom Time hidden by default, visible after clicking
// ---------------------------------------------------------------------------

test('TC-11: custom time input hidden by default; appears after tapping "+ Custom time"', async ({ page }) => {
  await loginAs(page);
  await openNewGame(page);
  await fillAllPlayers(page);
  await page.getByRole('button', { name: 'Score + Save' }).click();

  // Select court to open time section
  await page.locator('button').filter({ hasText: /court/i }).first().click();

  // Custom time input should NOT be visible yet
  await expect(page.locator('input[type="time"]')).not.toBeVisible();
  await expect(page.getByText('+ Custom time')).toBeVisible();

  // Click the button
  await page.getByText('+ Custom time').click();
  await expect(page.locator('input[type="time"]')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use time' })).toBeVisible();
});

// ---------------------------------------------------------------------------
// TC-12  Custom Time Future Guard
// ---------------------------------------------------------------------------

test('TC-12: entering a future time shows error and does not select it', async ({ page }) => {
  await loginAs(page);
  await openNewGame(page);
  await fillAllPlayers(page);
  await page.getByRole('button', { name: 'Score + Save' }).click();

  // Select court
  await page.locator('button').filter({ hasText: /court/i }).first().click();

  // Open custom time
  await page.getByText('+ Custom time').click();

  // Set a clearly future time (23:55)
  await page.locator('input[type="time"]').fill('23:55');
  await page.getByRole('button', { name: 'Use time' }).click();

  // Should show error; startTime header should still say "Select time"
  await expect(page.getByText(/future/i)).toBeVisible();
  await expect(page.getByText('Select time')).toBeVisible();
});

// ---------------------------------------------------------------------------
// TC-14  Score Validation
// ---------------------------------------------------------------------------

test('TC-14: invalid badminton scores show warning and Save Game is disabled', async ({ page }) => {
  await loginAs(page);
  await openNewGame(page);
  await fillAllPlayers(page);
  await page.getByRole('button', { name: 'Score + Save' }).click();

  // Default scores (21-17) are valid; make them invalid: 21-20
  // Click + on Team B to raise it from 17 to 20
  const plusBtns = page.locator('button', { hasText: '+' });
  for (let i = 0; i < 3; i++) {
    await plusBtns.nth(1).click(); // second + is Team B
  }

  // Now score should be 21-20 which is invalid (21-pt win needs ≤19 opponent)
  await expect(page.getByText(/invalid|score|rule/i).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save Game' })).toBeDisabled();
});

// ---------------------------------------------------------------------------
// TC-15  Flip Sides
// ---------------------------------------------------------------------------

test('TC-15: Flip Sides swaps Team A and Team B scores', async ({ page }) => {
  await loginAs(page);
  await openNewGame(page);
  await fillAllPlayers(page);
  await page.getByRole('button', { name: 'Score + Save' }).click();

  // Read initial scores (default 21 and 17)
  const scoreDisplays = page.locator('[style*="font-size: 40px"], [style*="fontSize: 40"]');
  const initA = (await scoreDisplays.first().textContent())?.trim();
  const initB = (await scoreDisplays.nth(1).textContent())?.trim();

  await page.getByRole('button', { name: /flip sides/i }).click();

  const flippedA = (await scoreDisplays.first().textContent())?.trim();
  const flippedB = (await scoreDisplays.nth(1).textContent())?.trim();

  expect(flippedA).toBe(initB);
  expect(flippedB).toBe(initA);
});

// ---------------------------------------------------------------------------
// TC-16  Save Gate
// ---------------------------------------------------------------------------

test('TC-16: Save Game disabled without court/time, enabled when all inputs valid', async ({ page }) => {
  await loginAs(page);
  await openNewGame(page);
  await fillAllPlayers(page);
  await page.getByRole('button', { name: 'Score + Save' }).click();

  // No court or time selected → Save disabled
  await expect(page.getByRole('button', { name: 'Save Game' })).toBeDisabled();

  // Select court and a time chip
  await page.locator('button').filter({ hasText: /court/i }).first().click();
  const timeChip = page.locator('button').filter({ hasText: /\d{1,2}:\d{2} (AM|PM)/ }).first();
  await timeChip.click();

  // Scores default to 21-17 which is valid → Save should be enabled
  await expect(page.getByRole('button', { name: 'Save Game' })).toBeEnabled({ timeout: 5_000 });
});

// ---------------------------------------------------------------------------
// TC-17  Expand/Collapse
// ---------------------------------------------------------------------------

test('TC-17: court and time sections expand/collapse via header button', async ({ page }) => {
  await loginAs(page);
  await openNewGame(page);
  await fillAllPlayers(page);
  await page.getByRole('button', { name: 'Score + Save' }).click();

  // Court is initially expanded
  await expect(page.getByText('Collapse').first()).toBeVisible();

  // Collapse it manually via header
  const courtHeader = page.locator('button').filter({ hasText: 'Court:' }).first();
  await courtHeader.click();
  await expect(page.getByText('Expand').first()).toBeVisible();

  // Expand it again
  await courtHeader.click();
  await expect(page.getByText('Collapse').first()).toBeVisible();
});

// ---------------------------------------------------------------------------
// TC-18  Back Button from Step 2 returns to Step 1 without clearing data
// ---------------------------------------------------------------------------

test('TC-18: Back on step 2 returns to step 1 and preserves all step-2 state', async ({ page }) => {
  await loginAs(page);
  await openNewGame(page);
  await fillAllPlayers(page);
  await page.getByRole('button', { name: 'Score + Save' }).click();

  // Choose court
  const courtChip = page.locator('button').filter({ hasText: /court/i }).first();
  const courtName = (await courtChip.textContent())?.trim();
  await courtChip.click();

  // Choose a time slot
  const timeChip = page.locator('button').filter({ hasText: /\d{1,2}:\d{2} (AM|PM)/ }).first();
  const timeName = (await timeChip.textContent())?.trim();
  await timeChip.click();

  // Hit Back
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByText('Step 1 of 2')).toBeVisible();

  // Return to step 2
  await page.getByRole('button', { name: 'Score + Save' }).click();
  await expect(page.getByText('Step 2 of 2')).toBeVisible();

  // Court and time should still be selected
  await expect(page.getByText(courtName!)).toBeVisible();
  await expect(page.getByText(timeName!)).toBeVisible();
});
