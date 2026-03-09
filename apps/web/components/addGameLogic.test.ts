import test from 'node:test';
import assert from 'node:assert/strict';
import {
  combineSessionDateAndTimeToIso,
  floorToFiveMinuteIncrement,
  listOpenSeasons,
  selectSingleOpenSession,
  validateAddGameInput,
  validateBadmintonEndScore,
} from './addGameLogic.ts';

test('listOpenSeasons only returns active seasons', () => {
  const seasons = [
    { id: 1, is_active: true },
    { id: 2, is_active: false },
    { id: 3, is_active: true },
  ] as const;

  const result = listOpenSeasons(seasons as never);
  assert.deepEqual(result.map((s) => s.id), [1, 3]);
});

test('selectSingleOpenSession auto-selects the only open session', () => {
  const sessions = [
    { id: 1, session_start_time: '2026-02-10T19:00:00Z', status: 'CLOSED' },
    { id: 2, session_start_time: '2026-02-17T19:00:00Z', status: 'OPEN' },
  ] as const;

  const result = selectSingleOpenSession(sessions as never);
  assert.equal(result.session?.id, 2);
  assert.equal(result.error, null);
});

test('selectSingleOpenSession fails when zero or multiple open sessions exist', () => {
  const noOpen = selectSingleOpenSession([{ id: 1, session_start_time: '2026-02-10T19:00:00Z', status: 'CLOSED' }] as never);
  assert.equal(noOpen.session, null);
  assert.match(noOpen.error ?? '', /No open session/i);

  const multipleOpen = selectSingleOpenSession(
    [
      { id: 1, session_start_time: '2026-02-10T19:00:00Z', status: 'OPEN' },
      { id: 2, session_start_time: '2026-02-17T19:00:00Z', status: 'OPEN' },
    ] as never,
  );
  assert.equal(multipleOpen.session, null);
  assert.match(multipleOpen.error ?? '', /Multiple open sessions/i);
});

test('floorToFiveMinuteIncrement rounds down to nearest 5 minutes', () => {
  assert.equal(floorToFiveMinuteIncrement('19:17'), '19:15');
  assert.equal(floorToFiveMinuteIncrement('07:00'), '07:00');
  assert.equal(floorToFiveMinuteIncrement('07:59'), '07:55');
});

test('combineSessionDateAndTimeToIso combines date with 5-minute normalized time', () => {
  const iso = combineSessionDateAndTimeToIso('2026-02-17', '19:19');
  assert.ok(iso);
  const value = new Date(iso as string);
  assert.equal(value.getUTCSeconds(), 0);
  assert.equal(value.getUTCMilliseconds(), 0);
  assert.equal(value.getMinutes() % 5, 0);
});

test('validateAddGameInput enforces required fields and uniqueness', () => {
  const validError = validateAddGameInput({
    courtId: 3,
    scoreA: 21,
    scoreB: 18,
    sideAPlayerIds: [1, 2],
    sideBPlayerIds: [3, 4],
    sessionId: 7,
    startTime: '19:00',
  });
  assert.equal(validError, null);

  const duplicatePlayers = validateAddGameInput({
    courtId: 3,
    scoreA: 21,
    scoreB: 18,
    sideAPlayerIds: [1, 2],
    sideBPlayerIds: [2, 4],
    sessionId: 7,
    startTime: '19:00',
  });
  assert.match(duplicatePlayers ?? '', /unique/i);

  const invalidDiff = validateAddGameInput({
    courtId: 3,
    scoreA: 22,
    scoreB: 21,
    sideAPlayerIds: [1, 2],
    sideBPlayerIds: [3, 4],
    sessionId: 7,
    startTime: '19:00',
  });
  assert.match(invalidDiff ?? '', /22-29|deuce|0-19/i);

  const overMax = validateAddGameInput({
    courtId: 3,
    scoreA: 31,
    scoreB: 29,
    sideAPlayerIds: [1, 2],
    sideBPlayerIds: [3, 4],
    sessionId: 7,
    startTime: '19:00',
  });
  assert.match(overMax ?? '', /Maximum score/i);
});

test('validateAddGameInput enforces valid badminton end-state score patterns', () => {
  const validTwentyOne = validateAddGameInput({
    courtId: 3,
    scoreA: 21,
    scoreB: 17,
    sideAPlayerIds: [1, 2],
    sideBPlayerIds: [3, 4],
    sessionId: 7,
    startTime: '19:00',
  });
  assert.equal(validTwentyOne, null);

  const validDeuce = validateAddGameInput({
    courtId: 3,
    scoreA: 22,
    scoreB: 20,
    sideAPlayerIds: [1, 2],
    sideBPlayerIds: [3, 4],
    sessionId: 7,
    startTime: '19:00',
  });
  assert.equal(validDeuce, null);

  const validCap = validateAddGameInput({
    courtId: 3,
    scoreA: 30,
    scoreB: 29,
    sideAPlayerIds: [1, 2],
    sideBPlayerIds: [3, 4],
    sessionId: 7,
    startTime: '19:00',
  });
  assert.equal(validCap, null);

  const invalidImpossible = validateAddGameInput({
    courtId: 3,
    scoreA: 22,
    scoreB: 17,
    sideAPlayerIds: [1, 2],
    sideBPlayerIds: [3, 4],
    sessionId: 7,
    startTime: '19:00',
  });
  assert.match(invalidImpossible ?? '', /22-29|deuce/i);

  const invalidThirty = validateAddGameInput({
    courtId: 3,
    scoreA: 30,
    scoreB: 27,
    sideAPlayerIds: [1, 2],
    sideBPlayerIds: [3, 4],
    sessionId: 7,
    startTime: '19:00',
  });
  assert.match(invalidThirty ?? '', /30-29/i);

  const invalidTwentyOneWithTwenty = validateAddGameInput({
    courtId: 3,
    scoreA: 21,
    scoreB: 20,
    sideAPlayerIds: [1, 2],
    sideBPlayerIds: [3, 4],
    sessionId: 7,
    startTime: '19:00',
  });
  assert.match(invalidTwentyOneWithTwenty ?? '', /0-19/i);
});

test('validateBadmintonEndScore enforces terminal badminton score rules', () => {
  assert.equal(validateBadmintonEndScore(21, 0), null);
  assert.equal(validateBadmintonEndScore(22, 20), null);
  assert.equal(validateBadmintonEndScore(30, 29), null);

  assert.match(validateBadmintonEndScore(21, 20) ?? '', /0-19/i);
  assert.match(validateBadmintonEndScore(30, 28) ?? '', /30-29/i);
  assert.match(validateBadmintonEndScore(20, 18) ?? '', /at least 21/i);
  assert.match(validateBadmintonEndScore(25, 24) ?? '', /2-point/i);
  assert.match(validateBadmintonEndScore(19, 19) ?? '', /Draw is not allowed/i);
});
