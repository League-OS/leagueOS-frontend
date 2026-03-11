import { ApiError } from '@leagueos/api';

type SequentialFinalizeDetails = {
  game_id?: number;
  game_index?: number;
  start_time?: string | null;
  failed_check?: string;
  expected?: unknown;
  actual?: unknown;
  expected_statuses?: string[];
  actual_status?: string;
};

function formatFailedCheckLabel(failedCheck?: string): string {
  if (!failedCheck) return 'unknown_validation';
  switch (failedCheck) {
    case 'participant_count_singles':
      return 'singles participant count';
    case 'participant_count_doubles':
      return 'doubles participant count';
    case 'invalid_game_status':
      return 'game status';
    default:
      return failedCheck;
  }
}

function toObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function formatSequentialFinalizeBlockedError(error: ApiError): string {
  const detailObj = toObject(error.detail);
  const nested = detailObj ? toObject(detailObj.details) : null;
  const details: SequentialFinalizeDetails = nested ?? {};

  const gameId = details.game_id;
  const gameIndex = details.game_index;
  const startTime = details.start_time;
  const failedCheck = formatFailedCheckLabel(details.failed_check);
  const expected = details.expected;
  const actual = details.actual;
  const expectedStatuses = details.expected_statuses;
  const actualStatus = details.actual_status;

  const prefixParts: string[] = [];
  if (typeof gameIndex === 'number') prefixParts.push(`Game #${gameIndex}`);
  if (typeof gameId === 'number') prefixParts.push(`ID ${gameId}`);
  if (typeof startTime === 'string' && startTime.trim()) prefixParts.push(startTime);
  const prefix = prefixParts.length ? `${prefixParts.join(' · ')}: ` : '';

  if (failedCheck === 'game status' && Array.isArray(expectedStatuses)) {
    return `${prefix}Cannot finalize because status validation failed (${failedCheck}). Expected ${expectedStatuses.join(
      ' or ',
    )}, got ${actualStatus ?? 'unknown'}.`;
  }

  if (expected !== undefined || actual !== undefined) {
    return `${prefix}Cannot finalize because validation failed (${failedCheck}). Expected ${JSON.stringify(
      expected ?? {},
    )}, got ${JSON.stringify(actual ?? {})}.`;
  }

  return `${prefix}Cannot finalize because validation failed (${failedCheck}).`;
}

