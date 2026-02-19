'use client';

import { useMemo, useState } from 'react';
import { LeagueOsApiClient } from '@leagueos/api';
import { DEFAULT_CLUB_ID } from '@leagueos/config';
import type { Club, Court, Game, GameParticipant, LeaderboardEntry, Player, Profile, Season, Session } from '@leagueos/schemas';
import {
  combineSessionDateAndTimeToIso,
  listOpenSeasons,
  selectSingleOpenSession,
} from '../components/addGameLogic';
import {
  LeaderboardView,
  type EloHistoryRow,
  type HomeGameRow,
  type ProfileStatSummary,
  type UpcomingRow,
} from '../components/LeaderboardView';
import { LoginView } from '../components/LoginView';
import type { AuthState } from '../components/types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8000';
const CLUB_NAME_FALLBACK: Record<number, string> = {
  1: 'Fraser Valley Badminton Club',
  2: 'BC Panthers Badminton Club',
  3: 'SuperGiants Badminton Club',
  4: 'Redhawks Badminton Club',
};

function formatMonthDay(dateish: string): string {
  const value = new Date(dateish);
  if (Number.isNaN(value.getTime())) return dateish;
  return value.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function findUserPlayerId(profile: Profile | null, players: Player[]): number | null {
  if (!profile) return null;
  const profileEmail = profile.email?.toLowerCase();
  if (profileEmail) {
    const emailMatch = players.find((p) => p.email?.toLowerCase() === profileEmail);
    if (emailMatch) return emailMatch.id;
  }

  const names = [profile.display_name, profile.full_name]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.trim().toLowerCase());
  if (names.length) {
    const nameMatch = players.find((p) => names.includes(p.display_name.trim().toLowerCase()));
    if (nameMatch) return nameMatch.id;
  }

  return null;
}

function outcomeForGame(game: Game, participants: GameParticipant[], userPlayerId: number | null): { outcome: 'W' | 'L'; mySide: 'A' | 'B' | null } {
  const winnerSide: 'A' | 'B' = game.score_a > game.score_b ? 'A' : 'B';
  const me = userPlayerId ? participants.find((p) => p.player_id === userPlayerId) : null;
  const mySide: 'A' | 'B' | null = me?.side ?? null;
  if (!mySide) {
    return { outcome: winnerSide === 'A' ? 'W' : 'L', mySide: null };
  }
  return { outcome: mySide === winnerSide ? 'W' : 'L', mySide };
}

function partnerNameForGame(args: {
  participants: GameParticipant[];
  mySide: 'A' | 'B' | null;
  userPlayerId: number | null;
}): string {
  const { participants, mySide, userPlayerId } = args;
  if (!participants.length) return '-';

  if (mySide && userPlayerId) {
    const teammate = participants.find((p) => p.side === mySide && p.player_id !== userPlayerId);
    if (teammate) return teammate.display_name;
  }

  const sideAPeople = participants.filter((p) => p.side === 'A');
  return sideAPeople[1]?.display_name ?? sideAPeople[0]?.display_name ?? participants[0].display_name ?? '-';
}

export default function Page() {
  const client = useMemo(() => new LeagueOsApiClient({ apiBaseUrl: API_BASE }), []);
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedClubId, setSelectedClubId] = useState(DEFAULT_CLUB_ID);
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [recordClubId, setRecordClubId] = useState(DEFAULT_CLUB_ID);
  const [recordSession, setRecordSession] = useState<Session | null>(null);
  const [recordSeasonId, setRecordSeasonId] = useState<number | null>(null);
  const [recordSeasons, setRecordSeasons] = useState<Season[]>([]);
  const [recordPlayers, setRecordPlayers] = useState<Player[]>([]);
  const [recordCourts, setRecordCourts] = useState<Court[]>([]);
  const [recordContextError, setRecordContextError] = useState<string | null>(null);
  const [sessionsBySeason, setSessionsBySeason] = useState<Record<number, Session[]>>({});
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [profileStats, setProfileStats] = useState<ProfileStatSummary>({
    singles: 0,
    doubles: 0,
    mixed: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    winPct: 0,
  });
  const [eloHistory, setEloHistory] = useState<EloHistoryRow[]>([]);
  const [recentGames, setRecentGames] = useState<HomeGameRow[]>([]);
  const [allGames, setAllGames] = useState<HomeGameRow[]>([]);
  const [upcomingSessions, setUpcomingSessions] = useState<UpcomingRow[]>([]);
  const [allUpcomingSessions, setAllUpcomingSessions] = useState<UpcomingRow[]>([]);
  const [selectedProfilePlayerId, setSelectedProfilePlayerId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function loadDashboard(token: string, clubId: number, seasonId?: number, profilePlayerId?: number | null) {
    setLoading(true);
    setError(null);
    try {
      const [meRes, seasonsRes, playersRes, courtsRes] = await Promise.allSettled([
        client.profile(token),
        client.seasons(token, clubId),
        client.players(token, clubId),
        client.courts(token, clubId),
      ]);

      if (meRes.status === 'fulfilled') {
        setProfile(meRes.value);
      } else {
        throw meRes.reason;
      }

      const isGlobalAdmin = meRes.value.role === 'GLOBAL_ADMIN';
      const clubsRes = await Promise.allSettled([
        client.profileClubs(token),
        isGlobalAdmin ? client.clubs(token) : Promise.resolve([] as Club[]),
      ]);
      const profileClubSet = clubsRes[0].status === 'fulfilled' ? clubsRes[0].value : [];
      const adminClubSet = clubsRes[1].status === 'fulfilled' ? clubsRes[1].value : [];
      const mergedClubs = [...profileClubSet, ...adminClubSet].filter(
        (club, index, arr) => arr.findIndex((c) => c.id === club.id) === index,
      );
      setClubs(
        mergedClubs.length
          ? mergedClubs
          : [
              {
                id: clubId,
                name: CLUB_NAME_FALLBACK[clubId] ?? `Club ${clubId}`,
                created_at: new Date().toISOString(),
              },
            ],
      );

      if (seasonsRes.status === 'fulfilled') {
        setSeasons(seasonsRes.value);
      } else {
        throw seasonsRes.reason;
      }
      const openRecordSeasons = listOpenSeasons(seasonsRes.value);
      setRecordSeasons(openRecordSeasons);
      setRecordClubId(clubId);

      if (playersRes.status === 'fulfilled') {
        setPlayers(playersRes.value);
        setRecordPlayers(playersRes.value);
      } else {
        setPlayers([]);
        setRecordPlayers([]);
      }

      if (courtsRes.status === 'fulfilled') {
        setCourts(courtsRes.value);
        setRecordCourts(courtsRes.value);
      } else {
        setCourts([]);
        setRecordCourts([]);
      }

      const seasonList = seasonsRes.value;
      const seasonById = new Map<number, Season>(seasonList.map((season) => [season.id, season]));

      const seasonToLoad = seasonId ?? seasonList[0]?.id;
      if (!seasonToLoad) {
        setSelectedSeasonId(null);
        setSelectedSession(null);
        setRecordSession(null);
        setRecordSeasonId(null);
        setRecordContextError('No open seasons available for this club.');
        setSessionsBySeason({});
        setLeaderboard([]);
        setRecentGames([]);
        setAllGames([]);
        setUpcomingSessions([]);
        setAllUpcomingSessions([]);
        setProfileStats({
          singles: 0,
          doubles: 0,
          mixed: 0,
          pointsFor: 0,
          pointsAgainst: 0,
          winPct: 0,
        });
        setEloHistory([]);
        return;
      }

      setSelectedSeasonId(seasonToLoad);
      const data = await client.seasonLeaderboard(token, clubId, seasonToLoad);
      setSelectedSession(data.session);
      setLeaderboard(data.leaderboard);

      const seasonSessionsEntries = await Promise.all(
        seasonList.map(async (season) => [season.id, await client.sessions(token, clubId, season.id)] as const),
      );
      const nextSessionsBySeason = Object.fromEntries(seasonSessionsEntries);
      setSessionsBySeason(nextSessionsBySeason);
      const allSessions = seasonSessionsEntries.flatMap((entry) => entry[1]);
      const sessionById = new Map<number, Session>(allSessions.map((session) => [session.id, session]));
      const clubById = new Map<number, Club>();
      for (const club of [...profileClubSet, ...adminClubSet]) {
        clubById.set(club.id, club);
      }

      if (!openRecordSeasons.length) {
        setRecordSeasonId(null);
        setRecordSession(null);
        setRecordContextError('No open seasons available for this club.');
      } else {
        const initialRecordSeasonId = openRecordSeasons[0].id;
        setRecordSeasonId(initialRecordSeasonId);
        const picked = selectSingleOpenSession(nextSessionsBySeason[initialRecordSeasonId] ?? []);
        setRecordSession(picked.session);
        setRecordContextError(picked.error);
      }

      const [gamesRes, eloBySeasonRes] = await Promise.all([
        client.games(token, clubId),
        Promise.allSettled(
          seasonList.map(async (season) => {
            const lb = await client.seasonLeaderboard(token, clubId, season.id);
            return { season, leaderboard: lb.leaderboard };
          }),
        ),
      ]);

      const games = gamesRes ?? [];
      const participantsByGame = new Map<number, GameParticipant[]>();
      const participantFetches = await Promise.allSettled(
        games.map(async (game) => [game.id, await client.gameParticipants(token, clubId, game.id)] as const),
      );
      for (const fetchRes of participantFetches) {
        if (fetchRes.status === 'fulfilled') {
          participantsByGame.set(fetchRes.value[0], fetchRes.value[1]);
        }
      }

      const currentUserPlayerId = findUserPlayerId(meRes.value, playersRes.status === 'fulfilled' ? playersRes.value : []);
      const effectivePlayerId = profilePlayerId ?? selectedProfilePlayerId ?? currentUserPlayerId;
      const sourceGames = effectivePlayerId
        ? games.filter((game) => (participantsByGame.get(game.id) ?? []).some((p) => p.player_id === effectivePlayerId))
        : games;
      const courtNameById = new Map<number, string>((courtsRes.status === 'fulfilled' ? courtsRes.value : []).map((court) => [court.id, court.name]));

      const mappedGames = [...sourceGames]
        .sort((a, b) => b.start_time.localeCompare(a.start_time))
        .map((game): HomeGameRow => {
          const participants = participantsByGame.get(game.id) ?? [];
          const sideA = participants.filter((p) => p.side === 'A').map((p) => p.display_name);
          const sideB = participants.filter((p) => p.side === 'B').map((p) => p.display_name);
          const session = sessionById.get(game.session_id);
          const season = session ? seasonById.get(session.season_id) : undefined;
          const computed = outcomeForGame(game, participants, effectivePlayerId);
          const partner = partnerNameForGame({
            participants,
            mySide: computed.mySide,
            userPlayerId: effectivePlayerId,
          });
          return {
            id: game.id,
            sessionId: game.session_id,
            date: formatMonthDay(session?.session_date ?? game.start_time),
            season: season?.name ?? `Season ${session?.season_id ?? '-'}`,
            partner,
            score: computed.outcome,
            outcome: computed.outcome,
            startTime: game.start_time,
            courtName: courtNameById.get(game.court_id) ?? `Court ${game.court_id}`,
            teamA: sideA,
            teamB: sideB,
            scoreA: game.score_a,
            scoreB: game.score_b,
          };
        });

      setAllGames(mappedGames);
      setRecentGames(mappedGames.slice(0, 5));

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const upcomingRows = allSessions
        .filter((session) => {
          const sessionDate = new Date(session.session_date);
          if (session.status === 'OPEN') return true;
          if (session.status !== 'UPCOMING') return false;
          return !Number.isNaN(sessionDate.getTime()) && sessionDate.getTime() >= today.getTime();
        })
        .sort((a, b) => a.session_date.localeCompare(b.session_date))
        .map((session): UpcomingRow => {
          const season = seasonById.get(session.season_id);
          const clubName = season
            ? clubById.get(season.club_id)?.name ?? CLUB_NAME_FALLBACK[season.club_id] ?? `Club ${season.club_id}`
            : CLUB_NAME_FALLBACK[clubId] ?? `Club ${clubId}`;
          return {
            id: session.id,
            seasonId: session.season_id,
            date: formatMonthDay(session.session_date),
            season: season?.name ?? `Season ${session.season_id}`,
            club: clubName,
            status: session.status,
            location: session.location ?? '',
            address: session.address ?? '',
          };
        });

      setAllUpcomingSessions(upcomingRows);
      setUpcomingSessions(upcomingRows.slice(0, 5));

      let singles = 0;
      let doubles = 0;
      let mixed = 0;
      let pointsFor = 0;
      let pointsAgainst = 0;
      let wins = 0;

      for (const game of sourceGames) {
        const session = sessionById.get(game.session_id);
        const season = session ? seasonById.get(session.season_id) : undefined;
        if (season?.format === 'SINGLES') singles += 1;
        if (season?.format === 'DOUBLES') doubles += 1;
        if (season?.format === 'MIXED_DOUBLES') mixed += 1;

        const participants = participantsByGame.get(game.id) ?? [];
        const computed = outcomeForGame(game, participants, effectivePlayerId);
        if (computed.mySide === 'B') {
          pointsFor += game.score_b;
          pointsAgainst += game.score_a;
        } else {
          pointsFor += game.score_a;
          pointsAgainst += game.score_b;
        }
        if (computed.outcome === 'W') wins += 1;
      }

      const totalGames = sourceGames.length;
      const winPct = totalGames ? Number(((wins / totalGames) * 100).toFixed(1)) : 0;
      setProfileStats({ singles, doubles, mixed, pointsFor, pointsAgainst, winPct });

      const eloRows: EloHistoryRow[] = [];
      for (const entry of eloBySeasonRes) {
        if (entry.status !== 'fulfilled') continue;
        const season = entry.value.season;
        const candidates = entry.value.leaderboard;
        const currentById = effectivePlayerId ? candidates.find((row) => row.player_id === effectivePlayerId) : null;
        const currentByName = !currentById
          ? candidates.find((row) =>
              [meRes.value.display_name, meRes.value.full_name]
                .filter((value): value is string => Boolean(value))
                .map((value) => value.toLowerCase())
                .includes(row.display_name.toLowerCase()),
            )
          : null;
        const row = currentById ?? currentByName;
        if (!row) continue;
        const clubName =
          clubById.get(season.club_id)?.name ?? CLUB_NAME_FALLBACK[season.club_id] ?? `Club ${season.club_id}`;
        eloRows.push({
          season: season.name,
          club: clubName,
          elo: row.global_elo_score ?? 1000,
          change: row.season_elo_delta,
        });
      }
      setEloHistory(eloRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(args: { email: string; password: string }) {
    setLoading(true);
    setError(null);
    try {
      const res = await client.login({ email: args.email, password: args.password });
      const clubsForUser =
        res.role === 'GLOBAL_ADMIN' ? await client.clubs(res.token) : await client.profileClubs(res.token);
      if (!clubsForUser.length) {
        throw new Error('No clubs available for this account.');
      }
      const initialClubId = res.club_id ?? clubsForUser[0].id;
      const scoped = res.club_id === initialClubId ? res : await client.switchClub(res.token, initialClubId);
      const nextAuth = { token: scoped.token, clubId: initialClubId };
      setSelectedClubId(initialClubId);
      setAuth(nextAuth);
      await loadDashboard(nextAuth.token, nextAuth.clubId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleClubChange(clubId: number) {
    if (!auth) return;
    const scoped = await client.switchClub(auth.token, clubId);
    setSelectedProfilePlayerId(null);
    setSelectedClubId(clubId);
    const nextAuth = { token: scoped.token, clubId };
    setAuth(nextAuth);
    await loadDashboard(nextAuth.token, clubId, undefined, null);
  }

  async function handleSeasonChange(seasonId: number) {
    if (!auth) return;
    setSelectedSeasonId(seasonId);
    await loadDashboard(auth.token, auth.clubId, seasonId);
  }

  async function refresh() {
    if (!auth) return;
    await loadDashboard(auth.token, auth.clubId, selectedSeasonId ?? undefined, selectedProfilePlayerId);
  }

  async function handleFinalizeSession() {
    try {
      if (!auth) return;
      if (!selectedSession) {
        throw new Error('No session selected.');
      }
      if (selectedSession.status !== 'CLOSED') {
        throw new Error(`Only CLOSED sessions can be finalized. Current status: ${selectedSession.status}.`);
      }
      const result = await client.finalizeSession(auth.token, auth.clubId, selectedSession.id);
      await loadDashboard(auth.token, auth.clubId, selectedSeasonId ?? undefined);
      setSuccessMessage(
        `Session finalized. Games finalized: ${result.games_finalized}, Elo ledger rows: ${result.ledger_rows_written}.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to finalize session.');
    }
  }

  async function handleRevertSessionFinalize() {
    try {
      if (!auth) return;
      if (!selectedSession) {
        throw new Error('No session selected.');
      }
      if (selectedSession.status !== 'FINALIZED') {
        throw new Error(`Only FINALIZED sessions can be reverted. Current status: ${selectedSession.status}.`);
      }
      const result = await client.revertSessionFinalize(auth.token, auth.clubId, selectedSession.id);
      await loadDashboard(auth.token, auth.clubId, selectedSeasonId ?? undefined);
      setSuccessMessage(`Session reverted to CLOSED. Elo ledger rows reverted: ${result.ledger_rows_reverted}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to revert finalized session.');
    }
  }

  async function handleRecordGame(payload: {
    courtId: number | null;
    startTimeLocal: string;
    scoreA: number;
    scoreB: number;
    sideAPlayerIds: [number, number];
    sideBPlayerIds: [number, number];
  }) {
    if (!auth) return;
    const canRecord =
      profile?.role === 'CLUB_ADMIN' ||
      profile?.role === 'RECORDER' ||
      profile?.club_role === 'CLUB_ADMIN' ||
      profile?.club_role === 'RECORDER';
    if (!canRecord) {
      throw new Error('Only club admins or recorders can record games.');
    }
    const sessionToUse = recordSession;
    if (!sessionToUse) {
      throw new Error('No open session available. Open one session before recording games.');
    }
    if (sessionToUse.status !== 'OPEN') {
      throw new Error('Selected session is not open. Choose a season with one open session.');
    }

    const startTimeIso = combineSessionDateAndTimeToIso(sessionToUse.session_date, payload.startTimeLocal);
    if (!startTimeIso) {
      throw new Error('Invalid start time. Please pick a valid time in 5-minute increments.');
    }
    if (!payload.courtId) {
      throw new Error('Please select a court.');
    }

    const game = await client.createGame(auth.token, recordClubId, {
      session_id: sessionToUse.id,
      court_id: payload.courtId,
      start_time: startTimeIso,
      score_a: payload.scoreA,
      score_b: payload.scoreB,
    });

    await client.upsertGameParticipants(auth.token, recordClubId, game.id, [
      { player_id: payload.sideAPlayerIds[0], side: 'A' },
      { player_id: payload.sideAPlayerIds[1], side: 'A' },
      { player_id: payload.sideBPlayerIds[0], side: 'B' },
      { player_id: payload.sideBPlayerIds[1], side: 'B' },
    ]);

    await refresh();
  }

  async function handleRecordSeasonChange(seasonId: number) {
    if (!auth) return;
    try {
      setRecordSeasonId(seasonId);
      setRecordContextError(null);

      let seasonSessions = sessionsBySeason[seasonId];
      if (!seasonSessions) {
        seasonSessions = await client.sessions(auth.token, recordClubId, seasonId);
        setSessionsBySeason((prev) => ({ ...prev, [seasonId]: seasonSessions ?? [] }));
      }
      const picked = selectSingleOpenSession(seasonSessions ?? []);
      setRecordSession(picked.session);
      setRecordContextError(picked.error);
    } catch (e) {
      setRecordSession(null);
      setRecordContextError(e instanceof Error ? e.message : 'Failed to load session for the selected season.');
    }
  }

  async function handleRecordClubChange(clubId: number) {
    if (!auth) return;
    const canRecord =
      profile?.role === 'CLUB_ADMIN' ||
      profile?.role === 'RECORDER' ||
      profile?.club_role === 'CLUB_ADMIN' ||
      profile?.club_role === 'RECORDER';
    if (!canRecord) return;
    try {
      setSelectedProfilePlayerId(null);
      setRecordClubId(clubId);
      setRecordContextError(null);

      const [seasonsRes, playersRes, courtsRes] = await Promise.allSettled([
        client.seasons(auth.token, clubId, true),
        client.players(auth.token, clubId),
        client.courts(auth.token, clubId),
      ]);

      if (playersRes.status === 'fulfilled') {
        setRecordPlayers(playersRes.value);
      } else {
        setRecordPlayers([]);
      }

      if (courtsRes.status === 'fulfilled') {
        setRecordCourts(courtsRes.value);
      } else {
        setRecordCourts([]);
      }

      if (seasonsRes.status !== 'fulfilled') {
        setRecordSeasons([]);
        setRecordSeasonId(null);
        setRecordSession(null);
        setRecordContextError(seasonsRes.reason instanceof Error ? seasonsRes.reason.message : 'Failed to load open seasons.');
        return;
      }

      const openSeasons = listOpenSeasons(seasonsRes.value);
      setRecordSeasons(openSeasons);

      if (!openSeasons.length) {
        setRecordSeasonId(null);
        setRecordSession(null);
        setRecordContextError('No open seasons available for this club.');
        return;
      }

      const nextSeasonId = openSeasons[0].id;
      setRecordSeasonId(nextSeasonId);
      const sessions = await client.sessions(auth.token, clubId, nextSeasonId);
      setSessionsBySeason((prev) => ({ ...prev, [nextSeasonId]: sessions ?? [] }));
      const picked = selectSingleOpenSession(sessions ?? []);
      setRecordSession(picked.session);
      setRecordContextError(picked.error);
    } catch (e) {
      setRecordSeasons([]);
      setRecordSeasonId(null);
      setRecordSession(null);
      setRecordContextError(e instanceof Error ? e.message : 'Failed to load add game options.');
    }
  }

  async function handleCreateSeason(payload: {
    name: string;
    format: 'SINGLES' | 'DOUBLES' | 'MIXED_DOUBLES';
    weekday: number;
    start_time_local: string;
    is_active: boolean;
  }) {
    if (!auth) return;
    const isClubAdmin = profile?.club_role === 'CLUB_ADMIN' || profile?.role === 'CLUB_ADMIN';
    if (!isClubAdmin) {
      throw new Error('Only club admins can create seasons.');
    }
    const season = await client.createSeason(auth.token, auth.clubId, {
      ...payload,
      timezone: 'America/Vancouver',
    });
    await loadDashboard(auth.token, auth.clubId, season.id);
    setSuccessMessage(`Season "${season.name}" created.`);
  }

  async function handleOpenRecordSession(args: { fromDate: string; toDate: string; startTime: string }) {
    try {
      if (!auth) return;
      const isClubAdmin = profile?.club_role === 'CLUB_ADMIN' || profile?.role === 'CLUB_ADMIN';
      if (!isClubAdmin) {
        throw new Error('Please contact your club admin to start a new season/session.');
      }
      if (!recordSeasonId) {
        throw new Error('Select a season first.');
      }

      const from = new Date(`${args.fromDate}T00:00:00`);
      const to = new Date(`${args.toDate}T00:00:00`);
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
        throw new Error('Please provide valid from/to dates.');
      }
      if (to.getTime() < from.getTime()) {
        throw new Error('To date must be on or after from date.');
      }

      const time = /^\d{2}:\d{2}$/.test(args.startTime) ? `${args.startTime}:00` : args.startTime;
      await client.updateSeason(auth.token, recordClubId, recordSeasonId, {
        weekday: from.getDay(),
        start_time_local: time,
        timezone: 'America/Vancouver',
      });

      let created = 0;
      let cursor = new Date(from);
      let status: 'OPEN' | 'UPCOMING' = 'OPEN';
      while (cursor.getTime() <= to.getTime()) {
        const dateStr = cursor.toISOString().slice(0, 10);
        await client.createSession(auth.token, recordClubId, {
          season_id: recordSeasonId,
          session_date: dateStr,
          status,
          location: 'Club Session',
          address: 'TBD',
        });
        created += 1;
        status = 'UPCOMING';
        cursor.setDate(cursor.getDate() + 7);
      }

      await handleRecordSeasonChange(recordSeasonId);
      await loadDashboard(auth.token, auth.clubId, selectedSeasonId ?? undefined);
      setSuccessMessage(`Opened session plan: ${created} session(s) created from ${args.fromDate} to ${args.toDate}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open session.');
    }
  }

  async function handleProfilePlayerChange(playerId: number) {
    if (!auth) return;
    setSelectedProfilePlayerId(playerId);
    await loadDashboard(auth.token, auth.clubId, selectedSeasonId ?? undefined, playerId);
  }

  if (!auth) {
    return <LoginView onLogin={handleLogin} error={error} loading={loading} />;
  }

  const effectiveRole = String(profile?.club_role ?? profile?.role ?? '').toUpperCase();
  const isClubAdmin = effectiveRole === 'CLUB_ADMIN';
  const isRecorder = effectiveRole === 'RECORDER';
  const canFinalizeSession = Boolean(isClubAdmin && selectedSession?.status === 'CLOSED');
  const canRevertSessionFinalize = Boolean(isClubAdmin && selectedSession?.status === 'FINALIZED');

  return (
    <LeaderboardView
      profile={profile}
      clubs={clubs}
      seasons={seasons}
      selectedClubId={selectedClubId}
      selectedSeasonId={selectedSeasonId}
      selectedSession={selectedSession}
      recordClubId={recordClubId}
      recordSession={recordSession}
      recordSeasonId={recordSeasonId}
      leaderboard={leaderboard}
      loading={loading}
      error={error}
      successMessage={successMessage}
      recordSeasons={recordSeasons}
      players={recordPlayers}
      courts={recordCourts}
      recordContextError={recordContextError}
      profileStats={profileStats}
      eloHistory={eloHistory}
      recentGames={recentGames}
      allGames={allGames}
      upcomingSessions={upcomingSessions}
      allUpcomingSessions={allUpcomingSessions}
      onRecordClubChange={handleRecordClubChange}
      onClubChange={handleClubChange}
      onSeasonChange={handleSeasonChange}
      canCreateSeason={Boolean(isClubAdmin)}
      allowProfilePlayerPick={Boolean(profile?.role === 'GLOBAL_ADMIN' || isClubAdmin)}
      profilePlayers={players}
      selectedProfilePlayerId={selectedProfilePlayerId}
      canFinalizeSession={canFinalizeSession}
      canRevertSessionFinalize={canRevertSessionFinalize}
      showFinalizeAction={Boolean(isClubAdmin)}
      canManageRecords={Boolean(isClubAdmin || isRecorder)}
      onFinalizeSession={handleFinalizeSession}
      onRevertSessionFinalize={handleRevertSessionFinalize}
      onRecordGame={handleRecordGame}
      onRecordSeasonChange={handleRecordSeasonChange}
      onCreateSeason={handleCreateSeason}
      canOpenSession={Boolean(isClubAdmin)}
      onOpenSession={handleOpenRecordSession}
      onProfilePlayerChange={handleProfilePlayerChange}
      onLogout={() => {
        setAuth(null);
        setProfile(null);
        setClubs([]);
        setSeasons([]);
        setPlayers([]);
        setCourts([]);
        setProfileStats({
          singles: 0,
          doubles: 0,
          mixed: 0,
          pointsFor: 0,
          pointsAgainst: 0,
          winPct: 0,
        });
        setEloHistory([]);
        setRecentGames([]);
        setAllGames([]);
        setUpcomingSessions([]);
        setAllUpcomingSessions([]);
        setSelectedProfilePlayerId(null);
        setSelectedSeasonId(null);
        setSelectedSession(null);
        setRecordClubId(DEFAULT_CLUB_ID);
        setRecordSession(null);
        setRecordSeasonId(null);
        setRecordSeasons([]);
        setRecordPlayers([]);
        setRecordCourts([]);
        setRecordContextError(null);
        setSessionsBySeason({});
        setLeaderboard([]);
        setError(null);
        setSuccessMessage(null);
      }}
    />
  );
}
