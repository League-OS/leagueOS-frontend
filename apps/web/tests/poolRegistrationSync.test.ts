import test from 'node:test';
import assert from 'node:assert/strict';

import { defaultPoolConfig } from '../components/admin/tournaments/config.ts';
import { mergePoolPlayersWithRegistrations } from '../components/admin/tournaments/poolDraftMerge.ts';

test('mergePoolPlayersWithRegistrations adds active self-registered players to the pool', () => {
  const basePool = defaultPoolConfig();
  basePool.poolPlayers = [
    {
      playerId: '11',
      registeredAt: '2026-01-01',
      regRoute: 'ADMIN',
      seededElo: 1240,
      eloSeasonId: '1',
    },
  ];

  const registrations = [
    {
      id: 10,
      player_id: 11,
      player_name: 'Keep From Config',
      status: 'ACTIVE',
      registration_source: 'SELF',
      seeded_elo: 1300,
      elo_season_id: '2',
      registered_at: '2026-02-02',
    },
    {
      id: 11,
      player_id: 22,
      player_name: 'New Signup',
      status: 'ACTIVE',
      registration_source: 'SELF',
      seeded_elo: 900,
      elo_season_id: '3',
      registered_at: '2026-03-03',
    },
    {
      id: 12,
      player_id: 33,
      player_name: 'Withdrawn',
      status: 'WITHDRAWN',
      registration_source: 'SELF',
    },
  ];

  const nextPool = mergePoolPlayersWithRegistrations(basePool, registrations as never);
  assert.equal(nextPool.poolPlayers.length, 2);
  const first = nextPool.poolPlayers[0];
  assert.equal(first.playerId, '11');
  assert.equal(first.regRoute, 'ADMIN');
  assert.equal(first.seededElo, 1240);

  const second = nextPool.poolPlayers[1];
  assert.equal(second.playerId, '22');
  assert.equal(second.regRoute, 'SELF');
  assert.equal(second.seededElo, 900);
  assert.equal(second.eloSeasonId, '3');
  assert.equal(second.registeredAt, '2026-03-03');
});

test('mergePoolPlayersWithRegistrations fills missing seeded elo and season from active registrations', () => {
  const basePool = defaultPoolConfig();
  basePool.poolPlayers = [
    {
      playerId: '55',
      registeredAt: '',
      regRoute: 'ADMIN',
    },
  ];

  const registrations = [
    {
      id: 20,
      player_id: 55,
      player_name: 'Needs Metadata',
      status: 'ACTIVE',
      registration_source: 'SELF',
      seeded_elo: 1120,
      elo_season_id: '4',
      registered_at: '2026-04-04',
    },
  ];

  const nextPool = mergePoolPlayersWithRegistrations(basePool, registrations as never);
  const [nextEntry] = nextPool.poolPlayers;
  assert.equal(nextEntry.seededElo, 1120);
  assert.equal(nextEntry.eloSeasonId, '4');
  assert.equal(nextEntry.registeredAt, '2026-04-04');
});
