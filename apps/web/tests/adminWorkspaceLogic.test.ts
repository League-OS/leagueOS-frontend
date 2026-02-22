import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adminPageTitle,
  buildAdminBreadcrumbs,
  countUniquePlayersInSessionGames,
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
