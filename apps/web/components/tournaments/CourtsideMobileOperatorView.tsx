'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';

import styles from './CourtsideMobileOperatorView.module.css';
import {
  API_BASE,
  UPCOMING_STATUSES,
  featuredMatches,
  findDefaultOperatorMatch,
  formatTournamentDate,
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

function currentRun(rallies: string[], side: 'home' | 'away'): number {
  let run = 0;
  for (let index = rallies.length - 1; index > 0; index -= 1) {
    const current = rallies[index]?.split('-').map((value) => Number(value)) ?? [];
    const previous = rallies[index - 1]?.split('-').map((value) => Number(value)) ?? [];
    const homeAdvanced = current[0] > previous[0];
    const awayAdvanced = current[1] > previous[1];
    if (side === 'home' && homeAdvanced) run += 1;
    else if (side === 'away' && awayAdvanced) run += 1;
    else break;
  }
  return run;
}

function longestRun(rallies: string[], side: 'home' | 'away'): number {
  let best = 0;
  let current = 0;
  for (let index = 1; index < rallies.length; index += 1) {
    const previous = rallies[index - 1]?.split('-').map((value) => Number(value)) ?? [];
    const next = rallies[index]?.split('-').map((value) => Number(value)) ?? [];
    const won = side === 'home' ? next[0] > previous[0] : next[1] > previous[1];
    if (won) {
      current += 1;
      best = Math.max(best, current);
    } else {
      current = 0;
    }
  }
  return best;
}

function serviceTurns(rallies: string[]): { home: number; away: number } {
  let previousWinner: 'home' | 'away' | null = null;
  let home = 1;
  let away = 0;
  for (let index = 1; index < rallies.length; index += 1) {
    const previous = rallies[index - 1]?.split('-').map((value) => Number(value)) ?? [];
    const next = rallies[index]?.split('-').map((value) => Number(value)) ?? [];
    const winner: 'home' | 'away' = next[0] > previous[0] ? 'home' : 'away';
    if (previousWinner && previousWinner !== winner) {
      if (winner === 'home') home += 1;
      else away += 1;
    }
    previousWinner = winner;
  }
  return { home, away };
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

export function CourtsideMobileOperatorView() {
  const params = useParams<{ tournamentId: string }>();
  const searchParams = useSearchParams();
  const tournamentId = Number.parseInt(params?.tournamentId ?? '', 10);
  const requestedMatchId = Number.parseInt(searchParams.get('matchId') ?? '', 10);
  const { payload, loading, error } = useTournamentPublicPayload(tournamentId, 8000);
  const [auth, setAuth] = useState<AdminAuth | null>(null);
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(Number.isInteger(requestedMatchId) ? requestedMatchId : null);
  const [operatorState, setOperatorState] = useState<OperatorState | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    setAuth(readAdminAuth());
  }, []);

  const decorated = useMemo(() => (payload ? featuredMatches(payload.formats) : []), [payload]);
  const activeMatch = useMemo(
    () => decorated.find((entry) => entry.match.id === selectedMatchId) ?? null,
    [decorated, selectedMatchId],
  );

  useEffect(() => {
    if (!payload) return;
    if (selectedMatchId && decorated.some((entry) => entry.match.id === selectedMatchId)) return;
    const fallback = findDefaultOperatorMatch(payload);
    setSelectedMatchId(fallback?.match.id ?? null);
  }, [payload, decorated, selectedMatchId]);

  useEffect(() => {
    if (!activeMatch) {
      setOperatorState(null);
      return;
    }
    setOperatorState(loadOperatorState(activeMatch));
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
  }, [activeMatch?.match.row_version, activeMatch?.match.status, activeMatch?.match.score_json]);

  const setSummary = operatorState ? computeSets(operatorState) : { home: 0, away: 0 };
  const leftIsHome = operatorState?.leftSide !== 'away';
  const leftLabel = activeMatch ? (leftIsHome ? activeMatch.homeLabel : activeMatch.awayLabel) : 'Left';
  const rightLabel = activeMatch ? (leftIsHome ? activeMatch.awayLabel : activeMatch.homeLabel) : 'Right';
  const leftScore = operatorState ? (leftIsHome ? operatorState.scoreHome : operatorState.scoreAway) : 0;
  const rightScore = operatorState ? (leftIsHome ? operatorState.scoreAway : operatorState.scoreHome) : 0;
  const leftSets = operatorState ? (leftIsHome ? setSummary.home : setSummary.away) : 0;
  const rightSets = operatorState ? (leftIsHome ? setSummary.away : setSummary.home) : 0;
  const serviceLabel = operatorState
    ? `${operatorState.serverSide === 'home' ? activeMatch?.homeLabel : activeMatch?.awayLabel} serving`
    : 'Serving side unset';
  const sameCourtQueue = activeMatch
    ? decorated.filter((entry) => entry.match.court_id === activeMatch.match.court_id && entry.match.id !== activeMatch.match.id && UPCOMING_STATUSES.has(entry.match.status)).length
    : 0;

  const currentRule = activeMatch
    ? `${activeMatch.match.points_to_win_set ?? 21}${activeMatch.match.win_by_two ? '+2' : ''}`
    : '21+2';
  const currentRunHome = operatorState ? currentRun(operatorState.rallies, 'home') : 0;
  const currentRunAway = operatorState ? currentRun(operatorState.rallies, 'away') : 0;
  const longestRunHome = operatorState ? longestRun(operatorState.rallies, 'home') : 0;
  const longestRunAway = operatorState ? longestRun(operatorState.rallies, 'away') : 0;
  const serviceStats = operatorState ? serviceTurns(operatorState.rallies) : { home: 0, away: 0 };

  async function persistScore(next: {
    scoreHome: number;
    scoreAway: number;
    status: string;
    note: string;
    completedSets?: OperatorState['completedSets'];
    paused?: boolean;
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
      });
      setOperatorState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          scoreHome: next.scoreHome,
          scoreAway: next.scoreAway,
          completedSets: next.completedSets ?? prev.completedSets,
          paused: next.paused ?? prev.paused,
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

  async function scorePoint(side: 'left' | 'right') {
    if (!activeMatch || !operatorState) return;
    const actualSide: 'home' | 'away' = side === 'left'
      ? (leftIsHome ? 'home' : 'away')
      : (leftIsHome ? 'away' : 'home');
    const nextHome = operatorState.scoreHome + (actualSide === 'home' ? 1 : 0);
    const nextAway = operatorState.scoreAway + (actualSide === 'away' ? 1 : 0);
    const nextRallies = [...operatorState.rallies, `${nextHome}-${nextAway}`].slice(-60);
    const setWinner = evaluateSetWinner(activeMatch, nextHome, nextAway);
    const setsToWin = activeMatch.match.sets_to_win ?? 2;
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
      });
      setOperatorState((prev) => prev ? { ...prev, rallies: nextRallies, completedSets: nextCompletedSets } : prev);
      return;
    }

    if (setWinner) {
      await persistScore({
        scoreHome: 0,
        scoreAway: 0,
        status: operatorState.matchStatus === 'SCHEDULED' ? 'IN_PROGRESS' : operatorState.matchStatus,
        note: `${setWinner === 'home' ? activeMatch.homeLabel : activeMatch.awayLabel} won the set.`,
        completedSets: nextCompletedSets,
      });
      setOperatorState((prev) => prev ? { ...prev, rallies: ['0-0'], completedSets: nextCompletedSets } : prev);
      return;
    }

    await persistScore({
      scoreHome: nextHome,
      scoreAway: nextAway,
      status: operatorState.matchStatus === 'SCHEDULED' ? 'IN_PROGRESS' : operatorState.matchStatus,
      note: `${actualSide === 'home' ? activeMatch.homeLabel : activeMatch.awayLabel} won the rally.`,
    });
    setOperatorState((prev) => prev ? { ...prev, rallies: nextRallies } : prev);
  }

  async function undoPoint() {
    if (!operatorState || !activeMatch || operatorState.rallies.length <= 1) return;
    const nextRallies = operatorState.rallies.slice(0, -1);
    const [home, away] = nextRallies[nextRallies.length - 1].split('-').map((value) => Number(value));
    await persistScore({
      scoreHome: home,
      scoreAway: away,
      status: operatorState.matchStatus === 'COMPLETED' ? 'IN_PROGRESS' : operatorState.matchStatus,
      note: 'Last rally was removed.',
    });
    setOperatorState((prev) => prev ? { ...prev, rallies: nextRallies } : prev);
  }

  async function manualSet(side: 'left' | 'right') {
    if (!operatorState || !activeMatch) return;
    const label = side === 'left' ? leftLabel : rightLabel;
    const value = Number(window.prompt(`Set exact score for ${label}`, String(side === 'left' ? leftScore : rightScore)));
    if (!Number.isFinite(value) || value < 0) return;
    const actualSide: 'home' | 'away' = side === 'left'
      ? (leftIsHome ? 'home' : 'away')
      : (leftIsHome ? 'away' : 'home');
    const nextHome = actualSide === 'home' ? value : operatorState.scoreHome;
    const nextAway = actualSide === 'away' ? value : operatorState.scoreAway;
    await persistScore({
      scoreHome: nextHome,
      scoreAway: nextAway,
      status: operatorState.matchStatus === 'SCHEDULED' ? 'IN_PROGRESS' : operatorState.matchStatus,
      note: `${label} score was adjusted manually.`,
    });
    setOperatorState((prev) => prev ? { ...prev, rallies: [...prev.rallies, `${nextHome}-${nextAway}`].slice(-60) } : prev);
  }

  async function markForfeit(side: 'left' | 'right') {
    if (!activeMatch) return;
    const forfeitingHome = side === 'left' ? leftIsHome : !leftIsHome;
    await persistScore({
      scoreHome: forfeitingHome ? 0 : 21,
      scoreAway: forfeitingHome ? 21 : 0,
      status: 'COMPLETED',
      note: `${forfeitingHome ? activeMatch.homeLabel : activeMatch.awayLabel} forfeited.`,
    });
  }

  async function completeCurrentSet() {
    if (!operatorState || !activeMatch) return;
    if (operatorState.scoreHome === operatorState.scoreAway) {
      setMessage('Current set is tied. Enter an exact score or continue scoring.');
      return;
    }
    const winner = operatorState.scoreHome > operatorState.scoreAway ? 'home' : 'away';
    const completedSets = [...operatorState.completedSets, { home: operatorState.scoreHome, away: operatorState.scoreAway }];
    const summary = computeSets({ ...operatorState, completedSets });
    const setsToWin = activeMatch.match.sets_to_win ?? 2;
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

  async function toggleLifecycle() {
    if (!operatorState || !activeMatch) return;
    if (operatorState.matchStatus === 'SCHEDULED') {
      await persistScore({ scoreHome: operatorState.scoreHome, scoreAway: operatorState.scoreAway, status: 'IN_PROGRESS', note: 'Match started.' });
      return;
    }
    if (operatorState.matchStatus === 'IN_PROGRESS') {
      if (operatorState.scoreHome === operatorState.scoreAway) {
        setMessage('Scores cannot be tied when completing a match.');
        return;
      }
      await persistScore({ scoreHome: operatorState.scoreHome, scoreAway: operatorState.scoreAway, status: 'COMPLETED', note: 'Match completed.' });
      return;
    }
    if (operatorState.matchStatus === 'COMPLETED' || operatorState.matchStatus === 'CANCELLED' || operatorState.matchStatus === 'FORFEIT' || operatorState.matchStatus === 'VOID') {
      await persistScore({ scoreHome: operatorState.scoreHome, scoreAway: operatorState.scoreAway, status: 'DISPUTED', note: 'Match moved to disputed.' });
      return;
    }
    if (operatorState.matchStatus === 'DISPUTED') {
      await persistScore({ scoreHome: operatorState.scoreHome, scoreAway: operatorState.scoreAway, status: 'FINALIZED', note: 'Dispute finalized.' });
    }
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
            <div className={styles.small}>LeagueOS Courtside</div>
            <h1>Scoring Console</h1>
          </div>
          <div className={styles.row}>
            <span className={styles.pill}>{auth ? 'Admin Auth Active' : 'View Only'}</span>
            <button className={sheetOpen ? `${styles.iconButton} ${styles.active}` : styles.iconButton} type="button" onClick={() => setSheetOpen((value) => !value)}>⋮</button>
          </div>
        </section>

        <section className={`${styles.card} ${styles.selectorCard}`}>
          <div className={styles.sectionHead}>
            <h2>Match Queue</h2>
            <span className={styles.small}>Live and next-up matches</span>
          </div>
          <div className={styles.matchRail}>
            {decorated.length ? decorated.slice(0, 12).map((entry) => (
              <button
                key={entry.match.id}
                className={entry.match.id === selectedMatchId ? `${styles.matchChip} ${styles.selected}` : styles.matchChip}
                onClick={() => setSelectedMatchId(entry.match.id)}
              >
                <strong>{entry.match.court_name || `Court ${entry.match.court_id ?? 'TBD'}`}</strong>
                <span>{entry.homeLabel} vs {entry.awayLabel}</span>
              </button>
            )) : <div className={styles.small}>No scheduled matches found.</div>}
          </div>
        </section>

        {activeMatch && operatorState ? (
          <>
            <section className={`${styles.card} ${styles.hero}`}>
              <div className={styles.heroTop}>
                <div>{stageLabel(activeMatch.match)} • Match {activeMatch.match.match_number} • Source: admin sync</div>
                <div className={styles.timer}><span className={styles.timerDot} />{new Date(elapsedMs).toISOString().slice(14, 19)}</div>
              </div>

              <div className={styles.scoreShell}>
                <div className={styles.scoreboard}>
                  <div className={styles.teamPane}>
                    <span className={operatorState.serverSide === (leftIsHome ? 'home' : 'away') ? `${styles.indicator} ${styles.on}` : styles.indicator} />
                    <div className={styles.teamLabel}>{leftLabel}</div>
                    <div className={styles.teamSets}>Sets {leftSets}</div>
                  </div>
                  <div className={styles.score}>{leftScore} - {rightScore}</div>
                  <div className={styles.teamPane}>
                    <span className={operatorState.serverSide === (leftIsHome ? 'away' : 'home') ? `${styles.indicator} ${styles.on}` : styles.indicator} />
                    <div className={styles.teamLabel}>{rightLabel}</div>
                    <div className={styles.teamSets}>Sets {rightSets}</div>
                  </div>
                </div>

                <div className={styles.heroActions}>
                  <div className={styles.serviceBanner}>{serviceLabel}</div>
                </div>

                <div className={styles.heroMeta}>
                  <div className={styles.heroChip}><span className={styles.label}>Court side</span><strong>{leftIsHome ? activeMatch.homeLabel : activeMatch.awayLabel}</strong></div>
                  <div className={styles.heroChip}><span className={styles.label}>Status</span><strong>{operatorState.paused ? 'PAUSED' : operatorState.matchStatus}</strong></div>
                  <div className={styles.heroChip}><span className={styles.label}>Sets</span><strong>{setSummary.home}-{setSummary.away}</strong></div>
                  <div className={styles.heroChip}><span className={styles.label}>Queue</span><strong>{sameCourtQueue}</strong></div>
                  <div className={styles.heroChip}><span className={styles.label}>Rule</span><strong>{currentRule}</strong></div>
                </div>
              </div>
            </section>

            <section className={styles.sectionStack}>
              <div className={styles.bigButtons}>
                <button className={styles.pointButton} disabled={busy || !auth} onClick={() => void scorePoint('left')}>
                  <span>+</span>
                  <small>Point {leftLabel}</small>
                </button>
                <button className={styles.pointButton} disabled={busy || !auth} onClick={() => void scorePoint('right')}>
                  <span>+</span>
                  <small>Point {rightLabel}</small>
                </button>
              </div>

              <div className={`${styles.controlGrid} ${styles.controlsThree}`}>
                <button className={styles.button} onClick={() => setOperatorState((prev) => prev ? { ...prev, leftSide: prev.leftSide === 'home' ? 'away' : 'home' } : prev)}>Flip court side</button>
                <button className={styles.button} onClick={() => setSheetOpen((value) => !value)}>More actions</button>
                <button className={styles.altButton} onClick={() => setOperatorState((prev) => prev ? { ...prev, paused: !prev.paused } : prev)}>Pause / Resume</button>
              </div>

              <div className={styles.primaryGrid}>
                <button className={styles.warnButton} disabled={busy || !auth} onClick={() => void undoPoint()}>Undo</button>
                <button className={styles.altButton} onClick={() => setOperatorState((prev) => prev ? { ...prev, serverSide: prev.serverSide === 'home' ? 'away' : 'home' } : prev)}>Swap serve</button>
              </div>
            </section>

            <section className={`${styles.card} ${styles.statsCard}`}>
              <div className={styles.sectionHead}>
                <h2>Live Stats</h2>
                <span className={styles.small}>device-local rally model</span>
              </div>
              <div className={styles.statsGrid}>
                <div className={styles.statRow}><div className={styles.value}>{operatorState.scoreHome}</div><div className={styles.label}>Points won</div><div className={styles.value}>{operatorState.scoreAway}</div></div>
                <div className={styles.statRow}><div className={styles.value}>{currentRunHome}</div><div className={styles.label}>Current run</div><div className={styles.value}>{currentRunAway}</div></div>
                <div className={styles.statRow}><div className={styles.value}>{longestRunHome}</div><div className={styles.label}>Longest run</div><div className={styles.value}>{longestRunAway}</div></div>
                <div className={styles.statRow}><div className={styles.value}>{serviceStats.home}</div><div className={styles.label}>Service turns</div><div className={styles.value}>{serviceStats.away}</div></div>
              </div>
            </section>

            <section className={styles.card}>
              <div className={styles.sectionHead}>
                <h2>Rally Feed</h2>
                <span className={styles.small}>latest score visible</span>
              </div>
              <div className={styles.history}>
                {operatorState.rallies.slice(-16).map((value, index, entries) => (
                  <span key={`${value}-${index}`} className={index === entries.length - 1 ? `${styles.rally} ${styles.current}` : styles.rally}>{value}</span>
                ))}
              </div>
              <div className={styles.timeline}>
                {operatorState.notes.map((note, index) => <div key={`${note}-${index}`}>{note}</div>)}
              </div>
              <a href={`/tournaments/${payload.tournament.id}/courtside`} className={styles.stream}>Open fan/public view</a>
              <a href={`/tournaments/${payload.tournament.id}/venue-display`} className={styles.stream}>Open venue display</a>
              <div className={styles.footer}>
                <div>Queue: <strong>{sameCourtQueue}</strong> · handoff: <strong>{sameCourtQueue > 0 ? 1 : 0}</strong></div>
                <div>Start: {formatTournamentDate(activeMatch.match.start_at ?? activeMatch.match.tentative_start_at, payload.tournament.timezone, { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            </section>

            <section className={styles.card}>
              <h2>Session Notes</h2>
              <div className={styles.timeline}>
                <div>{payload.tournament.name}</div>
                <div>{activeMatch.format.name}</div>
                <div>{activeMatch.match.court_name || `Court ${activeMatch.match.court_id ?? 'TBD'}`}</div>
                <div>{auth ? 'Scoring enabled on this device.' : 'Read-only until admin auth exists in local storage.'}</div>
                {message ? <div>{message}</div> : null}
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
            <div className={styles.small}>Secondary controls moved off the main scoring surface.</div>
          </div>
          <button className={styles.sheetClose} type="button" onClick={() => setSheetOpen(false)}>Close</button>
        </div>
        <div className={styles.sheetActions}>
          <button className={styles.button} onClick={() => setOperatorState((prev) => prev ? { ...prev, serverSide: Math.random() < 0.5 ? 'home' : 'away', leftSide: Math.random() < 0.5 ? 'home' : 'away', notes: [`${new Date().toLocaleTimeString()} Toss executed.`, ...prev.notes].slice(0, 12) } : prev)}>Run toss</button>
          <button className={styles.dangerButton} disabled={busy || !auth || !activeMatch || !operatorState || operatorState.matchStatus === 'FINALIZED'} onClick={() => void toggleLifecycle()}>
            {operatorState?.matchStatus === 'SCHEDULED'
              ? 'Start match'
              : operatorState?.matchStatus === 'IN_PROGRESS'
                ? 'Complete match'
                : operatorState?.matchStatus === 'DISPUTED'
                  ? 'Finalize dispute'
                  : 'Mark disputed'}
          </button>
          <button className={styles.altButton} disabled={busy || !auth} onClick={() => void manualSet('left')}>Set {leftLabel} exact score</button>
          <button className={styles.altButton} disabled={busy || !auth} onClick={() => void manualSet('right')}>Set {rightLabel} exact score</button>
          <button className={styles.dangerButton} disabled={busy || !auth} onClick={() => void markForfeit('left')}>{leftLabel} forfeit</button>
          <button className={styles.dangerButton} disabled={busy || !auth} onClick={() => void markForfeit('right')}>{rightLabel} forfeit</button>
          <button className={styles.altButton} disabled={busy || !auth} onClick={() => void completeCurrentSet()}>Complete current set</button>
        </div>
      </section>
    </main>
  );
}
