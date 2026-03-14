'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

import styles from './CourtsideMobileOperatorView.module.css';
import {
  API_BASE,
  LIVE_STATUSES,
  UPCOMING_STATUSES,
  featuredMatches,
  formatClock,
  formatTournamentDate,
  matchMoment,
  matchStatusLabel,
  scoreValue,
  stageLabel,
  useTournamentPublicPayload,
  type DecoratedMatch,
} from './publicTournamentViews';

type AdminAuth = { token: string; clubId: number };
type OperatorState = {
  leftSide: 'home' | 'away';
  serverSide: 'home' | 'away';
  scoreHome: number;
  scoreAway: number;
  completedSets: Array<{ home: number; away: number }>;
  rallies: string[];
  notes: string[];
  startedAt: number;
  paused: boolean;
  rowVersion: number;
  matchStatus: string;
};

type MatchStatusResponse = {
  id: number;
  status: string;
  row_version: number;
  score_json?: Record<string, unknown>;
};

type MatchCourtResponse = {
  id: number;
  court_id: number | null;
  court_name: string | null;
  row_version: number;
};

type CourtOverride = {
  matchId: number;
  courtId: number | null;
  courtName: string | null;
  rowVersion: number;
};

const STORAGE_KEY_PREFIX = 'leagueos.tournament.operator.v1';

function readAdminAuth(): AdminAuth | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem('leagueos.admin.auth');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { token?: unknown; clubId?: unknown };
    const token = typeof parsed.token === 'string' ? parsed.token : '';
    const clubId = typeof parsed.clubId === 'number'
      ? parsed.clubId
      : typeof parsed.clubId === 'string'
        ? Number.parseInt(parsed.clubId, 10)
        : Number.NaN;
    if (!token || !Number.isInteger(clubId)) return null;
    return { token, clubId };
  } catch {
    return null;
  }
}

function localKey(matchId: number): string {
  return `${STORAGE_KEY_PREFIX}.${matchId}`;
}

function initialOperatorState(match: DecoratedMatch): OperatorState {
  const scoreHome = scoreValue(match.match.score_json?.score_a) ?? 0;
  const scoreAway = scoreValue(match.match.score_json?.score_b) ?? 0;
  return {
    leftSide: 'home',
    serverSide: 'home',
    scoreHome,
    scoreAway,
    completedSets: [],
    rallies: [`${scoreHome}-${scoreAway}`],
    notes: ['Operator console ready.'],
    startedAt: Date.now(),
    paused: false,
    rowVersion: match.match.row_version,
    matchStatus: match.match.status,
  };
}

function loadOperatorState(match: DecoratedMatch): OperatorState {
  if (typeof window === 'undefined') return initialOperatorState(match);
  const fallback = initialOperatorState(match);
  try {
    const raw = window.localStorage.getItem(localKey(match.match.id));
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<OperatorState>;
    return {
      ...fallback,
      ...parsed,
      completedSets: Array.isArray(parsed.completedSets) ? parsed.completedSets : fallback.completedSets,
      rallies: Array.isArray(parsed.rallies) && parsed.rallies.length ? parsed.rallies : fallback.rallies,
      notes: Array.isArray(parsed.notes) && parsed.notes.length ? parsed.notes : fallback.notes,
      rowVersion: Math.max(fallback.rowVersion, Number(parsed.rowVersion ?? fallback.rowVersion)),
      matchStatus: typeof parsed.matchStatus === 'string' ? parsed.matchStatus : fallback.matchStatus,
      scoreHome: Number.isFinite(Number(parsed.scoreHome)) ? Number(parsed.scoreHome) : fallback.scoreHome,
      scoreAway: Number.isFinite(Number(parsed.scoreAway)) ? Number(parsed.scoreAway) : fallback.scoreAway,
      serverSide: parsed.serverSide === 'away' ? 'away' : fallback.serverSide,
      leftSide: parsed.leftSide === 'away' ? 'away' : fallback.leftSide,
    };
  } catch {
    return fallback;
  }
}

async function patchMatchStatus(
  auth: AdminAuth,
  matchId: number,
  payload: {
    status: string;
    expected_row_version: number;
    score_json?: { score_a: number; score_b: number };
    reason_code?: string;
  },
): Promise<MatchStatusResponse> {
  const response = await fetch(`${API_BASE}/tournaments/matches/${matchId}/status?club_id=${auth.clubId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth.token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    let message = `Unable to update match (HTTP ${response.status}).`;
    try {
      const body = await response.json() as { detail?: { message?: string } | string };
      if (typeof body.detail === 'string') message = body.detail;
      if (body.detail && typeof body.detail === 'object' && typeof body.detail.message === 'string') {
        message = body.detail.message;
      }
    } catch {
      // keep fallback
    }
    throw new Error(message);
  }
  return (await response.json()) as MatchStatusResponse;
}

async function patchMatchCourt(
  auth: AdminAuth,
  matchId: number,
  payload: { court_id: number; expected_row_version: number },
): Promise<MatchCourtResponse> {
  const response = await fetch(`${API_BASE}/tournaments/matches/${matchId}/court?club_id=${auth.clubId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${auth.token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    let message = `Unable to update court (HTTP ${response.status}).`;
    try {
      const body = await response.json() as { detail?: { message?: string } | string };
      if (typeof body.detail === 'string') message = body.detail;
      if (body.detail && typeof body.detail === 'object' && typeof body.detail.message === 'string') {
        message = body.detail.message;
      }
    } catch {
      // keep fallback
    }
    throw new Error(message);
  }
  return (await response.json()) as MatchCourtResponse;
}

function computeSets(state: OperatorState): { home: number; away: number } {
  return state.completedSets.reduce(
    (acc, set) => {
      if (set.home > set.away) acc.home += 1;
      if (set.away > set.home) acc.away += 1;
      return acc;
    },
    { home: 0, away: 0 },
  );
}

function deriveServerSide(rallies: string[], fallback: 'home' | 'away'): 'home' | 'away' {
  if (rallies.length <= 1) return fallback;
  const previous = rallies[rallies.length - 2]?.split('-').map((value) => Number(value)) ?? [];
  const next = rallies[rallies.length - 1]?.split('-').map((value) => Number(value)) ?? [];
  if ((next[0] ?? 0) > (previous[0] ?? 0)) return 'home';
  if ((next[1] ?? 0) > (previous[1] ?? 0)) return 'away';
  return fallback;
}

function evaluateSetWinner(entry: DecoratedMatch, scoreHome: number, scoreAway: number): 'home' | 'away' | null {
  const pointsToWin = entry.match.points_to_win_set ?? 21;
  const winByTwo = Boolean(entry.match.win_by_two);
  const setCap = entry.match.set_cap ?? null;
  const margin = scoreHome - scoreAway;
  if (setCap && (scoreHome >= setCap || scoreAway >= setCap)) {
    if (scoreHome === scoreAway) return null;
    return scoreHome > scoreAway ? 'home' : 'away';
  }
  if (winByTwo) {
    if (scoreHome >= pointsToWin && margin >= 2) return 'home';
    if (scoreAway >= pointsToWin && margin <= -2) return 'away';
    return null;
  }
  if (scoreHome >= pointsToWin && scoreHome > scoreAway) return 'home';
  if (scoreAway >= pointsToWin && scoreAway > scoreHome) return 'away';
  return null;
}

function stageIdentity(entry: DecoratedMatch): string {
  return [
    entry.format.id,
    entry.match.stage_code,
    entry.match.group_code ?? '',
    entry.match.round_number ?? '',
  ].join(':');
}

function displayCourtName(entry: DecoratedMatch | null, override: CourtOverride | null): string {
  if (!entry) return 'Court TBD';
  if (override && override.matchId === entry.match.id && override.courtId) {
    return override.courtName || `Court ${override.courtId}`;
  }
  return entry.match.court_name || `Court ${entry.match.court_id ?? 'TBD'}`;
}

function currentCourtId(entry: DecoratedMatch | null, override: CourtOverride | null): number | null {
  if (!entry) return null;
  if (override && override.matchId === entry.match.id) return override.courtId;
  return entry.match.court_id;
}

function setWinConditionLabel(entry: DecoratedMatch | null): string {
  if (!entry) return 'Set rule unavailable';
  const pointsToWin = entry.match.points_to_win_set ?? 21;
  if (!entry.match.win_by_two) return `First to ${pointsToWin}`;
  const cap = entry.match.set_cap ?? pointsToWin;
  return `Win by 2 (cap ${cap})`;
}

function matchWinConditionLabel(entry: DecoratedMatch | null): string {
  if (!entry) return 'Match rule unavailable';
  const bestOf = entry.match.best_of_sets ?? ((entry.match.sets_to_win ?? 1) * 2) - 1;
  return `Best of ${bestOf}`;
}

function lifecycleActionLabel(status: string | undefined): string {
  if (status === 'IN_PROGRESS') return 'Complete match';
  if (status === 'DISPUTED') return 'Finalize dispute';
  return 'Mark disputed';
}

function ShuttleIcon({ active }: { active: boolean }) {
  return (
    <span className={active ? `${styles.serviceIconWrap} ${styles.serviceActive}` : styles.serviceIconWrap} aria-hidden="true">
      <Image
        src="/tournaments/shuttlecock.png"
        alt=""
        width={22}
        height={22}
        className={styles.serviceIcon}
      />
    </span>
  );
}

export function CourtsideMobileOperatorView() {
  const params = useParams<{ tournamentId: string }>();
  const searchParams = useSearchParams();
  const tournamentId = Number.parseInt(params?.tournamentId ?? '', 10);
  const requestedMatchId = Number.parseInt(searchParams.get('matchId') ?? '', 10);
  const [auth, setAuth] = useState<AdminAuth | null>(null);
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(Number.isInteger(requestedMatchId) ? requestedMatchId : null);
  const { payload, loading, error } = useTournamentPublicPayload(tournamentId, selectedMatchId ? null : 10000);
  const [operatorState, setOperatorState] = useState<OperatorState | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [courtDraftId, setCourtDraftId] = useState('');
  const [courtOverride, setCourtOverride] = useState<CourtOverride | null>(null);

  useEffect(() => {
    setAuth(readAdminAuth());
  }, []);

  const decorated = useMemo(() => (payload ? featuredMatches(payload.formats) : []), [payload]);
  const liveMatches = useMemo(() => decorated.filter((entry) => LIVE_STATUSES.has(entry.match.status)), [decorated]);
  const scheduledMatches = useMemo(() => decorated.filter((entry) => UPCOMING_STATUSES.has(entry.match.status)), [decorated]);
  const stageSeed = liveMatches[0] ?? [...scheduledMatches].sort((left, right) => matchMoment(left.match) - matchMoment(right.match))[0] ?? null;
  const currentStageKey = stageSeed ? stageIdentity(stageSeed) : null;
  const stageScheduledMatches = useMemo(
    () => scheduledMatches
      .filter((entry) => !currentStageKey || stageIdentity(entry) === currentStageKey)
      .sort((left, right) => {
        const leftCourt = (left.match.court_name || `Court ${left.match.court_id ?? 9999}`).toLowerCase();
        const rightCourt = (right.match.court_name || `Court ${right.match.court_id ?? 9999}`).toLowerCase();
        if (leftCourt !== rightCourt) return leftCourt.localeCompare(rightCourt, undefined, { numeric: true });
        const leftMoment = matchMoment(left.match);
        const rightMoment = matchMoment(right.match);
        if (leftMoment !== rightMoment) return leftMoment - rightMoment;
        return left.match.match_number - right.match.match_number;
      }),
    [scheduledMatches, currentStageKey],
  );
  const stageLiveMatches = useMemo(
    () => liveMatches
      .filter((entry) => !currentStageKey || stageIdentity(entry) === currentStageKey)
      .sort((left, right) => {
        const leftCourt = (left.match.court_name || `Court ${left.match.court_id ?? 9999}`).toLowerCase();
        const rightCourt = (right.match.court_name || `Court ${right.match.court_id ?? 9999}`).toLowerCase();
        if (leftCourt !== rightCourt) return leftCourt.localeCompare(rightCourt, undefined, { numeric: true });
        const leftMoment = matchMoment(left.match);
        const rightMoment = matchMoment(right.match);
        if (leftMoment !== rightMoment) return leftMoment - rightMoment;
        return left.match.match_number - right.match.match_number;
      }),
    [liveMatches, currentStageKey],
  );

  const activeMatch = useMemo(
    () => decorated.find((entry) => entry.match.id === selectedMatchId) ?? null,
    [decorated, selectedMatchId],
  );

  useEffect(() => {
    if (selectedMatchId && !decorated.some((entry) => entry.match.id === selectedMatchId)) {
      setSelectedMatchId(null);
    }
  }, [decorated, selectedMatchId]);

  useEffect(() => {
    if (!activeMatch) {
      setOperatorState(null);
      setCourtDraftId('');
      return;
    }
    setOperatorState(loadOperatorState(activeMatch));
    setCourtDraftId(String(currentCourtId(activeMatch, courtOverride) ?? ''));
  }, [activeMatch?.match.id]);

  useEffect(() => {
    if (!activeMatch || !operatorState || typeof window === 'undefined') return;
    window.localStorage.setItem(localKey(activeMatch.match.id), JSON.stringify(operatorState));
  }, [activeMatch, operatorState]);

  useEffect(() => {
    if (!operatorState) {
      setElapsedMs(0);
      return;
    }
    setElapsedMs(Date.now() - operatorState.startedAt);
    const timer = window.setInterval(() => {
      setElapsedMs(Date.now() - operatorState.startedAt);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [operatorState?.startedAt]);

  useEffect(() => {
    if (!activeMatch || !operatorState) return;
    if (activeMatch.match.row_version <= operatorState.rowVersion) return;
    setOperatorState((prev) => {
      if (!prev) return loadOperatorState(activeMatch);
      return {
        ...prev,
        scoreHome: scoreValue(activeMatch.match.score_json?.score_a) ?? prev.scoreHome,
        scoreAway: scoreValue(activeMatch.match.score_json?.score_b) ?? prev.scoreAway,
        rowVersion: activeMatch.match.row_version,
        matchStatus: activeMatch.match.status,
      };
    });
    if (courtOverride && courtOverride.matchId === activeMatch.match.id && activeMatch.match.row_version >= courtOverride.rowVersion) {
      setCourtOverride(null);
    }
  }, [activeMatch?.match.row_version, activeMatch?.match.status, activeMatch?.match.score_json]);

  useEffect(() => {
    if (!activeMatch) return;
    setCourtDraftId(String(currentCourtId(activeMatch, courtOverride) ?? ''));
  }, [activeMatch?.match.court_id, activeMatch?.match.id, courtOverride?.courtId]);

  const setSummary = operatorState ? computeSets(operatorState) : { home: 0, away: 0 };
  const leftIsHome = operatorState?.leftSide !== 'away';
  const leftLabel = activeMatch ? (leftIsHome ? activeMatch.homeLabel : activeMatch.awayLabel) : 'Left';
  const rightLabel = activeMatch ? (leftIsHome ? activeMatch.awayLabel : activeMatch.homeLabel) : 'Right';
  const leftScore = operatorState ? (leftIsHome ? operatorState.scoreHome : operatorState.scoreAway) : 0;
  const rightScore = operatorState ? (leftIsHome ? operatorState.scoreAway : operatorState.scoreHome) : 0;
  const leftSets = operatorState ? (leftIsHome ? setSummary.home : setSummary.away) : 0;
  const rightSets = operatorState ? (leftIsHome ? setSummary.away : setSummary.home) : 0;
  const effectiveCourtId = currentCourtId(activeMatch, courtOverride);
  const effectiveCourtName = displayCourtName(activeMatch, courtOverride);
  const scoringStatus = operatorState?.paused ? 'Paused' : matchStatusLabel(operatorState?.matchStatus ?? 'SCHEDULED');
  const courtChanged = Boolean(activeMatch) && courtDraftId !== String(effectiveCourtId ?? '');
  const courtReassignmentLocked = operatorState?.matchStatus !== 'SCHEDULED';
  const scoringLocked = !auth || !operatorState || operatorState.matchStatus !== 'IN_PROGRESS' || operatorState.paused;
  const primaryControlLabel = operatorState?.matchStatus === 'SCHEDULED'
    ? 'Start match'
    : operatorState?.paused
      ? 'Resume'
      : 'Pause';
  const liveClock = payload ? formatClock(payload.tournament.timezone) : '';

  async function persistScore(next: {
    scoreHome: number;
    scoreAway: number;
    status: string;
    note: string;
    completedSets?: OperatorState['completedSets'];
    paused?: boolean;
    serverSide?: 'home' | 'away';
    reason_code?: string;
  }) {
    if (!activeMatch || !operatorState) return;
    if (!auth) {
      setMessage('Admin authentication is required on this device.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const response = await patchMatchStatus(auth, activeMatch.match.id, {
        status: next.status,
        expected_row_version: operatorState.rowVersion,
        score_json: { score_a: next.scoreHome, score_b: next.scoreAway },
        reason_code: next.reason_code,
      });
      setOperatorState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          scoreHome: next.scoreHome,
          scoreAway: next.scoreAway,
          completedSets: next.completedSets ?? prev.completedSets,
          paused: next.paused ?? prev.paused,
          serverSide: next.serverSide ?? prev.serverSide,
          matchStatus: response.status,
          rowVersion: response.row_version,
          notes: [`${new Date().toLocaleTimeString()} ${next.note}`, ...prev.notes].slice(0, 12),
        };
      });
    } catch (updateError) {
      setMessage(updateError instanceof Error ? updateError.message : 'Unable to update match.');
    } finally {
      setBusy(false);
    }
  }

  async function updateCourtAssignment() {
    if (!activeMatch || !operatorState) return;
    if (!auth) {
      setMessage('Admin authentication is required on this device.');
      return;
    }
    if (operatorState.matchStatus !== 'SCHEDULED') {
      setMessage('Court reassignment is only available before the match starts.');
      return;
    }
    const nextCourtId = Number.parseInt(courtDraftId, 10);
    if (!Number.isInteger(nextCourtId) || nextCourtId <= 0) {
      setMessage('Select a valid active court.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const response = await patchMatchCourt(auth, activeMatch.match.id, {
        court_id: nextCourtId,
        expected_row_version: operatorState.rowVersion,
      });
      const nextCourtName = payload?.courts.find((court) => court.id === response.court_id)?.name ?? response.court_name;
      setCourtOverride({
        matchId: activeMatch.match.id,
        courtId: response.court_id,
        courtName: nextCourtName ?? null,
        rowVersion: response.row_version,
      });
      setOperatorState((prev) => prev ? {
        ...prev,
        rowVersion: response.row_version,
        notes: [`${new Date().toLocaleTimeString()} Court reassigned to ${nextCourtName || `Court ${response.court_id}`}.`, ...prev.notes].slice(0, 12),
      } : prev);
    } catch (updateError) {
      setMessage(updateError instanceof Error ? updateError.message : 'Unable to update court.');
    } finally {
      setBusy(false);
    }
  }

  async function scorePoint(side: 'left' | 'right') {
    if (!activeMatch || !operatorState) return;
    if (operatorState.matchStatus !== 'IN_PROGRESS' || operatorState.paused) {
      setMessage(operatorState.matchStatus === 'SCHEDULED' ? 'Start the match before scoring.' : 'Resume the match before scoring.');
      return;
    }
    const actualSide: 'home' | 'away' = side === 'left'
      ? (leftIsHome ? 'home' : 'away')
      : (leftIsHome ? 'away' : 'home');
    const nextHome = operatorState.scoreHome + (actualSide === 'home' ? 1 : 0);
    const nextAway = operatorState.scoreAway + (actualSide === 'away' ? 1 : 0);
    const nextRallies = [...operatorState.rallies, `${nextHome}-${nextAway}`].slice(-60);
    const nextServerSide = actualSide;
    const setWinner = evaluateSetWinner(activeMatch, nextHome, nextAway);
    const setsToWin = activeMatch.match.sets_to_win ?? 1;
    const nextCompletedSets = setWinner
      ? [...operatorState.completedSets, { home: nextHome, away: nextAway }]
      : operatorState.completedSets;
    const nextSetSummary = nextCompletedSets.reduce(
      (acc, set) => {
        if (set.home > set.away) acc.home += 1;
        if (set.away > set.home) acc.away += 1;
        return acc;
      },
      { home: 0, away: 0 },
    );

    if (setWinner && ((setWinner === 'home' ? nextSetSummary.home : nextSetSummary.away) >= setsToWin)) {
      await persistScore({
        scoreHome: nextHome,
        scoreAway: nextAway,
        status: 'COMPLETED',
        note: `${setWinner === 'home' ? activeMatch.homeLabel : activeMatch.awayLabel} closed the match.`,
        completedSets: nextCompletedSets,
        serverSide: nextServerSide,
      });
      setOperatorState((prev) => prev ? {
        ...prev,
        rallies: nextRallies,
        completedSets: nextCompletedSets,
        serverSide: nextServerSide,
      } : prev);
      return;
    }

    if (setWinner) {
      await persistScore({
        scoreHome: 0,
        scoreAway: 0,
        status: operatorState.matchStatus,
        note: `${setWinner === 'home' ? activeMatch.homeLabel : activeMatch.awayLabel} won the set.`,
        completedSets: nextCompletedSets,
        serverSide: nextServerSide,
      });
      setOperatorState((prev) => prev ? {
        ...prev,
        rallies: ['0-0'],
        completedSets: nextCompletedSets,
        serverSide: nextServerSide,
      } : prev);
      return;
    }

    await persistScore({
      scoreHome: nextHome,
      scoreAway: nextAway,
      status: operatorState.matchStatus,
      note: `${actualSide === 'home' ? activeMatch.homeLabel : activeMatch.awayLabel} won the rally.`,
      serverSide: nextServerSide,
    });
    setOperatorState((prev) => prev ? {
      ...prev,
      rallies: nextRallies,
      serverSide: nextServerSide,
    } : prev);
  }

  async function undoPoint() {
    if (!operatorState || !activeMatch || operatorState.rallies.length <= 1) return;
    if (operatorState.matchStatus !== 'IN_PROGRESS' || operatorState.paused) {
      setMessage('Resume the match before editing the rally feed.');
      return;
    }
    const nextRallies = operatorState.rallies.slice(0, -1);
    const [home, away] = nextRallies[nextRallies.length - 1].split('-').map((value) => Number(value));
    const nextServerSide = deriveServerSide(nextRallies, operatorState.serverSide);
    await persistScore({
      scoreHome: home,
      scoreAway: away,
      status: operatorState.matchStatus,
      note: 'Last rally was removed.',
      serverSide: nextServerSide,
    });
    setOperatorState((prev) => prev ? { ...prev, rallies: nextRallies, serverSide: nextServerSide } : prev);
  }

  async function manualSet(side: 'left' | 'right') {
    if (!operatorState || !activeMatch) return;
    if (operatorState.matchStatus !== 'IN_PROGRESS' || operatorState.paused) {
      setMessage('Resume the match before changing the score.');
      return;
    }
    const label = side === 'left' ? leftLabel : rightLabel;
    const currentValue = side === 'left' ? leftScore : rightScore;
    const value = Number(window.prompt(`Set exact score for ${label}`, String(currentValue)));
    if (!Number.isFinite(value) || value < 0) return;
    const actualSide: 'home' | 'away' = side === 'left'
      ? (leftIsHome ? 'home' : 'away')
      : (leftIsHome ? 'away' : 'home');
    const nextHome = actualSide === 'home' ? value : operatorState.scoreHome;
    const nextAway = actualSide === 'away' ? value : operatorState.scoreAway;
    await persistScore({
      scoreHome: nextHome,
      scoreAway: nextAway,
      status: operatorState.matchStatus,
      note: `${label} score was adjusted manually.`,
    });
    setOperatorState((prev) => prev ? { ...prev, rallies: [...prev.rallies, `${nextHome}-${nextAway}`].slice(-60) } : prev);
  }

  async function markForfeit(side: 'left' | 'right') {
    if (!activeMatch) return;
    const forfeitingHome = side === 'left' ? leftIsHome : !leftIsHome;
    const pointsToWin = activeMatch.match.points_to_win_set ?? 21;
    await persistScore({
      scoreHome: forfeitingHome ? 0 : pointsToWin,
      scoreAway: forfeitingHome ? pointsToWin : 0,
      status: 'FORFEIT',
      note: `${forfeitingHome ? activeMatch.homeLabel : activeMatch.awayLabel} forfeited.`,
      reason_code: 'OPERATOR_FORFEIT',
    });
  }

  async function completeCurrentSet() {
    if (!operatorState || !activeMatch) return;
    if (operatorState.matchStatus !== 'IN_PROGRESS' || operatorState.paused) {
      setMessage('Resume the match before completing the current set.');
      return;
    }
    if (operatorState.scoreHome === operatorState.scoreAway) {
      setMessage('Current set is tied. Enter an exact score or continue scoring.');
      return;
    }
    const winner = operatorState.scoreHome > operatorState.scoreAway ? 'home' : 'away';
    const completedSets = [...operatorState.completedSets, { home: operatorState.scoreHome, away: operatorState.scoreAway }];
    const summary = computeSets({ ...operatorState, completedSets });
    const setsToWin = activeMatch.match.sets_to_win ?? 1;
    if ((winner === 'home' ? summary.home : summary.away) >= setsToWin) {
      await persistScore({
        scoreHome: operatorState.scoreHome,
        scoreAway: operatorState.scoreAway,
        status: 'COMPLETED',
        note: `${winner === 'home' ? activeMatch.homeLabel : activeMatch.awayLabel} completed the match.`,
        completedSets,
      });
      return;
    }
    await persistScore({
      scoreHome: 0,
      scoreAway: 0,
      status: 'IN_PROGRESS',
      note: `${winner === 'home' ? activeMatch.homeLabel : activeMatch.awayLabel} completed the set.`,
      completedSets,
    });
    setOperatorState((prev) => prev ? { ...prev, rallies: ['0-0'], completedSets } : prev);
  }

  async function setLifecycleStatus(status: string, note: string, reason_code?: string) {
    if (!operatorState) return;
    await persistScore({
      scoreHome: operatorState.scoreHome,
      scoreAway: operatorState.scoreAway,
      status,
      note,
      reason_code,
    });
  }

  async function handlePrimaryControl() {
    if (!operatorState) return;
    if (operatorState.matchStatus === 'SCHEDULED') {
      await setLifecycleStatus('IN_PROGRESS', 'Match started.', 'OPERATOR_START');
      return;
    }
    setOperatorState((prev) => prev ? {
      ...prev,
      paused: !prev.paused,
      notes: [`${new Date().toLocaleTimeString()} ${prev.paused ? 'Match resumed.' : 'Match paused.'}`, ...prev.notes].slice(0, 12),
    } : prev);
  }

  async function toggleLifecycle() {
    if (!operatorState || !activeMatch) return;
    if (operatorState.matchStatus === 'SCHEDULED') {
      await setLifecycleStatus('IN_PROGRESS', 'Match started.', 'OPERATOR_START');
      return;
    }
    if (operatorState.matchStatus === 'IN_PROGRESS') {
      if (operatorState.scoreHome === operatorState.scoreAway) {
        setMessage('Scores cannot be tied when completing a match.');
        return;
      }
      await setLifecycleStatus('COMPLETED', 'Match completed.', 'OPERATOR_COMPLETE');
      return;
    }
    if (operatorState.matchStatus === 'DISPUTED') {
      await setLifecycleStatus('FINALIZED', 'Dispute finalized.', 'OPERATOR_FINALIZE');
      return;
    }
    await setLifecycleStatus('DISPUTED', 'Match moved to disputed.', 'OPERATOR_DISPUTE');
  }

  if (loading) {
    return <main className={styles.page}><div className={styles.shell}><section className={styles.card}>Loading operator console.</section></div></main>;
  }

  if (error || !payload) {
    return <main className={styles.page}><div className={styles.shell}><section className={styles.card}>{error || 'Operator console unavailable.'}</section></div></main>;
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.topbar}>
          <div>
            <div className={styles.eyebrow}>LeagueOS Operator</div>
            <h1>{selectedMatchId ? 'Court Scoring' : 'Stage Match Queue'}</h1>
          </div>
          <div className={styles.row}>
            <span className={styles.pill}>{auth ? 'Admin Auth Active' : 'View Only'}</span>
            {selectedMatchId ? (
              <button className={styles.backButton} type="button" onClick={() => setSelectedMatchId(null)}>
                Queue
              </button>
            ) : null}
          </div>
        </section>

        {!selectedMatchId ? (
          <>
            <section className={`${styles.card} ${styles.queueHeader}`}>
              <div className={styles.queueHeaderTop}>
                <div>
                  <div className={styles.eyebrow}>Match Queue</div>
                  <h2 className={styles.queueTitle}>{payload.tournament.name}</h2>
                </div>
                <span className={styles.metaPill}>{liveClock}</span>
              </div>
              <div className={styles.queueStageLine}>
                {stageSeed ? stageLabel(stageSeed.match) : 'No active stage'}
              </div>
              <p className={styles.sectionCopy}>
                In-progress matches first, then scheduled matches sorted by court and earliest start time.
              </p>
              <div className={styles.queueSummary}>
                <div className={styles.queueSummaryChip}>
                  <span className={styles.label}>In Progress</span>
                  <strong>{stageLiveMatches.length}</strong>
                </div>
                <div className={styles.queueSummaryChip}>
                  <span className={styles.label}>Scheduled</span>
                  <strong>{stageScheduledMatches.length}</strong>
                </div>
                <div className={styles.queueSummaryChip}>
                  <span className={styles.label}>Timezone</span>
                  <strong>{payload.tournament.timezone}</strong>
                </div>
              </div>
            </section>

            <section className={`${styles.card} ${styles.queueCard}`}>
              <div className={styles.sectionHead}>
                <div>
                  <h2>{stageSeed ? stageLabel(stageSeed.match) : 'No active stage'}</h2>
                  <p className={styles.sectionCopy}>
                    Select a match to open the mobile scoring console.
                  </p>
                </div>
                <span className={styles.metaPill}>{stageLiveMatches.length + stageScheduledMatches.length} matches</span>
              </div>

              <div className={styles.queueList}>
                {stageLiveMatches.length ? (
                  <section className={styles.queueSection}>
                    <div className={styles.queueSectionLabel}>In Progress</div>
                    {stageLiveMatches.map((entry) => (
                      <button
                        key={entry.match.id}
                        className={`${styles.queueItem} ${styles.queueActive}`}
                        type="button"
                        onClick={() => setSelectedMatchId(entry.match.id)}
                      >
                        <div className={styles.queueTop}>
                          <strong>{entry.match.court_name || `Court ${entry.match.court_id ?? 'TBD'}`}</strong>
                          <span>{matchStatusLabel(entry.match.status)}</span>
                        </div>
                        <div className={styles.queueTeams}>{entry.homeLabel} vs {entry.awayLabel}</div>
                        <div className={styles.queueMeta}>
                          <span>{entry.format.name}</span>
                          <span>{matchWinConditionLabel(entry)}</span>
                          <span>{setWinConditionLabel(entry)}</span>
                        </div>
                      </button>
                    ))}
                  </section>
                ) : null}

                {stageScheduledMatches.length ? (
                  <section className={styles.queueSection}>
                    <div className={styles.queueSectionLabel}>Scheduled</div>
                    {stageScheduledMatches.map((entry) => (
                      <button
                        key={entry.match.id}
                        className={styles.queueItem}
                        type="button"
                        onClick={() => setSelectedMatchId(entry.match.id)}
                      >
                        <div className={styles.queueTop}>
                          <strong>{entry.match.court_name || `Court ${entry.match.court_id ?? 'TBD'}`}</strong>
                          <span>{formatTournamentDate(entry.match.start_at ?? entry.match.tentative_start_at, payload.tournament.timezone, { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div className={styles.queueTeams}>{entry.homeLabel} vs {entry.awayLabel}</div>
                        <div className={styles.queueMeta}>
                          <span>{entry.format.name}</span>
                          <span>{matchWinConditionLabel(entry)}</span>
                          <span>{setWinConditionLabel(entry)}</span>
                        </div>
                      </button>
                    ))}
                  </section>
                ) : null}

                {!stageLiveMatches.length && !stageScheduledMatches.length ? (
                  <div className={styles.emptyState}>
                    No in-progress or scheduled matches are available in the current stage.
                  </div>
                ) : null}
              </div>
            </section>
          </>
        ) : activeMatch && operatorState ? (
          <>
            <section className={`${styles.card} ${styles.hero}`}>
              <div className={styles.heroTop}>
                <div className={styles.heroTitle}>
                  {stageLabel(activeMatch.match)} • Match {activeMatch.match.match_number}
                </div>
                <div className={styles.timer}>{new Date(elapsedMs).toISOString().slice(14, 19)}</div>
              </div>

              <div className={styles.scoreboard}>
                <div className={styles.teamPane}>
                  <ShuttleIcon active={operatorState.serverSide === (leftIsHome ? 'home' : 'away')} />
                  <div className={styles.teamLabel}>{leftLabel}</div>
                  <div className={styles.teamSets}>Sets {leftSets}</div>
                </div>
                <div className={styles.score}>{leftScore}<span>-</span>{rightScore}</div>
                <div className={styles.teamPane}>
                  <ShuttleIcon active={operatorState.serverSide === (leftIsHome ? 'away' : 'home')} />
                  <div className={styles.teamLabel}>{rightLabel}</div>
                  <div className={styles.teamSets}>Sets {rightSets}</div>
                </div>
              </div>

                <div className={styles.heroMeta}>
                  <div className={styles.heroChip}>
                    <span className={styles.label}>Status</span>
                    <strong className={styles.heroValue}>{scoringStatus}</strong>
                  </div>
                  <div className={styles.heroChip}>
                    <span className={styles.label}>Set Rule</span>
                    <strong className={styles.heroValue}>{setWinConditionLabel(activeMatch)}</strong>
                </div>
                <div className={styles.heroChip}>
                  <span className={styles.label}>Match Rule</span>
                  <strong className={styles.heroValue}>{matchWinConditionLabel(activeMatch)}</strong>
                </div>
              </div>
            </section>

            <section className={styles.sectionStack}>
              <div className={styles.bigButtons}>
                <button className={styles.pointButton} disabled={busy || scoringLocked} onClick={() => void scorePoint('left')}>
                  <span>+</span>
                  <small>{leftLabel}</small>
                </button>
                <button className={styles.pointButton} disabled={busy || scoringLocked} onClick={() => void scorePoint('right')}>
                  <span>+</span>
                  <small>{rightLabel}</small>
                </button>
              </div>

              <div className={`${styles.controlGrid} ${styles.controlsThree}`}>
                <button className={styles.button} onClick={() => setOperatorState((prev) => prev ? { ...prev, leftSide: prev.leftSide === 'home' ? 'away' : 'home' } : prev)}>Flip sides</button>
                <button className={styles.button} onClick={() => setSheetOpen(true)}>More actions</button>
                <button className={styles.altButton} disabled={busy || !auth} onClick={() => void handlePrimaryControl()}>
                  {primaryControlLabel}
                </button>
              </div>

              <div className={styles.primaryGrid}>
                <button className={styles.warnButton} disabled={busy || scoringLocked} onClick={() => void undoPoint()}>Undo</button>
                <button className={styles.altButton} onClick={() => setOperatorState((prev) => prev ? { ...prev, serverSide: prev.serverSide === 'home' ? 'away' : 'home' } : prev)}>Swap serve</button>
              </div>
            </section>

            <section className={`${styles.card} ${styles.cardCompact}`}>
              <div className={styles.sectionHead}>
                <div>
                  <h2>Recent Activity</h2>
                  <p className={styles.sectionCopy}>Latest rally states and operator notes.</p>
                </div>
              </div>
              <div className={styles.history}>
                {operatorState.rallies.slice(-12).map((value, index, entries) => (
                  <span key={`${value}-${index}`} className={index === entries.length - 1 ? `${styles.rally} ${styles.current}` : styles.rally}>
                    {value}
                  </span>
                ))}
              </div>
              <div className={styles.timeline}>
                {operatorState.notes.slice(0, 6).map((note, index) => <div key={`${note}-${index}`}>{note}</div>)}
                <div>{effectiveCourtName} · {activeMatch.format.name}</div>
                <div>Start {formatTournamentDate(activeMatch.match.start_at ?? activeMatch.match.tentative_start_at, payload.tournament.timezone, { hour: '2-digit', minute: '2-digit' })}</div>
                {message ? <div>{message}</div> : null}
              </div>
              <div className={styles.linkRow}>
                <a href={`/tournaments/${payload.tournament.id}/courtside`} className={styles.stream}>Public courtside</a>
                <a href={`/tournaments/${payload.tournament.id}/venue-display`} className={styles.stream}>Venue display</a>
              </div>
            </section>
          </>
        ) : (
          <section className={styles.card}>No match available for operator control.</section>
        )}
      </div>

      <div className={sheetOpen ? `${styles.sheetBackdrop} ${styles.open}` : styles.sheetBackdrop} onClick={() => setSheetOpen(false)} />
      <section className={sheetOpen ? `${styles.actionSheet} ${styles.open}` : styles.actionSheet}>
        <div className={styles.sheetHead}>
          <div>
            <h2>Match Actions</h2>
            <div className={styles.sectionCopy}>These actions persist to the backend.</div>
          </div>
          <button className={styles.sheetClose} type="button" onClick={() => setSheetOpen(false)}>Close</button>
        </div>
        <div className={styles.sheetActions}>
          {operatorState?.matchStatus !== 'SCHEDULED' ? (
            <button
              className={styles.dangerButton}
              disabled={busy || !auth || !activeMatch || !operatorState || operatorState.matchStatus === 'FINALIZED'}
              onClick={() => void toggleLifecycle()}
            >
              {lifecycleActionLabel(operatorState?.matchStatus)}
            </button>
          ) : null}
          {!courtReassignmentLocked ? (
            <div className={styles.sheetBlock}>
              <div className={styles.sheetLabel}>Court assignment</div>
              <div className={styles.sheetInline}>
                <select
                  className={styles.select}
                  value={courtDraftId}
                  onChange={(event) => setCourtDraftId(event.target.value)}
                  disabled={!auth || busy}
                >
                  <option value="">{effectiveCourtName}</option>
                  {payload.courts.filter((court) => court.is_active).map((court) => (
                    <option key={court.id} value={String(court.id)}>
                      {court.name}
                    </option>
                  ))}
                </select>
                <button
                  className={styles.button}
                  disabled={!auth || busy || !courtChanged}
                  onClick={() => void updateCourtAssignment()}
                >
                  Update
                </button>
              </div>
            </div>
          ) : null}
          <button className={styles.altButton} disabled={busy || !auth} onClick={() => void manualSet('left')}>Set {leftLabel} score</button>
          <button className={styles.altButton} disabled={busy || !auth} onClick={() => void manualSet('right')}>Set {rightLabel} score</button>
          <button className={styles.altButton} disabled={busy || !auth} onClick={() => void completeCurrentSet()}>Complete current set</button>
          <button className={styles.dangerButton} disabled={busy || !auth} onClick={() => void markForfeit('left')}>{leftLabel} forfeit</button>
          <button className={styles.dangerButton} disabled={busy || !auth} onClick={() => void markForfeit('right')}>{rightLabel} forfeit</button>
          <button className={styles.altButton} disabled={busy || !auth || !operatorState} onClick={() => void setLifecycleStatus('CANCELLED', 'Match cancelled.', 'OPERATOR_CANCEL')}>
            Cancel match
          </button>
          <button className={styles.altButton} disabled={busy || !auth || !operatorState} onClick={() => void setLifecycleStatus('VOID', 'Match voided.', 'OPERATOR_VOID')}>
            Void match
          </button>
        </div>
      </section>
    </main>
  );
}
