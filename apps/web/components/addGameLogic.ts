import type { Season, Session } from '@leagueos/schemas';

export function listOpenSeasons(seasons: Season[]): Season[] {
  return seasons.filter((season) => season.is_active);
}

export function selectSingleOpenSession(sessions: Session[]): { session: Session | null; error: string | null } {
  const openSessions = sessions
    .filter((session) => session.status === 'OPEN')
    .sort((a, b) => {
      const byDate = b.session_start_time.localeCompare(a.session_start_time);
      if (byDate !== 0) return byDate;
      return b.id - a.id;
    });

  if (!openSessions.length) {
    return {
      session: null,
      error: 'No open session is available for this season. Open one session before recording games.',
    };
  }

  if (openSessions.length > 1) {
    return {
      session: null,
      error: 'Multiple open sessions found for this season. Close extras so exactly one open session remains.',
    };
  }

  return { session: openSessions[0], error: null };
}

export function floorToFiveMinuteIncrement(timeHHmm: string): string {
  const [hoursRaw, minutesRaw] = timeHHmm.split(':');
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return timeHHmm;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return timeHHmm;

  const flooredMinutes = Math.floor(minutes / 5) * 5;
  return `${String(hours).padStart(2, '0')}:${String(flooredMinutes).padStart(2, '0')}`;
}

export function combineSessionDateAndTimeToIso(sessionDate: string, timeHHmm: string): string | null {
  const normalizedTime = floorToFiveMinuteIncrement(timeHHmm);
  const [hoursRaw, minutesRaw] = normalizedTime.split(':');
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;

  const [yearRaw, monthRaw, dayRaw] = sessionDate.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;

  const localDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
  if (Number.isNaN(localDate.getTime())) return null;

  return localDate.toISOString();
}

export function validateAddGameInput(args: {
  courtId: number | null;
  scoreA: number;
  scoreB: number;
  sideAPlayerIds: [number, number];
  sideBPlayerIds: [number, number];
  sessionId: number | null;
  startTime: string;
}): string | null {
  if (!args.sessionId) return 'No open session selected.';
  if (!args.startTime) return 'Please select a start time.';

  const scoreError = validateBadmintonEndScore(args.scoreA, args.scoreB);
  if (scoreError) return scoreError;

  const ids = [...args.sideAPlayerIds, ...args.sideBPlayerIds];
  if (ids.some((id) => !id)) {
    return 'Please select all 4 players.';
  }

  if (new Set(ids).size !== ids.length) {
    return 'Players must be unique across both sides.';
  }

  if (!args.courtId) {
    return 'Please select a court.';
  }

  return null;
}

export function validateBadmintonEndScore(scoreA: number, scoreB: number): string | null {
  if (scoreA === scoreB) {
    return 'Draw is not allowed. Scores must differ.';
  }
  const winner = Math.max(scoreA, scoreB);
  const loser = Math.min(scoreA, scoreB);
  if (winner > 30) {
    return 'Maximum score allowed is 30.';
  }
  if (winner < 21) {
    return 'Winner must score at least 21 points.';
  }
  if (winner === 21) {
    if (loser > 19) {
      return 'A 21-point win is only valid when opponent score is 0-19.';
    }
  } else if (winner >= 22 && winner <= 29) {
    if (loser < 20 || winner - loser !== 2) {
      return 'Scores from 22-29 are valid only as 2-point deuce wins (e.g., 22-20, 23-21).';
    }
  } else if (winner === 30) {
    if (loser !== 29) {
      return 'A 30-point win is only valid as 30-29.';
    }
  } else {
    return 'Invalid badminton game end score.';
  }
  if (winner < 30 && winner - loser < 2) {
    return 'Winner must lead by at least 2 points unless winning at 30.';
  }
  return null;
}
