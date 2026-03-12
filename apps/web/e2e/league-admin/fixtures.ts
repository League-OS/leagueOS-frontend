import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { apiLoginWithAnyCredential } from '../auth';

const API_BASE = process.env.E2E_API_BASE || 'http://127.0.0.1:8000';

type ApiAuth = { token: string; club_id: number };
let cachedAuth: ApiAuth | null = null;

type Season = { id: number; is_active?: boolean };
type Session = { id: number; status: string; season_id: number; session_start_time: string };
type Court = { id: number; is_active?: boolean };
type Player = { id: number; is_active?: boolean };

export async function ensureAdminPrereqs(request: APIRequestContext) {
  if (!cachedAuth) {
    cachedAuth = await apiLoginWithAnyCredential(request);
  }
  const auth = cachedAuth;

  const seasonsRes = await request.get(`${API_BASE}/seasons?club_id=${auth.club_id}&is_active=true`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  });
  expect(seasonsRes.ok()).toBeTruthy();
  let seasons = (await seasonsRes.json()) as Season[];
  if (!seasons.length) {
    const createSeason = await request.post(`${API_BASE}/seasons?club_id=${auth.club_id}`, {
      headers: { Authorization: `Bearer ${auth.token}` },
      data: {
        club_id: auth.club_id,
        name: `E2E Season ${Date.now()}`,
        format: 'DOUBLES',
        weekday: 4,
        start_time_local: '19:00',
        timezone: 'America/Los_Angeles',
        is_active: true,
      },
    });
    expect(createSeason.ok()).toBeTruthy();
    seasons = [await createSeason.json() as Season];
  }

  const seasonId = seasons[0].id;

  const courtsRes = await request.get(`${API_BASE}/courts?club_id=${auth.club_id}`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  });
  expect(courtsRes.ok()).toBeTruthy();
  const courts = (await courtsRes.json()) as Court[];
  expect(courts.length).toBeGreaterThan(0);

  const playersRes = await request.get(`${API_BASE}/players?club_id=${auth.club_id}&is_active=true&limit=20`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  });
  expect(playersRes.ok()).toBeTruthy();
  const players = (await playersRes.json()) as Player[];
  expect(players.length).toBeGreaterThanOrEqual(4);

  return { auth, seasonId, courtId: courts[0].id, playerIds: players.slice(0, 4).map((p) => p.id) };
}

export async function ensureOpenSession(request: APIRequestContext) {
  const { auth, seasonId } = await ensureAdminPrereqs(request);

  const sessionsRes = await request.get(`${API_BASE}/sessions?club_id=${auth.club_id}&season_id=${seasonId}`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  });
  expect(sessionsRes.ok()).toBeTruthy();
  const sessions = (await sessionsRes.json()) as Session[];

  let open = sessions.find((s) => s.status === 'OPEN');
  if (!open) {
    const start = new Date();
    start.setMinutes(0, 0, 0);
    const create = await request.post(`${API_BASE}/sessions?club_id=${auth.club_id}`, {
      headers: { Authorization: `Bearer ${auth.token}` },
      data: {
        season_id: seasonId,
        session_start_time: start.toISOString(),
        status: 'UPCOMING',
        location: `E2E OPEN ${Date.now()}`,
      },
    });
    expect(create.ok()).toBeTruthy();
    const created = await create.json() as Session;
    const openRes = await request.post(`${API_BASE}/sessions/${created.id}/open?club_id=${auth.club_id}`, {
      headers: { Authorization: `Bearer ${auth.token}` },
    });
    expect(openRes.ok()).toBeTruthy();
    open = { ...created, status: 'OPEN' };
  }

  return { auth, session: open };
}

export async function ensureFinalizedSessionWithGame(request: APIRequestContext) {
  const { auth, seasonId, courtId, playerIds } = await ensureAdminPrereqs(request);

  const sessionsRes = await request.get(`${API_BASE}/sessions?club_id=${auth.club_id}&season_id=${seasonId}`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  });
  expect(sessionsRes.ok()).toBeTruthy();
  const sessions = (await sessionsRes.json()) as Session[];
  let finalized = sessions.find((s) => s.status === 'FINALIZED');
  if (finalized) return { auth, session: finalized };

  const create = await request.post(`${API_BASE}/sessions?club_id=${auth.club_id}`, {
    headers: { Authorization: `Bearer ${auth.token}` },
    data: {
      season_id: seasonId,
      session_start_time: new Date(Date.now() - 86_400_000).toISOString(),
      status: 'UPCOMING',
      location: `E2E FINALIZE ${Date.now()}`,
    },
  });
  expect(create.ok()).toBeTruthy();
  const session = await create.json() as Session;
  const openRes = await request.post(`${API_BASE}/sessions/${session.id}/open?club_id=${auth.club_id}`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  });
  expect(openRes.ok()).toBeTruthy();

  const game = await request.post(`${API_BASE}/games?club_id=${auth.club_id}`, {
    headers: { Authorization: `Bearer ${auth.token}` },
    data: {
      session_id: session.id,
      court_id: courtId,
      start_time: new Date(Date.now() - 80_000_000).toISOString(),
      score_a: 21,
      score_b: 18,
    },
  });
  expect(game.ok()).toBeTruthy();
  const gameJson = await game.json() as { id: number };

  const parts = await request.put(`${API_BASE}/games/${gameJson.id}/participants?club_id=${auth.club_id}`, {
    headers: { Authorization: `Bearer ${auth.token}` },
    data: {
      participants: [
        { player_id: playerIds[0], side: 'A' },
        { player_id: playerIds[1], side: 'A' },
        { player_id: playerIds[2], side: 'B' },
        { player_id: playerIds[3], side: 'B' },
      ],
    },
  });
  expect(parts.ok()).toBeTruthy();

  const close = await request.post(`${API_BASE}/sessions/${session.id}/close?club_id=${auth.club_id}`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  });
  expect(close.ok()).toBeTruthy();

  const fin = await request.post(`${API_BASE}/sessions/${session.id}/finalize?club_id=${auth.club_id}`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  });
  expect(fin.ok()).toBeTruthy();

  return { auth, session: { ...session, status: 'FINALIZED' as const } };
}

export async function ensureOpenSessionWithGame(request: APIRequestContext) {
  const { auth, session } = await ensureOpenSession(request);
  const { courtId, playerIds } = await ensureAdminPrereqs(request);

  const gamesRes = await request.get(`${API_BASE}/games?club_id=${auth.club_id}&session_id=${session.id}`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  });
  expect(gamesRes.ok()).toBeTruthy();
  const games = (await gamesRes.json()) as Array<{ id: number }>;
  if (games.length) return { auth, session, gameId: games[0].id };

  const game = await request.post(`${API_BASE}/games?club_id=${auth.club_id}`, {
    headers: { Authorization: `Bearer ${auth.token}` },
    data: {
      session_id: session.id,
      court_id: courtId,
      start_time: new Date().toISOString(),
      score_a: 21,
      score_b: 18,
    },
  });
  expect(game.ok()).toBeTruthy();
  const g = await game.json() as { id: number };

  const parts = await request.put(`${API_BASE}/games/${g.id}/participants?club_id=${auth.club_id}`, {
    headers: { Authorization: `Bearer ${auth.token}` },
    data: {
      participants: [
        { player_id: playerIds[0], side: 'A' },
        { player_id: playerIds[1], side: 'A' },
        { player_id: playerIds[2], side: 'B' },
        { player_id: playerIds[3], side: 'B' },
      ],
    },
  });
  expect(parts.ok()).toBeTruthy();
  return { auth, session, gameId: g.id };
}

export async function gotoAdminHome(page: Page) {
  await page.goto('/admin');
  await page.waitForLoadState('domcontentloaded');
}
