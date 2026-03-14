import { expect, test } from '@playwright/test';
import {
  loginViaAdminUi,
  loginViaUi,
  logoutToLogin,
  resolveCredentialForRole,
  waitForAdminShell,
} from '../../role-auth';

test.describe('Role Redirect Rules', () => {
  test('Global Admin can access /admin and logout returns to /', async ({ page, request }) => {
    const { creds } = await resolveCredentialForRole(request, 'GLOBAL_ADMIN');
    await loginViaAdminUi(page, creds);
    await expect(page).toHaveURL(/\/admin(?:\/.*)?$/);
    await waitForAdminShell(page);
    await expect(page.getByRole('link', { name: /^dashboard$/i })).toBeVisible();
    await logoutToLogin(page);
  });

  test('League Admin can access /admin and logout returns to /', async ({ page, request }) => {
    const { creds } = await resolveCredentialForRole(request, 'CLUB_ADMIN');
    await loginViaAdminUi(page, creds);
    await expect(page).toHaveURL(/\/admin(?:\/.*)?$/);
    await waitForAdminShell(page);
    await expect(page.getByRole('link', { name: /^sessions$/i })).toBeVisible();
    await logoutToLogin(page);
  });

  test('User login does not grant admin shell access', async ({ page, request }) => {
    const { creds } = await resolveCredentialForRole(request, 'USER');
    await loginViaUi(page, creds);

    await page.goto('/admin');
    await expect(page.getByRole('button', { name: /sign in to admin/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /^dashboard$/i })).toHaveCount(0);
  });
});
