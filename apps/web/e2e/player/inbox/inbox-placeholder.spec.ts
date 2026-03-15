import { expect, test } from '@playwright/test';
import { loginViaUi, resolveCredentialForRole } from '../../role-auth';

test('player bottom nav exposes Inbox placeholder', async ({ page, request }) => {
  const { creds } = await resolveCredentialForRole(request, 'USER');
  await loginViaUi(page, creds);

  const inboxTab = page.getByRole('button', { name: /^Inbox$/i });
  await expect(inboxTab).toBeVisible();
  await inboxTab.click();

  await expect(page.getByRole('heading', { name: 'Inbox' })).toBeVisible();
  await expect(page.getByText(/placeholder for alerts, invites, and system messages/i)).toBeVisible();
});
