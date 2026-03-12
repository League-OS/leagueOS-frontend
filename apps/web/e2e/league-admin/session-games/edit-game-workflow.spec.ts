/**
 * Edit Game Workflow – Playwright E2E tests
 *
 * Tests the "edit existing game" path: clicking a game row on the Home tab
 * opens the same AddGame form pre-filled with that game's data.
 *
 * Requires:
 *   - Next.js dev server + API server (same as add-game-workflow.spec.ts)
 *   - At least one game visible on the Home tab's "Recent Games" list.
 *   - An OPEN session must exist for editing to be allowed.
 *
 * Credentials override:
 *   E2E_EMAIL  E2E_PASSWORD
 */

import { expect, test, type Page } from '@playwright/test';

// Auth state reused via storageState; no per-test logins

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loginAs(page: Page) {
  // Auth state is pre-loaded via Playwright storageState (global setup).
  await page.goto('/');
  await expect(page.getByRole('button', { name: '+' })).toBeVisible({ timeout: 20_000 });
}

/**
 * Click the first game row in "Recent Games" (a button that contains a score like "21-17").
 * Returns the row's text for assertions.
 */
async function openFirstGameRow(page: Page): Promise<string | null> {
  const gameRow = page.locator('button').filter({ hasText: /\d{1,2}-\d{1,2}/ }).first();
  const rowText = await gameRow.textContent().catch(() => null);

  if (!rowText) {
    test.skip(true, 'No game rows found on the Home tab – skipping edit tests');
    return null;
  }

  await gameRow.click();
  return rowText.trim();
}

/** Check if the Edit Game form is open; if not, skip. */
async function requireEditFormOpen(page: Page) {
  const heading = page.getByRole('heading', { name: 'Edit Game', level: 2 });
  if (!await heading.isVisible({ timeout: 5_000 }).catch(() => false)) {
    test.skip(true, 'Edit Game form did not open – no editable game available');
  }
}

// ---------------------------------------------------------------------------
// EG-01  Edit mode pre-fills existing game data
// ---------------------------------------------------------------------------

test('EG-01: opening a game row pre-fills players, court, time, and score', async ({ page }) => {
  await loginAs(page);
  await openFirstGameRow(page);
  await requireEditFormOpen(page);

  // Step 1 should be shown with "Edit Game" heading
  await expect(page.getByText('Step 1 of 2')).toBeVisible();

  // All 4 player slots should be filled – no "Select player" buttons visible
  await expect(page.getByRole('button', { name: 'Select player' })).toHaveCount(0);

  // Advance to step 2
  await page.getByRole('button', { name: 'Score + Save' }).click();
  await expect(page.getByText('Step 2 of 2')).toBeVisible();

  // Court should not say "Select court"
  await expect(page.getByText('Select court')).not.toBeVisible();
  // Time should not say "Select time"
  await expect(page.getByText('Select time')).not.toBeVisible();
});

// ---------------------------------------------------------------------------
// EG-02  Changing score and saving in edit mode
// ---------------------------------------------------------------------------

test('EG-02: editing score via quick-score chip and saving closes the edit form', async ({ page }) => {
  await loginAs(page);
  await openFirstGameRow(page);
  await requireEditFormOpen(page);

  // Navigate to step 2
  await page.getByRole('button', { name: 'Score + Save' }).click();
  await expect(page.getByText('Step 2 of 2')).toBeVisible();

  // Use the 21-18 quick-score chip (guaranteed valid)
  await page.getByRole('button', { name: '21-18' }).click();

  // Save should be enabled (court + time already pre-filled in edit mode)
  const saveBtn = page.getByRole('button', { name: 'Save Game' });
  await expect(saveBtn).toBeEnabled({ timeout: 5_000 });
  await saveBtn.click();

  // Form should disappear after successful save
  await expect(page.getByRole('heading', { name: 'Edit Game', level: 2 })).not.toBeVisible({ timeout: 20_000 });
});

// ---------------------------------------------------------------------------
// EG-03  Back on step 2 returns to step 1 without clearing player data
// ---------------------------------------------------------------------------

test('EG-03: Back on edit step 2 returns to step 1 and players remain pre-filled', async ({ page }) => {
  await loginAs(page);
  await openFirstGameRow(page);
  await requireEditFormOpen(page);

  await page.getByRole('button', { name: 'Score + Save' }).click();
  await expect(page.getByText('Step 2 of 2')).toBeVisible();

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByText('Step 1 of 2')).toBeVisible();

  // Player slots must still be filled (no "Select player" buttons)
  await expect(page.getByRole('button', { name: 'Select player' })).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// EG-04  Flip Sides in edit mode swaps A/B scores
// ---------------------------------------------------------------------------

test('EG-04: Flip Sides in edit mode swaps Team A and Team B scores', async ({ page }) => {
  await loginAs(page);
  await openFirstGameRow(page);
  await requireEditFormOpen(page);

  await page.getByRole('button', { name: 'Score + Save' }).click();
  await expect(page.getByText('Step 2 of 2')).toBeVisible();

  const scores = page.locator('[style*="fontSize: 40px"], [style*="font-size: 40px"]');
  const beforeA = (await scores.nth(0).textContent())?.trim();
  const beforeB = (await scores.nth(1).textContent())?.trim();

  await page.getByRole('button', { name: /flip sides/i }).click();

  const afterA = (await scores.nth(0).textContent())?.trim();
  const afterB = (await scores.nth(1).textContent())?.trim();

  expect(afterA).toBe(beforeB);
  expect(afterB).toBe(beforeA);
});
