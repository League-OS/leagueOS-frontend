import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { loginViaAdminUi, resolveCredentialForRole } from './role-auth';

const API_BASE = process.env.E2E_API_BASE || 'http://127.0.0.1:8000';
const UI_EMAIL = process.env.E2E_EMAIL || 'enosh_fvma_badminton_club@leagueos.local';
const UI_PASSWORD = process.env.E2E_PASSWORD || 'Recorder@123';

function uniqueName(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function isoMinutesFromNow(minutes: number) {
  return new Date(Date.now() + minutes * 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

async function apiLogin(request: APIRequestContext, email: string, password: string) {
  const res = await request.post(`${API_BASE}/auth/login`, { data: { email, password } });
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as { token: string; club_id: number };
}

async function createTournament(
  request: APIRequestContext,
  auth: { token: string; club_id: number },
  name: string,
) {
  const response = await request.post(`${API_BASE}/tournaments?club_id=${auth.club_id}`, {
    headers: { Authorization: `Bearer ${auth.token}` },
    data: { name, timezone: 'America/Vancouver' },
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as { id: number };
}

async function ensureLinkedUserPlayer(args: {
  request: APIRequestContext;
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

  const displayName = uniqueName('e2e-self-signup');
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

async function deleteTournament(request: APIRequestContext, auth: { token: string; club_id: number }, tournamentId: number) {
  const response = await request.delete(`${API_BASE}/tournaments/${tournamentId}?club_id=${auth.club_id}`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  });
  if (response.status() === 404) return;
  expect(response.ok()).toBeTruthy();
}

async function createFormat(
  request: APIRequestContext,
  auth: { token: string; club_id: number },
  tournamentId: number,
  payload: Record<string, unknown>,
) {
  const response = await request.post(`${API_BASE}/tournaments/${tournamentId}/formats?club_id=${auth.club_id}`, {
    headers: { Authorization: `Bearer ${auth.token}` },
    data: payload,
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as { id: number };
}

async function setTournamentStatus(
  request: APIRequestContext,
  auth: { token: string; club_id: number },
  tournamentId: number,
  status: 'REGISTRATION_OPEN' | 'REGISTRATION_CLOSED',
) {
  const response = await request.post(`${API_BASE}/tournaments/${tournamentId}/status?club_id=${auth.club_id}`, {
    headers: { Authorization: `Bearer ${auth.token}` },
    data: { status },
  });
  expect(response.ok()).toBeTruthy();
}

async function firstNPlayerIds(
  request: APIRequestContext,
  auth: { token: string; club_id: number },
  n: number,
) {
  const response = await request.get(`${API_BASE}/players?club_id=${auth.club_id}&is_active=true&limit=50`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  });
  expect(response.ok()).toBeTruthy();
  const rows = (await response.json()) as Array<{ id: number }>;
  const ids = rows.map((row) => Number(row.id)).filter((id) => Number.isInteger(id) && id > 0).slice(0, n);
  expect(ids.length).toBeGreaterThanOrEqual(n);
  return ids;
}

async function addRegistrations(
  request: APIRequestContext,
  auth: { token: string; club_id: number },
  tournamentId: number,
  formatId: number,
  playerIds: number[],
) {
  for (const playerId of playerIds) {
    const response = await request.post(
      `${API_BASE}/tournaments/${tournamentId}/formats/${formatId}/registrations?club_id=${auth.club_id}`,
      {
        headers: { Authorization: `Bearer ${auth.token}` },
        data: { player_id: playerId, registration_source: 'ADMIN' },
      },
    );
    expect(response.ok()).toBeTruthy();
  }
}

async function openTournamentAndFormat(page: Page, tournamentName: string, formatName: string) {
  await page.goto('/admin/tournaments');
  await page.getByRole('button', { name: `Open ${tournamentName}` }).click();
  await page.getByRole('button', { name: new RegExp(`^Edit ${formatName}$`) }).first().waitFor({ state: 'visible' });
  await page.locator('article[role="button"]').filter({ hasText: formatName }).first().click();
}

test('schedule generation is blocked when no tournament courts exist', async ({ page, request }) => {
  const auth = await apiLogin(request, UI_EMAIL, UI_PASSWORD);
  const suffix = Date.now();
  const tournamentName = `e2e-no-courts-${suffix}`;
  const formatName = `fmt-no-courts-${suffix}`;
  let tournamentId: number | null = null;

  try {
    const tournament = await createTournament(request, auth, tournamentName);
    tournamentId = tournament.id;
    const format = await createFormat(request, auth, tournament.id, {
      name: formatName,
      format_type: 'DOUBLES',
      scheduling_model: 'DIRECT_KNOCKOUT',
      average_set_duration_minutes: 10,
    });

    await setTournamentStatus(request, auth, tournament.id, 'REGISTRATION_OPEN');
    const playerIds = await firstNPlayerIds(request, auth, 2);
    await addRegistrations(request, auth, tournament.id, format.id, playerIds);
    await setTournamentStatus(request, auth, tournament.id, 'REGISTRATION_CLOSED');

    await openTournamentAndFormat(page, tournamentName, formatName);
    await page.getByRole('button', { name: 'Schedules' }).click();

    const dialogPromise = page.waitForEvent('dialog');
    await page.getByRole('button', { name: /Generate Schedule/ }).click();
    const dialog = await dialogPromise;
    expect(dialog.message()).toContain('Add at least one tournament court before schedule generation.');
    await dialog.accept();
  } finally {
    if (tournamentId !== null) {
      await deleteTournament(request, auth, tournamentId);
    }
  }
});

test('format stage rules persist after save and reload', async ({ page, request }) => {
  const auth = await apiLogin(request, UI_EMAIL, UI_PASSWORD);
  const suffix = Date.now();
  const tournamentName = `e2e-stage-rules-${suffix}`;
  const formatName = `fmt-stage-rules-${suffix}`;
  let tournamentId: number | null = null;

  try {
    const tournament = await createTournament(request, auth, tournamentName);
    tournamentId = tournament.id;
    await createFormat(request, auth, tournament.id, {
      name: formatName,
      format_type: 'DOUBLES',
      scheduling_model: 'GROUPS_KO',
      average_set_duration_minutes: 10,
      group_count: 2,
      group_ko_teams_per_group: 2,
    });

    await openTournamentAndFormat(page, tournamentName, formatName);
    await page.getByRole('button', { name: 'Config' }).click();

    const stageOne = page.locator('article').filter({ hasText: /^Stage 1:/ }).first();
    const pointsInput = stageOne.getByLabel('Points to Win Set');
    await pointsInput.fill('19');
    await page.getByRole('button', { name: /^Save$/ }).first().click();
    await expect(page.getByText('Configuration saved')).toBeVisible();

    await page.reload();
    await openTournamentAndFormat(page, tournamentName, formatName);
    await page.getByRole('button', { name: 'Config' }).click();

    const reloadedStageOne = page.locator('article').filter({ hasText: /^Stage 1:/ }).first();
    await expect(reloadedStageOne.getByLabel('Points to Win Set')).toHaveValue('19');
  } finally {
    if (tournamentId !== null) {
      await deleteTournament(request, auth, tournamentId);
    }
  }
});

test('admin pool view includes self-registered players', async ({ page, request }) => {
  const { creds: adminCreds, login: adminLogin } = await resolveCredentialForRole(request, 'CLUB_ADMIN');
  const { login: userLogin } = await resolveCredentialForRole(request, 'USER');
  const suffix = Date.now();
  const tournamentName = `e2e-admin-pool-self-${suffix}`;
  const formatName = `fmt-admin-pool-self-${suffix}`;
  let tournamentId: number | null = null;

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

  try {
    const tournament = await createTournament(request, adminLogin, tournamentName);
    tournamentId = tournament.id;
    const openRes = await request.post(`${API_BASE}/tournaments/${tournament.id}/status?club_id=${adminLogin.club_id}`, {
      headers: { Authorization: `Bearer ${adminLogin.token}` },
      data: { status: 'REGISTRATION_OPEN' },
    });
    expect(openRes.ok()).toBeTruthy();

    const format = await createFormat(request, adminLogin, tournament.id, {
      name: formatName,
      format_type: 'SINGLES',
      registration_open_at: isoMinutesFromNow(-15),
      registration_close_at: isoMinutesFromNow(360),
      auto_registration_close: false,
      scheduling_model: 'DIRECT_KNOCKOUT',
    });
    const signupRes = await request.post(
      `${API_BASE}/tournaments/${tournament.id}/formats/${format.id}/registrations?club_id=${adminLogin.club_id}`,
      {
        headers: { Authorization: `Bearer ${userLogin.token}` },
        data: { player_id: linkedPlayer.id, registration_source: 'SELF' },
      },
    );
    expect(signupRes.ok()).toBeTruthy();

    await loginViaAdminUi(page, adminCreds);
    await openTournamentAndFormat(page, tournamentName, formatName);
    await page.getByRole('button', { name: 'Pool' }).click();

    const playerRow = page.getByRole('row').filter({ hasText: linkedPlayer.display_name }).first();
    await expect(playerRow).toBeVisible();
    await expect(playerRow.getByText('SELF')).toBeVisible();
  } finally {
    if (tournamentId !== null) {
      await deleteTournament(request, adminLogin, tournamentId);
    }
  }
});

test('tournament delete button removes tournament from UI and backend', async ({ page, request }) => {
  const auth = await apiLogin(request, UI_EMAIL, UI_PASSWORD);
  const suffix = Date.now();
  const tournamentName = `e2e-delete-ui-${suffix}`;
  const tournament = await createTournament(request, auth, tournamentName);
  let deleted = false;

  try {
    await page.goto('/admin/tournaments');
    await expect(page.getByRole('button', { name: `Open ${tournamentName}` })).toBeVisible();

    const confirmPromise = page.waitForEvent('dialog');
    await page.getByRole('button', { name: `Delete ${tournamentName}` }).click();
    const confirm = await confirmPromise;
    expect(confirm.type()).toBe('confirm');
    expect(confirm.message()).toContain(`Delete tournament "${tournamentName}"?`);
    await confirm.accept();

    await expect(page.getByRole('button', { name: `Open ${tournamentName}` })).toHaveCount(0);

    const response = await request.get(`${API_BASE}/tournaments/${tournament.id}?club_id=${auth.club_id}`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    });
    expect(response.status()).toBe(404);
    deleted = true;
  } finally {
    if (!deleted) {
      await deleteTournament(request, auth, tournament.id);
    }
  }
});
