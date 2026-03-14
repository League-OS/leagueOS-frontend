import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const API_BASE = process.env.E2E_API_BASE || 'http://127.0.0.1:8000';
const UI_EMAIL = process.env.E2E_EMAIL || 'enosh_fvma_badminton_club@leagueos.local';
const UI_PASSWORD = process.env.E2E_PASSWORD || 'Recorder@123';

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

  const tournament = await createTournament(request, auth, tournamentName);
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
});

test('format stage rules persist after save and reload', async ({ page, request }) => {
  const auth = await apiLogin(request, UI_EMAIL, UI_PASSWORD);
  const suffix = Date.now();
  const tournamentName = `e2e-stage-rules-${suffix}`;
  const formatName = `fmt-stage-rules-${suffix}`;

  const tournament = await createTournament(request, auth, tournamentName);
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
});
