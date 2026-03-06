import { expect, test } from '@playwright/test';

type Credentials = {
  email: string;
  password: string;
};

const GLOBAL_ADMIN: Credentials = {
  email: process.env.E2E_GLOBAL_ADMIN_EMAIL || 'GlobalAdmin@leagueos.local',
  password: process.env.E2E_GLOBAL_ADMIN_PASSWORD || 'GlobalAdmin@123',
};

const CLUB_ADMIN: Credentials = {
  email: process.env.E2E_CLUB_ADMIN_EMAIL || 'fvma-clubAdmin@leagueos.local',
  password: process.env.E2E_CLUB_ADMIN_PASSWORD || 'Admin@123',
};

const RECORDER: Credentials = {
  email: process.env.E2E_RECORDER_EMAIL || 'enosh_fvma_badminton_club@leagueos.local',
  password: process.env.E2E_RECORDER_PASSWORD || 'Recorder@123',
};

const USER: Credentials = {
  email: process.env.E2E_USER_EMAIL || 'playerone@leagueos.local',
  password: process.env.E2E_USER_PASSWORD || 'PlayerOne@123',
};

async function login(page: Parameters<typeof test>[0]['page'], creds: Credentials) {
  await page.goto('/');
  await page.getByLabel('Email').fill(creds.email);
  await page.getByRole('textbox', { name: /^Password/i }).fill(creds.password);
  await page.getByRole('button', { name: /sign in/i }).click();
}

async function expectAdminRedirect(page: Parameters<typeof test>[0]['page']) {
  await expect.poll(() => new URL(page.url()).pathname).toContain('/admin');
}

async function expectPlayerApp(page: Parameters<typeof test>[0]['page']) {
  await expect(page.getByRole('button', { name: /sign in/i })).not.toBeVisible();
  await expect.poll(() => new URL(page.url()).pathname).not.toContain('/admin');
}

test('Global Admin redirects to /admin after login', async ({ page }) => {
  await login(page, GLOBAL_ADMIN);
  await expectAdminRedirect(page);
});

test('Club Admin redirects to /admin after login', async ({ page }) => {
  await login(page, CLUB_ADMIN);
  await expectAdminRedirect(page);
});

test('Recorder remains in player app (not /admin) after login', async ({ page }) => {
  await login(page, RECORDER);
  await expectPlayerApp(page);
});

test('User remains in player app (not /admin) after login', async ({ page }) => {
  await login(page, USER);
  await expectPlayerApp(page);
});
