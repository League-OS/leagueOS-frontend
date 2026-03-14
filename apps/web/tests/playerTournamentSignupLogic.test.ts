import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findUserPlayerId,
  isPlayerTab,
  normalizeSelfSignupError,
  parseApiErrorDetail,
  signedFormatIdsFromRegistrations,
} from '../components/playerTournamentSignupLogic.ts';

test('findUserPlayerId prefers email match before display name fallback', () => {
  const profile = {
    email: 'playerone@leagueos.local',
    display_name: 'Player One',
    full_name: 'Player One Full',
  };
  const players = [
    { id: 11, email: 'other@leagueos.local', display_name: 'Player One' },
    { id: 42, email: 'playerone@leagueos.local', display_name: 'Mismatch Name' },
  ];

  assert.equal(findUserPlayerId(profile as never, players as never), 42);
});

test('findUserPlayerId falls back to display name or full name when email is absent', () => {
  const profile = {
    email: null,
    display_name: 'Rally Ace',
    full_name: 'Rally Ace Full',
  };
  const players = [
    { id: 7, email: null, display_name: 'Rally Ace' },
    { id: 8, email: null, display_name: 'Someone Else' },
  ];

  assert.equal(findUserPlayerId(profile as never, players as never), 7);
});

test('parseApiErrorDetail handles string, structured, and invalid payloads', () => {
  assert.deepEqual(parseApiErrorDetail({ detail: 'Plain failure' }, 'fallback'), {
    code: '',
    message: 'Plain failure',
  });

  assert.deepEqual(parseApiErrorDetail({ detail: { code: 'PLAYER_ALREADY_REGISTERED_IN_FORMAT', message: 'Already in pool' } }, 'fallback'), {
    code: 'PLAYER_ALREADY_REGISTERED_IN_FORMAT',
    message: 'Already in pool',
  });

  assert.deepEqual(parseApiErrorDetail(null as never, 'fallback'), {
    code: '',
    message: 'fallback',
  });
});

test('normalizeSelfSignupError rewrites the legacy manager-only permission response', () => {
  assert.deepEqual(
    normalizeSelfSignupError({ code: 'FORBIDDEN', message: 'Permission required: tournaments.manage' }),
    {
      code: 'FORBIDDEN',
      message: 'Player self-signup is supported, but the running API is out of date. Restart the API service and retry.',
    },
  );

  assert.deepEqual(
    normalizeSelfSignupError({ code: 'FORBIDDEN', message: 'Permission required: tournaments.read' }),
    {
      code: 'FORBIDDEN',
      message: 'Permission required: tournaments.read',
    },
  );
});

test('signedFormatIdsFromRegistrations marks only active registrations for the current player', () => {
  const result = signedFormatIdsFromRegistrations(12, {
    101: [
      { id: 1, player_id: 12, player_name: 'Player One', registration_source: 'SELF', status: 'ACTIVE', registered_at: null },
    ],
    102: [
      { id: 2, player_id: 12, player_name: 'Player One', registration_source: 'SELF', status: 'WITHDRAWN', registered_at: null },
    ],
    103: [
      { id: 3, player_id: 99, player_name: 'Other Player', registration_source: 'SELF', status: 'ACTIVE', registered_at: null },
    ],
  });

  assert.deepEqual(result, { 101: true });
});

test('isPlayerTab accepts inbox and rejects unknown values', () => {
  assert.equal(isPlayerTab('inbox'), true);
  assert.equal(isPlayerTab('profile'), true);
  assert.equal(isPlayerTab('alerts'), false);
  assert.equal(isPlayerTab(null), false);
});
