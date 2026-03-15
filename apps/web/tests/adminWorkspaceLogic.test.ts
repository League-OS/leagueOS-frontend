import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adminPageTitle,
  buildSeasonPlayerStats,
  buildSessionStatsById,
  buildAdminBreadcrumbs,
  countUniquePlayersInSessionGames,
  filterSeasonPlayerEntries,
  gameStatusDisplay,
  mergeAdminPlayers,
} from '../components/admin/adminWorkspaceLogic.ts';

test('mergeAdminPlayers merges active and inactive lists and de-duplicates by id', () => {
  const active = [
    { id: 2, display_name: 'Zara', is_active: true },
    { id: 1, display_name: 'Arun', is_active: true },
  ];
  const inactive = [
    { id: 1, display_name: 'Arun', is_active: false },
    { id: 3, display_name: 'Maya', is_active: false },
  ];

  const result = mergeAdminPlayers(active as never, inactive as never);
  assert.deepEqual(result.map((p) => p.id), [1, 3, 2]);
  assert.deepEqual(result.map((p) => p.display_name), ['Arun', 'Maya', 'Zara']);
});

test('adminPageTitle returns stable titles for all admin pages', () => {
  assert.equal(adminPageTitle('dashboard'), 'Admin Dashboard');
  assert.equal(adminPageTitle('clubs'), 'Clubs');
  assert.equal(adminPageTitle('players'), 'Club Players');
  assert.equal(adminPageTitle('courts'), 'Courts');
  assert.equal(adminPageTitle('seasons'), 'Seasons');
  assert.equal(adminPageTitle('sessions'), 'Sessions');
  assert.equal(adminPageTitle('seasonDetail'), 'Season Detail');
  assert.equal(adminPageTitle('sessionDetail'), 'Session Detail');
});

test('buildAdminBreadcrumbs builds detail and list breadcrumbs', () => {
  const seasons = [{ id: 7, name: 'Spring 2026' }];
  const sessions = [{ id: 11, location: 'Main Hall' }];

  const seasonCrumbs = buildAdminBreadcrumbs({
    page: 'seasonDetail',
    seasonId: 7,
    seasons: seasons as never,
    sessions: sessions as never,
  });
  assert.deepEqual(seasonCrumbs.map((c) => c.label), ['Admin', 'Seasons', 'Spring 2026']);

  const sessionCrumbs = buildAdminBreadcrumbs({
    page: 'sessionDetail',
    sessionId: 11,
    seasons: seasons as never,
    sessions: sessions as never,
  });
  assert.deepEqual(sessionCrumbs.map((c) => c.label), ['Admin', 'Sessions', 'Main Hall']);

  const listCrumbs = buildAdminBreadcrumbs({
    page: 'players',
    seasons: seasons as never,
    sessions: sessions as never,
  });
  assert.deepEqual(listCrumbs.map((c) => c.label), ['Admin', 'Club Players']);
});

test('countUniquePlayersInSessionGames counts unique players across matches', () => {
  const sessionGames = [{ id: 1 }, { id: 2 }];
  const participantsByGame = {
    1: [{ player_id: 10 }, { player_id: 11 }, { player_id: 12 }, { player_id: 13 }],
    2: [{ player_id: 10 }, { player_id: 14 }, { player_id: 15 }, { player_id: 13 }],
  };
  const count = countUniquePlayersInSessionGames(sessionGames as never, participantsByGame as never);
  assert.equal(count, 6);
});

test('gameStatusDisplay reflects API game.status for session match table', () => {
  assert.equal(gameStatusDisplay({ status: 'FINALIZED' }), 'FINALIZED');
  assert.equal(gameStatusDisplay({ status: 'CREATED' }), 'Created');
  assert.equal(gameStatusDisplay({}), 'Created');
  assert.equal(gameStatusDisplay({ status: undefined }), 'Created');
});

test('buildSeasonPlayerStats computes matches played and ELO fallback by season format', () => {
  const players = [
    { id: 10, elo_initial_doubles: 1010, elo_initial_singles: 990, elo_initial_mixed: 1005 },
    { id: 11, elo_initial_doubles: 980, elo_initial_singles: 1000, elo_initial_mixed: 975 },
  ];
  const sessions = [{ id: 1 }, { id: 2 }];
  const games = [
    { id: 100, session_id: 1 },
    { id: 101, session_id: 1 },
    { id: 102, session_id: 99 },
  ];
  const participantsByGame = {
    100: [{ player_id: 10 }, { player_id: 11 }, { player_id: 10 }],
    101: [{ player_id: 10 }],
    102: [{ player_id: 11 }],
  };
  const leaderboardRows = [
    { player_id: 10, matches_played: 3, global_elo_score: 1125 },
  ];

  const stats = buildSeasonPlayerStats({
    players: players as never,
    seasonFormat: 'DOUBLES',
    sessions: sessions as never,
    games: games as never,
    participantsByGame: participantsByGame as never,
    leaderboardRows: leaderboardRows as never,
  });

  assert.deepEqual(stats.get(10), { matchesPlayed: 2, eloScore: 1125 });
  assert.deepEqual(stats.get(11), { matchesPlayed: 1, eloScore: 980 });
});

test('buildSessionStatsById computes per-session match and unique player counts', () => {
  const sessions = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const games = [
    { id: 10, session_id: 1 },
    { id: 11, session_id: 1 },
    { id: 12, session_id: 2 },
    { id: 13, session_id: 99 },
  ];
  const participantsByGame = {
    10: [{ player_id: 7 }, { player_id: 8 }, { player_id: 9 }, { player_id: 10 }],
    11: [{ player_id: 7 }, { player_id: 11 }, { player_id: 12 }, { player_id: 10 }],
    12: [{ player_id: 5 }, { player_id: 6 }, { player_id: 6 }],
  };

  const stats = buildSessionStatsById({
    sessions: sessions as never,
    games: games as never,
    participantsByGame: participantsByGame as never,
  });

  assert.deepEqual(stats.get(1), { matches: 2, players: 6 });
  assert.deepEqual(stats.get(2), { matches: 1, players: 2 });
  assert.deepEqual(stats.get(3), { matches: 0, players: 0 });
});

test('filterSeasonPlayerEntries returns all or selected player row', () => {
  const entries = [
    { id: 1, displayName: 'A', matchesPlayed: 2, playerStatus: 'ROSTER', eloScore: 1002 },
    { id: 2, displayName: 'B', matchesPlayed: 0, playerStatus: 'DROP_IN', eloScore: 998 },
  ];

  assert.deepEqual(filterSeasonPlayerEntries(entries, ''), entries);
  assert.deepEqual(filterSeasonPlayerEntries(entries, 2), [entries[1]]);
  assert.deepEqual(filterSeasonPlayerEntries(entries, 99), []);
});
