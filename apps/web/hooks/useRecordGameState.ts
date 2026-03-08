import { useState } from 'react';
import type { Court, Player, Season, Session } from '@leagueos/schemas';
import { DEFAULT_CLUB_ID } from '@leagueos/config';
import type { HomeGameRow } from '../components/LeaderboardView';

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------

export type RecordGameState = {
  /** Club the "Add Game" context is scoped to (may differ from the viewer's selected club). */
  clubId: number;
  /** Season selected in the "Add Game" context. */
  seasonId: number | null;
  /** Active open session for the selected record season. */
  session: Session | null;
  /** Open seasons available for recording (derived from all seasons). */
  seasons: Season[];
  /** Active players for the record club (used in player-picker). */
  players: Player[];
  /** Active courts for the record club (used in court-picker). */
  courts: Court[];
  /** Human-readable error when no valid session can be resolved for recording. */
  contextError: string | null;
  /** All existing games for the record session, used for conflict-checking. */
  existingGames: HomeGameRow[];
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

function initialState(defaultClubId: number): RecordGameState {
  return {
    clubId: defaultClubId,
    seasonId: null,
    session: null,
    seasons: [],
    players: [],
    courts: [],
    contextError: null,
    existingGames: [],
  };
}

/**
 * Manages all state for the "Add Game" / record-game context.
 *
 * Extracted from `page.tsx` to eliminate the six pairs of duplicated
 * `record*` / `selected*` state variables and keep the parent component lean.
 *
 * Usage:
 *   const { record, updateRecord, resetRecord } = useRecordGameState();
 */
export function useRecordGameState(defaultClubId: number = DEFAULT_CLUB_ID) {
  const [state, setState] = useState<RecordGameState>(() => initialState(defaultClubId));

  function update(patch: Partial<RecordGameState>): void {
    setState((prev) => ({ ...prev, ...patch }));
  }

  function reset(): void {
    setState(initialState(defaultClubId));
  }

  return {
    /** Current record-game context state. */
    record: state,
    /** Merge a partial patch into the record state (replaces named fields only). */
    updateRecord: update,
    /** Reset all record state back to initial values. */
    resetRecord: reset,
  };
}
