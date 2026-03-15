import { expect, test } from '@playwright/test';
import { loginViaUi, resolveCredentialForRole } from '../../role-auth';

const API_BASE = process.env.E2E_API_BASE || 'http://127.0.0.1:8000';

function uniqueName(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function isoMinutesFromNow(minutes: number) {
  return new Date(Date.now() + minutes * 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

async function ensureLinkedUserPlayer(args: {
  request: import('@playwright/test').APIRequestContext;
  adminToken: string;
  clubId: number;
  userEmail: string;
}) {
  const { request, adminToken, clubId, userEmail } = args;
  const headers = { Authorization: `Bearer ${adminToken}` };

  const listed = await request.get(`${API_BASE}/players?club_id=${clubId}&is_active=true`, { headers });
  expect(listed.ok()).toBeTruthy();
  const players = (await listed.json()) as Array<{ id: number; email?: string | null; display_name: string }>;
  const existing = [...players]
    .filter((player) => (player.email || '').toLowerCase() === userEmail.toLowerCase())
    .sort((left, right) => left.id - right.id)[0];
  if (existing) return existing;

  const displayName = uniqueName('e2e-linked-user');
  const created = await request.post(`${API_BASE}/players?club_id=${clubId}`, {
    headers,
    data: {
      club_id: clubId,
      display_name: displayName,
      email: userEmail,
      elo_initial_doubles: 1000,
      elo_initial_singles: 1000,
      elo_initial_mixed: 1000,
      player_type: 'ROSTER',
      sex: 'U',
      is_active: true,
    },
  });
  expect(created.ok()).toBeTruthy();
  return (await created.json()) as { id: number; email?: string | null; display_name: string };
}

async function createOpenTournamentWithFormat(args: {
  request: import('@playwright/test').APIRequestContext;
  adminToken: string;
  clubId: number;
}) {
  const { request, adminToken, clubId } = args;
  const headers = { Authorization: `Bearer ${adminToken}` };
  const tournamentName = uniqueName('e2e-player-signup');
  const formatName = uniqueName('e2e-singles');

  const tournamentRes = await request.post(`${API_BASE}/tournaments?club_id=${clubId}`, {
    headers,
    data: {
      name: tournamentName,
      timezone: 'America/Vancouver',
      schedule_start_at: isoMinutesFromNow(90),
    },
  });
  expect(tournamentRes.ok()).toBeTruthy();
  const tournament = (await tournamentRes.json()) as { id: number; name: string };

  const openRes = await request.post(`${API_BASE}/tournaments/${tournament.id}/status?club_id=${clubId}`, {
    headers,
    data: { status: 'REGISTRATION_OPEN' },
  });
  expect(openRes.ok()).toBeTruthy();

  const formatRes = await request.post(`${API_BASE}/tournaments/${tournament.id}/formats?club_id=${clubId}`, {
    headers,
    data: {
      name: formatName,
      format_type: 'SINGLES',
      registration_open_at: isoMinutesFromNow(-60),
      registration_close_at: isoMinutesFromNow(1440),
      auto_registration_close: false,
    },
  });
  expect(formatRes.ok()).toBeTruthy();
  const format = (await formatRes.json()) as { id: number; name: string };

  return { tournamentId: tournament.id, tournamentName: tournament.name, formatId: format.id, formatName: format.name };
}

test('player signup adds the linked player into the correct format pool', async ({ page, request }) => {
  const { creds: userCreds, login: userLogin } = await resolveCredentialForRole(request, 'USER');
  const { login: adminLogin } = await resolveCredentialForRole(request, 'CLUB_ADMIN');

  const userProfileRes = await request.get(`${API_BASE}/profile`, {
    headers: { Authorization: `Bearer ${userLogin.token}` },
  });
  expect(userProfileRes.ok()).toBeTruthy();
  const userProfile = (await userProfileRes.json()) as { email: string };

  const linkedPlayer = await ensureLinkedUserPlayer({
    request,
    adminToken: adminLogin.token,
    clubId: adminLogin.club_id,
    userEmail: userProfile.email,
  });
  const tournament = await createOpenTournamentWithFormat({
    request,
    adminToken: adminLogin.token,
    clubId: adminLogin.club_id,
  });

  await loginViaUi(page, userCreds);
  await page.goto(`/tournaments/${tournament.tournamentId}`);

  await expect(page.getByRole('heading', { name: tournament.tournamentName })).toBeVisible();
  const formatCard = page.locator('article').filter({ has: page.getByText(tournament.formatName, { exact: true }) }).first();
  await expect(formatCard).toBeVisible();
  await expect(formatCard.getByRole('button', { name: /^Sign Up$/i })).toBeVisible();

  await formatCard.getByRole('button', { name: /^Sign Up$/i }).click();

  await expect(page.getByText(/your name is now in the format pool/i)).toBeVisible();
  await expect(formatCard.getByText(linkedPlayer.display_name, { exact: true })).toBeVisible();
  await expect(formatCard.getByRole('button', { name: /^Signed Up$/i })).toBeDisabled();

  const registrations = await request.get(
    `${API_BASE}/tournaments/${tournament.tournamentId}/formats/${tournament.formatId}/registrations?club_id=${userLogin.club_id}`,
    {
      headers: { Authorization: `Bearer ${userLogin.token}` },
    },
  );
  expect(registrations.ok()).toBeTruthy();
  const rows = (await registrations.json()) as Array<{ player_id: number; registration_source: string; status: string }>;
  expect(rows.some((row) => row.player_id === linkedPlayer.id && row.registration_source === 'SELF' && row.status === 'ACTIVE')).toBeTruthy();
});
