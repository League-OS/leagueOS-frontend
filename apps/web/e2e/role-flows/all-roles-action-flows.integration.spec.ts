import { expect, test, type Page } from '@playwright/test';
import {
  loginViaAdminUi,
  loginViaUi,
  logoutToLogin,
  resetUiAuthState,
  resolveCredentialForRole,
} from '../role-auth';

const ADMIN_SECTIONS = [
  { label: 'Dashboard', path: '/admin' },
  { label: 'Clubs', path: '/admin/clubs' },
  { label: 'Config', path: '/admin/config' },
  { label: 'Users', path: '/admin/users' },
] as const;

const LEAGUE_ADMIN_SECTIONS = [
  { label: 'Dashboard', path: '/admin' },
  { label: 'Clubs', path: '/admin/clubs' },
  { label: 'Seasons', path: '/admin/seasons' },
  { label: 'Sessions', path: '/admin/sessions' },
  { label: 'Courts', path: '/admin/courts' },
  { label: 'Tournaments', path: '/admin/tournaments' },
  { label: 'Club Players', path: '/admin/players' },
  { label: 'Users', path: '/admin/users' },
] as const;
const USER_CANDIDATE_CREDS = [
  {
    email: process.env.E2E_RECORDER_EMAIL || process.env.E2E_USER_EMAIL || 'enosh_fvma_badminton_club@leagueos.local',
    password: process.env.E2E_RECORDER_PASSWORD || process.env.E2E_USER_PASSWORD || 'Recorder@123',
  },
  {
    email: process.env.E2E_PLAYER_EMAIL || 'playerone@leagueos.local',
    password: process.env.E2E_PLAYER_PASSWORD || 'PlayerOne@123',
  },
];

async function loginAsAnyUser(page: Page) {
  let lastError: unknown;
  for (const creds of USER_CANDIDATE_CREDS) {
    try {
      await loginViaUi(page, creds);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Unable to login as USER in UI. Last error: ${String(lastError)}`);
}

async function goToAdminSection(page: Page, label: string, expectedPath: string) {
  await page.getByRole('link', { name: new RegExp(`^${label}$`, 'i') }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(expectedPath);
}

test.describe('Role Action Flows', () => {
  test.describe('GLOBAL_ADMIN', () => {
    test.describe('Authentication + Workspace Navigation', () => {
      test('can sign in, navigate all allowed sections, and sign out', async ({ page, request }) => {
        const { creds } = await resolveCredentialForRole(request, 'GLOBAL_ADMIN');
        await loginViaAdminUi(page, creds);

        await expect(page.getByRole('link', { name: /^dashboard$/i })).toBeVisible();
        await expect(page.getByRole('link', { name: /^seasons$/i })).toHaveCount(0);
        await expect(page.getByRole('link', { name: /^sessions$/i })).toHaveCount(0);
        await expect(page.getByRole('link', { name: /^tournaments$/i })).toHaveCount(0);

        for (const section of ADMIN_SECTIONS) {
          await goToAdminSection(page, section.label, section.path);
        }

        await logoutToLogin(page);
      });
    });

    test.describe('Primary Buttons', () => {
      test('can open and cancel Add Club and Add User dialogs', async ({ page, request }) => {
        const { creds } = await resolveCredentialForRole(request, 'GLOBAL_ADMIN');
        await loginViaAdminUi(page, creds);

        await goToAdminSection(page, 'Clubs', '/admin/clubs');
        await page.getByRole('button', { name: /^add club$/i }).click();
        await expect(page.getByRole('button', { name: /^cancel$/i }).first()).toBeVisible();
        await page.getByRole('button', { name: /^cancel$/i }).first().click();

        await goToAdminSection(page, 'Users', '/admin/users');
        await page.getByRole('button', { name: /^add user$/i }).click();
        await expect(page.getByRole('button', { name: /^cancel$/i }).first()).toBeVisible();
        await page.getByRole('button', { name: /^cancel$/i }).first().click();
      });
    });
  });

  test.describe('LEAGUE_ADMIN', () => {
    test.describe('Navigation + Modals', () => {
      test('can navigate admin sections and open core create flows', async ({ page, request }) => {
        const { creds } = await resolveCredentialForRole(request, 'CLUB_ADMIN');
        await loginViaAdminUi(page, creds);

        await expect(page.getByRole('link', { name: /^config$/i })).toHaveCount(0);
        await expect(page.getByRole('button', { name: /^add club$/i })).toHaveCount(0);
        await expect(page.getByRole('button', { name: /^add user$/i })).toHaveCount(0);

        for (const section of LEAGUE_ADMIN_SECTIONS) {
          await goToAdminSection(page, section.label, section.path);
        }

        await goToAdminSection(page, 'Sessions', '/admin/sessions');
        await page.getByRole('button', { name: /^create$/i }).click();
        await expect(page.getByRole('button', { name: /^create session$/i })).toBeVisible();
        await page.getByRole('button', { name: /^cancel$/i }).first().click();

        await goToAdminSection(page, 'Club Players', '/admin/players');
        await page.getByRole('button', { name: /^add player$/i }).click();
        await expect(page.getByRole('button', { name: /^cancel$/i }).first()).toBeVisible();
        await page.getByRole('button', { name: /^cancel$/i }).first().click();

        await goToAdminSection(page, 'Tournaments', '/admin/tournaments');
        await page.getByRole('button', { name: /create new tournament/i }).click();
        await expect(page.getByText(/create tournament/i).first()).toBeVisible();
        await page.getByRole('button', { name: /^cancel$/i }).first().click();
      });
    });

  });

  test.describe('USER', () => {
    test.describe('Player App Flows', () => {
      test('can navigate player tabs, toggle profile preference, and logout', async ({ page }) => {
        await loginAsAnyUser(page);

        await page.getByRole('button', { name: /leaderboard/i }).click();
        await expect(page.getByRole('heading', { name: /season leaderboard/i })).toBeVisible();

        await page.getByRole('button', { name: /tournaments/i }).click();
        await expect(page.getByRole('heading', { name: /^tournaments$/i })).toBeVisible();

        await page.getByRole('button', { name: /profile/i }).click();
        await expect(page.getByRole('heading', { name: /^profile$/i })).toBeVisible();
        await page.getByRole('button', { name: /user preferences/i }).click();
        const privacyToggle = page.getByRole('button', { name: /hide my name on leaderboard/i });
        await expect(privacyToggle).toBeVisible();
        await privacyToggle.click();
        await privacyToggle.click();

        await page.getByRole('button', { name: /home/i }).click();
        await expect(page.getByText(/recent games|no games yet/i).first()).toBeVisible();

        await page.goto('/admin');
        await expect(page.getByRole('button', { name: /sign in to admin/i })).toBeVisible();
        await expect(page.getByRole('link', { name: /^dashboard$/i })).toHaveCount(0);

        await page.goto('/');
        await page.getByRole('button', { name: /leaderboard/i }).click();
        await logoutToLogin(page);
      });
    });

    test.describe('Authentication Feedback', () => {
      test('shows user-friendly invalid email message instead of raw validation JSON', async ({ page }) => {
        await resetUiAuthState(page);
        await page.goto('/');
        await page.getByLabel('Email').fill('nixkollan@gmailcom');
        await page.getByRole('textbox', { name: /^password/i }).fill('InvalidPassword@123');
        await page.getByRole('button', { name: /^sign in$/i }).click();

        await expect(page.getByText(/\[\{\s*["']validation["']/i)).toHaveCount(0);
        await expect(page.getByText(/invalid email|valid email|enter a valid email/i)).toBeVisible();
      });
    });
  });
});
