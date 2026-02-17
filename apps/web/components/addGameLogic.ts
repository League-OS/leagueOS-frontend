import type { Season, Session } from '@leagueos/schemas';

export function listOpenSeasons(seasons: Season[]): Season[] {
  return seasons.filter((season) => season.is_active);
}

export function selectSingleOpenSession(sessions: Session[]): { session: Session | null; error: string | null } {
  const openSessions = sessions
    .filter((session) => session.status === 'OPEN')
    .sort((a, b) => {
      const byDate = b.session_date.localeCompare(a.session_date);
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

  if (args.scoreA === args.scoreB) {
    return 'Draw is not allowed. Scores must differ.';
  }

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
