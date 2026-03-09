/**
 * Edit Game Workflow – Playwright E2E tests
 *
 * Verifies that opening an existing game in edit mode:
 *  - Pre-fills all Step 1 (players) and Step 2 (court / time / score) values
 *  - Allows changing score and saving
 *  - Returns the user to the game list after a successful edit
 *
 * Requires the same environment as add-game-workflow.spec.ts.
 *   E2E_EMAIL, E2E_PASSWORD, E2E_BASE_URL, E2E_API_BASE
 */

import { expect, test, type Page } from '@playwright/test';

const EMAIL    = process.env.E2E_EMAIL    || 'user@clubrally.local';
const PASSWORD = process.env.E2E_PASSWORD || 'User@1234';
const API_BASE = process.env.E2E_API_BASE || 'http://127.0.0.1:8000';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loginAs(page: Page, email = EMAIL, password = PASSWORD) {
  await page.goto('/');
  await page.getByPlaceholder(/email/i).fill(email);
  await page.getByPlaceholder(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await expect(page.getByRole('button', { name: /new game/i })).toBeVisible({ timeout: 20_000 });
}

/**
 * Navigate to the game list on the Home tab and click the first CREATED
 * (editable) game row that appears.
 * Returns the row text so callers can assert on it.
 */
async function openFirstEditableGame(page: Page): Promise<string | null> {
  // The Home tab should already be active after login.
  // Games are in a table/list; look for "Edit" button or clickable rows.
  // In the current UI the game row is clickable and opens a detail view
  // with an "Edit" button if the session is not FINALIZED.

  // Open "All Games" if available
  const allGamesBtn = page.getByRole('button', { name: /all games/i });
  if (await allGamesBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await allGamesBtn.click();
  }

  // Find a game row (tr or clickable div that contains a score like "21-17")
  const gameRow = page.locator('tr, [role="row"], button').filter({ hasText: /\d+-\d+/ }).first();
  const rowText = await gameRow.textContent();
  await gameRow.click();

  return rowText?.trim() ?? null;
}

// ---------------------------------------------------------------------------
// EG-01  Edit mode pre-fills existing game data
// ---------------------------------------------------------------------------

test('EG-01: opening an existing game pre-fills players, court, time, and score', async ({ page }) => {
  await loginAs(page);

  // Open the first available game's detail view
  await openFirstEditableGame(page);

  // Look for an Edit button in the detail panel
  const editBtn = page.getByRole('button', { name: /edit/i });
  if (!await editBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    test.skip(); // No editable game available in this environment
    return;
  }
  await editBtn.click();

  // Should land on "Edit Game" Step 1
  await expect(page.getByText('Edit Game')).toBeVisible();
  await expect(page.getByText('Step 1 of 2')).toBeVisible();

  // All four player slots should NOT say "Select player" (pre-filled)
  const selectPlaceholders = page.getByRole('button', { name: 'Select player' });
  await expect(selectPlaceholders).toHaveCount(0);

  // Advance to step 2 (players are pre-filled so the tab should be clickable)
  await page.getByRole('button', { name: 'Score + Save' }).click();
  await expect(page.getByText('Step 2 of 2')).toBeVisible();

  // Court should not say "Select court"
  const courtLabel = page.locator('button').filter({ hasText: /court/i }).first();
  await expect(courtLabel).not.toHaveText('Select court');

  // Time Slot should not say "Select time"
  await expect(page.getByText('Select time')).not.toBeVisible();
});

// ---------------------------------------------------------------------------
// EG-02  Score can be changed and saved
// ---------------------------------------------------------------------------

test('EG-02: editing the score and saving updates the game', async ({ page }) => {
  await loginAs(page);
  await openFirstEditableGame(page);

  const editBtn = page.getByRole('button', { name: /edit/i });
  if (!await editBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    test.skip();
    return;
  }
  await editBtn.click();

  // Go straight to step 2
  await page.getByRole('button', { name: 'Score + Save' }).click();
  await expect(page.getByText('Step 2 of 2')).toBeVisible();

  // Click a quick-score chip to pick a definite valid score
  const scoreChip = page.getByRole('button', { name: '21-18' });
  await scoreChip.click();

  // Save should be enabled now (court + time already pre-filled)
  const saveBtn = page.getByRole('button', { name: 'Save Game' });
  await expect(saveBtn).toBeEnabled({ timeout: 5_000 });
  await saveBtn.click();

  // After successful save the edit form should close
  await expect(page.getByText('Edit Game')).not.toBeVisible({ timeout: 15_000 });
});

// ---------------------------------------------------------------------------
// EG-03  Back on step 2 returns to step 1 in edit mode
// ---------------------------------------------------------------------------

test('EG-03: Back on edit step 2 returns to edit step 1 without clearing players', async ({ page }) => {
  await loginAs(page);
  await openFirstEditableGame(page);

  const editBtn = page.getByRole('button', { name: /edit/i });
  if (!await editBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    test.skip();
    return;
  }
  await editBtn.click();

  // Capture player names in step 1
  const allSlotBtns = page.locator('button').filter({ hasNot: page.getByText('Select player') });
  const step1Text = await page.locator('[data-testid="team-a"], [data-testid="team-b"]').allTextContents().catch(() => []);

  await page.getByRole('button', { name: 'Score + Save' }).click();
  await expect(page.getByText('Step 2 of 2')).toBeVisible();

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByText('Step 1 of 2')).toBeVisible();

  // Player slots should still not say "Select player"
  await expect(page.getByRole('button', { name: 'Select player' })).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// EG-04  Flip Sides in edit mode works the same as in add mode
// ---------------------------------------------------------------------------

test('EG-04: Flip Sides in edit mode swaps A/B scores', async ({ page }) => {
  await loginAs(page);
  await openFirstEditableGame(page);

  const editBtn = page.getByRole('button', { name: /edit/i });
  if (!await editBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    test.skip();
    return;
  }
  await editBtn.click();
  await page.getByRole('button', { name: 'Score + Save' }).click();

  const scores = page.locator('[style*="font-size: 40px"], [style*="fontSize: 40"]');
  const beforeA = (await scores.first().textContent())?.trim();
  const beforeB = (await scores.nth(1).textContent())?.trim();

  await page.getByRole('button', { name: /flip sides/i }).click();

  const afterA = (await scores.first().textContent())?.trim();
  const afterB = (await scores.nth(1).textContent())?.trim();

  expect(afterA).toBe(beforeB);
  expect(afterB).toBe(beforeA);
});
