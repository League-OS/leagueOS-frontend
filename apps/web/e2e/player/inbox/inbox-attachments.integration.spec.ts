import { expect, test } from '@playwright/test';
import { loginViaAdminUi, loginViaUi, resolveCredentialForRole } from '../../role-auth';

function uniqueTitle(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+XGfQAAAAASUVORK5CYII=';

test('club admin can send an image notification and player inbox renders the attachment', async ({ page, request }) => {
  const { creds: adminCreds } = await resolveCredentialForRole(request, 'CLUB_ADMIN');
  const { creds: userCreds } = await resolveCredentialForRole(request, 'USER');

  const title = uniqueTitle('Attachment notice');
  const body = 'Tournament poster is now available in your inbox.';

  await loginViaAdminUi(page, adminCreds);
  await page.goto('/admin');

  await page.getByRole('button', { name: /open notifications/i }).click();
  await expect(page.getByRole('heading', { name: /^Notifications$/i })).toBeVisible();
  await page.getByPlaceholder('e.g. Session moved to Court 2').fill(title);
  await page.getByPlaceholder('Write the message club members should receive.').fill(body);

  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles({
    name: 'poster.png',
    mimeType: 'image/png',
    buffer: Buffer.from(PNG_BASE64, 'base64'),
  });

  await expect(page.getByText(/Attached: poster\.png/i)).toBeVisible();
  await page.getByRole('button', { name: /send message/i }).click();

  await expect(page.getByRole('heading', { name: /^Notifications$/i })).toBeVisible();
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await expect(page.getByText(/Attachment: poster\.png/i)).toBeVisible();

  await loginViaUi(page, userCreds);
  await page.getByRole('button', { name: /^Inbox$/i }).click();

  const notificationCard = page.locator('article').filter({ has: page.getByRole('heading', { name: title }) }).first();
  await expect(notificationCard).toBeVisible();
  await expect(notificationCard.getByText(/Image .* poster\.png/i)).toBeVisible();

  await notificationCard.click();

  await expect(notificationCard.getByAltText('poster.png')).toBeVisible();
  await expect(notificationCard.getByText(body, { exact: true })).toBeVisible();
});
