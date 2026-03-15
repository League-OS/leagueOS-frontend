'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRecordGameState } from '../hooks/useRecordGameState';
import { ApiError, LeagueOsApiClient } from '@leagueos/api';
import {
  DEFAULT_API_BASE_URL,
  DEFAULT_CLUB_ID,
  DEFAULT_SESSION_ADDRESS,
  DEFAULT_SESSION_LOCATION,
  DEFAULT_TIMEZONE,
  FEATURE_FLAGS,
} from '@leagueos/config';
import type { Club, Court, FeatureFlag, Game, GameParticipant, LeaderboardEntry, NotificationInboxItem, Player, Profile, Season, Session, TeamLeaderboardEntry } from '@leagueos/schemas';
import {
  combineSessionDateAndTimeToIso,
  listOpenSeasons,
  selectSingleOpenSession,
} from '../components/addGameLogic';
import {
  LeaderboardView,
  type EloHistoryRow,
  type HomeGameRow,
  type InboxNotificationRow,
  type PlayerTournamentRow,
  type ProfileStatSummary,
  type UpcomingRow,
} from '../components/LeaderboardView';
import { LoginView } from '../components/LoginView';
import type { AuthState } from '../components/types';
import { formatSequentialFinalizeBlockedError } from '../components/lib/apiErrorMessages';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;
const ADMIN_STORAGE_AUTH = 'leagueos.admin.auth';
const ADMIN_STORAGE_PROFILE = 'leagueos.admin.profile';
const PLAYER_STORAGE_AUTH = 'leagueos.player.auth';
const PLAYER_STORAGE_PROFILE = 'leagueos.player.profile';

function parseStoredAuth(raw: string | null): AuthState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { token?: unknown; clubId?: unknown };
    const token = typeof parsed.token === 'string' ? parsed.token : '';
    const clubIdValue =
      typeof parsed.clubId === 'number'
        ? parsed.clubId
        : typeof parsed.clubId === 'string'
          ? Number.parseInt(parsed.clubId, 10)
          : Number.NaN;
    if (!token || !Number.isInteger(clubIdValue)) return null;
    return { token, clubId: clubIdValue };
  } catch {
    return null;
  }
}

function isUnauthorizedError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

function formatMonthDay(dateish: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateish)) {
    const [y, m, d] = dateish.split('-').map(Number);
    const localDate = new Date(y, (m || 1) - 1, d || 1);
    if (Number.isNaN(localDate.getTime())) return dateish;
    return localDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  const value = new Date(dateish);
  if (Number.isNaN(value.getTime())) return dateish;
  return value.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function latestSeasonByCreatedAt(seasons: Season[]): Season | null {
  if (!seasons.length) return null;
  return [...seasons].sort((a, b) => {
    const createdA = Date.parse(a.created_at);
    const createdB = Date.parse(b.created_at);
    if (!Number.isNaN(createdA) && !Number.isNaN(createdB) && createdA !== createdB) return createdB - createdA;
    return b.id - a.id;
  })[0] ?? null;
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
  const { record, updateRecord, resetRecord } = useRecordGameState(DEFAULT_CLUB_ID);
  const [sessionsBySeason, setSessionsBySeason] = useState<Record<number, Session[]>>({});
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [teamLeaderboard, setTeamLeaderboard] = useState<TeamLeaderboardEntry[]>([]);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>([]);
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
  const [openTournaments, setOpenTournaments] = useState<PlayerTournamentRow[]>([]);
  const [inboxNotifications, setInboxNotifications] = useState<InboxNotificationRow[]>([]);
  const [upcomingSessions, setUpcomingSessions] = useState<UpcomingRow[]>([]);
  const [allUpcomingSessions, setAllUpcomingSessions] = useState<UpcomingRow[]>([]);
  const [selectedProfilePlayerId, setSelectedProfilePlayerId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [hydratingAuth, setHydratingAuth] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  function clearPlayerSessionAndShowLogin() {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(PLAYER_STORAGE_AUTH);
      window.localStorage.removeItem(PLAYER_STORAGE_PROFILE);
    }
    setAuth(null);
    setProfile(null);
    setError(null);
    setSuccessMessage(null);
    setInboxNotifications([]);
  }

  const enableTeamRanking = useMemo(
    () => featureFlags.some((flag) => flag.key === FEATURE_FLAGS.TEAM_RANKING && flag.enabled),
    [featureFlags],
  );

  async function loadDashboard(token: string, clubId: number, seasonId?: number, profilePlayerId?: number | null) {
    setLoading(true);
    setError(null);
    try {
      const [meRes, seasonsRes, playersRes, courtsRes, tournamentsRes, inboxRes] = await Promise.allSettled([
        client.profile(token),
        client.seasons(token, clubId),
        client.players(token, clubId),
        client.courts(token, clubId),
        client.tournaments(token, clubId),
        client.notificationInbox(token, clubId),
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
                name: `Club ${clubId}`,
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
      updateRecord({ seasons: openRecordSeasons, clubId });

      if (playersRes.status === 'fulfilled') {
        setPlayers(playersRes.value);
        updateRecord({ players: playersRes.value });
      } else {
        setPlayers([]);
        updateRecord({ players: [] });
      }

      if (courtsRes.status === 'fulfilled') {
        setCourts(courtsRes.value);
        updateRecord({ courts: courtsRes.value });
      } else {
        setCourts([]);
        updateRecord({ courts: [] });
      }

      if (tournamentsRes.status === 'fulfilled') {
        const openRows = tournamentsRes.value
          .filter((row) => row.status === 'REGISTRATION_OPEN')
          .sort((a, b) => a.name.localeCompare(b.name));

        const mappedOpen = openRows.map((row): PlayerTournamentRow => {
          const rowWithEnd = row as typeof row & { schedule_end_at?: string | null };
          return {
            id: row.id,
            name: row.name,
            status: row.status,
            timezone: row.timezone,
            startDate: row.schedule_start_at,
            endDate: rowWithEnd.schedule_end_at ?? null,
            formatsCount: row.formats_count ?? 0,
            registrationLink: row.registration_link || `/tournaments/${row.id}?signup=one_click`,
          };
        });
        setOpenTournaments(mappedOpen);
      } else {
        setOpenTournaments([]);
      }

      if (inboxRes.status === 'fulfilled') {
        setInboxNotifications(
          inboxRes.value.map((row: NotificationInboxItem): InboxNotificationRow => ({
            id: row.id,
            title: row.title,
            body: row.body,
            isRead: row.is_read,
            readAt: row.read_at ?? null,
            createdAt: row.created_at,
            createdByLabel: row.created_by_label,
            attachmentFileName: row.attachment_file_name ?? null,
            attachmentContentType: row.attachment_content_type ?? null,
            attachmentSizeBytes: row.attachment_size_bytes ?? null,
          })),
        );
      } else {
        setInboxNotifications([]);
      }

      const seasonList = seasonsRes.value;
      const seasonById = new Map<number, Season>(seasonList.map((season) => [season.id, season]));
      const activeSeasons = seasonList.filter((season) => season.is_active);
      const latestActiveSeason = latestSeasonByCreatedAt(activeSeasons);

      const seasonToLoad = seasonId ?? latestActiveSeason?.id ?? null;
      if (!seasonToLoad) {
        setSelectedSeasonId(null);
        setSelectedSession(null);
        updateRecord({ session: null, seasonId: null, contextError: 'No open seasons available for this club.' });
        setSessionsBySeason({});
        setLeaderboard([]);
        setTeamLeaderboard([]);
        setRecentGames([]);
        setAllGames([]);
        setOpenTournaments([]);
        updateRecord({ existingGames: [] });
        setInboxNotifications([]);
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
      const nextFeatureFlags = await client.featureFlags(token).catch(() => [] as FeatureFlag[]);
      setFeatureFlags(nextFeatureFlags);
      const isTeamRankingEnabled = nextFeatureFlags.some(
        (flag) => flag.key === FEATURE_FLAGS.TEAM_RANKING && flag.enabled,
      );
      const [data, teamData] = await Promise.all([
        client.seasonLeaderboard(token, clubId, seasonToLoad),
        isTeamRankingEnabled ? client.seasonTeamLeaderboard(token, clubId, seasonToLoad) : Promise.resolve([]),
      ]);
      setSelectedSession(data.session);
      setLeaderboard(data.leaderboard);
      setTeamLeaderboard(teamData);

      // Fetch all sessions for the club in one request, then group by season client-side.
      // Previously: N parallel requests (one per season). Now: 1 request.
      const allSessions = await client.sessions(token, clubId);
      const nextSessionsBySeason: Record<number, Session[]> = {};
      for (const session of allSessions) {
        const sid = session.season_id;
        if (!nextSessionsBySeason[sid]) nextSessionsBySeason[sid] = [];
        nextSessionsBySeason[sid].push(session);
      }
      setSessionsBySeason(nextSessionsBySeason);
      const sessionById = new Map<number, Session>(allSessions.map((session) => [session.id, session]));
      const clubById = new Map<number, Club>();
      for (const club of [...profileClubSet, ...adminClubSet]) {
        clubById.set(club.id, club);
      }

      if (!openRecordSeasons.length) {
        updateRecord({ seasonId: null, session: null, contextError: 'No open seasons available for this club.' });
      } else {
        const initialRecordSeasonId = latestSeasonByCreatedAt(openRecordSeasons)?.id ?? openRecordSeasons[0].id;
        const picked = selectSingleOpenSession(nextSessionsBySeason[initialRecordSeasonId] ?? []);
        updateRecord({ seasonId: initialRecordSeasonId, session: picked.session, contextError: picked.error });
      }

      // Compute effectivePlayerId early so we can pass it to playerEloHistory.
      const currentUserPlayerId = findUserPlayerId(meRes.value, playersRes.status === 'fulfilled' ? playersRes.value : []);
      const effectivePlayerId = profilePlayerId ?? selectedProfilePlayerId ?? currentUserPlayerId;

      const [games, eloHistoryEntries] = await Promise.all([
        // include_participants=true: all participants come back embedded in one request
        // instead of one GET /games/{id}/participants call per game.
        client.games(token, clubId, undefined, undefined, undefined, true),
        // playerEloHistory: one request for all seasons' Elo data, replacing the
        // old pattern of one GET /sessions/{id}/leaderboard call per season.
        client.playerEloHistory(token, clubId, effectivePlayerId ?? undefined).catch(() => []),
      ]);

      // Build participantsByGame from the embedded participants field.
      const participantsByGame = new Map<number, GameParticipant[]>();
      for (const game of games) {
        participantsByGame.set(game.id, game.participants ?? []);
      }
      const sourceGames = effectivePlayerId
        ? games.filter((game) => (participantsByGame.get(game.id) ?? []).some((p) => p.player_id === effectivePlayerId))
        : games;
      const finalizedSourceGames = sourceGames.filter((game) => (game.status ?? 'CREATED') === 'FINALIZED');
      const courtNameById = new Map<number, string>((courtsRes.status === 'fulfilled' ? courtsRes.value : []).map((court) => [court.id, court.name]));

      const mapGameRow = (game: (typeof games)[number], playerIdForView: number | null): HomeGameRow => {
        const participants = participantsByGame.get(game.id) ?? [];
        const sideA = participants.filter((p) => p.side === 'A').map((p) => p.display_name);
        const sideB = participants.filter((p) => p.side === 'B').map((p) => p.display_name);
        const sideAIds = participants.filter((p) => p.side === 'A').map((p) => p.player_id);
        const sideBIds = participants.filter((p) => p.side === 'B').map((p) => p.player_id);
        const session = sessionById.get(game.session_id);
        const season = session ? seasonById.get(session.season_id) : undefined;
        const computed = outcomeForGame(game, participants, playerIdForView);
        const partner = partnerNameForGame({
          participants,
          mySide: computed.mySide,
          userPlayerId: playerIdForView,
        });
        return {
          id: game.id,
          sessionId: game.session_id,
          sessionStatus: session?.status,
          status: game.status ?? 'CREATED',
          createdBy: game.created_by_label ?? 'Unknown',
          date: formatMonthDay(session?.session_date ?? game.start_time),
          season: season?.name ?? `Season ${session?.season_id ?? '-'}`,
          partner,
          score: computed.outcome,
          outcome: computed.outcome,
          startTime: game.start_time,
          courtId: game.court_id,
          courtName: courtNameById.get(game.court_id) ?? `Court ${game.court_id}`,
          teamA: sideA,
          teamB: sideB,
          teamAIds: sideAIds,
          teamBIds: sideBIds,
          scoreA: game.score_a,
          scoreB: game.score_b,
        };
      };

      const mappedGames = [...sourceGames]
        .sort((a, b) => b.start_time.localeCompare(a.start_time))
        .map((game) => mapGameRow(game, effectivePlayerId));

      const mappedRecordGames = [...games]
        .sort((a, b) => b.start_time.localeCompare(a.start_time))
        .map((game) => mapGameRow(game, null));

      setAllGames(mappedGames);
      setRecentGames(mappedGames.slice(0, 5));
      updateRecord({ existingGames: mappedRecordGames });

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
            ? clubById.get(season.club_id)?.name ?? `Club ${season.club_id}`
            : `Club ${clubId}`;
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

      for (const game of finalizedSourceGames) {
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

      const totalGames = finalizedSourceGames.length;
      const winPct = totalGames ? Number(((wins / totalGames) * 100).toFixed(1)) : 0;
      setProfileStats({ singles, doubles, mixed, pointsFor, pointsAgainst, winPct });

      const eloRows: EloHistoryRow[] = eloHistoryEntries.map((entry) => ({
        season: entry.season_name,
        club: clubById.get(entry.club_id)?.name ?? `Club ${entry.club_id}`,
        elo: entry.global_elo_score,
        change: entry.season_elo_delta,
      }));
      setEloHistory(eloRows);
    } catch (e) {
      if (isUnauthorizedError(e)) {
        clearPlayerSessionAndShowLogin();
        return;
      }
      setError(e instanceof Error ? e.message : 'Unexpected error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined') {
      setHydratingAuth(false);
      return;
    }

    const restore = async () => {
      try {
        const parsed = parseStoredAuth(window.localStorage.getItem(PLAYER_STORAGE_AUTH));
        if (!parsed) {
          setHydratingAuth(false);
          return;
        }

        setAuth(parsed);
        setSelectedClubId(parsed.clubId);

        const rawProfile = window.localStorage.getItem(PLAYER_STORAGE_PROFILE);
        if (rawProfile) {
          try {
            setProfile(JSON.parse(rawProfile) as Profile);
          } catch {
            window.localStorage.removeItem(PLAYER_STORAGE_PROFILE);
          }
        }

        await loadDashboard(parsed.token, parsed.clubId);
      } catch (e) {
        if (isUnauthorizedError(e)) {
          clearPlayerSessionAndShowLogin();
        }
      } finally {
        setHydratingAuth(false);
      }
    };

    void restore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || hydratingAuth) return;
    if (!auth) {
      window.localStorage.removeItem(PLAYER_STORAGE_AUTH);
      return;
    }
    window.localStorage.setItem(PLAYER_STORAGE_AUTH, JSON.stringify(auth));
  }, [auth, hydratingAuth]);

  useEffect(() => {
    if (typeof window === 'undefined' || hydratingAuth) return;
    if (!profile) {
      window.localStorage.removeItem(PLAYER_STORAGE_PROFILE);
      return;
    }
    window.localStorage.setItem(PLAYER_STORAGE_PROFILE, JSON.stringify(profile));
  }, [profile, hydratingAuth]);

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
      const me = await client.profile(nextAuth.token);
      const loginRole = String(res.role || '').toUpperCase();
      const effectiveRole = String(
        loginRole === 'GLOBAL_ADMIN' ? 'GLOBAL_ADMIN' : (me.role === 'GLOBAL_ADMIN' ? me.role : (me.club_role ?? me.role ?? '')),
      ).toUpperCase();

      if (effectiveRole === 'CLUB_ADMIN' || effectiveRole === 'GLOBAL_ADMIN') {
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(ADMIN_STORAGE_AUTH, JSON.stringify(nextAuth));
          window.localStorage.setItem(ADMIN_STORAGE_PROFILE, JSON.stringify(me));
          window.location.assign('/admin');
        }
        return;
      }

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
      if (e instanceof ApiError && e.code === 'SEQUENTIAL_FINALIZE_BLOCKED') {
        setError(formatSequentialFinalizeBlockedError(e));
      } else {
        setError(e instanceof Error ? e.message : 'Failed to finalize session.');
      }
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
    const effectiveRole = String(profile?.club_role ?? profile?.role ?? '').toUpperCase();
    const canRecord =
      effectiveRole === 'CLUB_ADMIN' || effectiveRole === 'RECORDER' || effectiveRole === 'USER';
    if (!canRecord) {
      throw new Error('Only club members with recording access can record games.');
    }
    const sessionToUse = record.session;
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
    if (payload.scoreA === payload.scoreB) {
      throw new Error('No tied scores allowed.');
    }

    const allPlayerIds = [...payload.sideAPlayerIds, ...payload.sideBPlayerIds];
    if (new Set(allPlayerIds).size !== allPlayerIds.length) {
      throw new Error('Player appears more than once in this game. Choose 4 unique players.');
    }

    const [h, m] = payload.startTimeLocal.split(':').map(Number);
    if (!Number.isInteger(h) || !Number.isInteger(m) || m % 5 !== 0) {
      throw new Error('Start time must be aligned to 5-minute increments.');
    }

    // Client-side precheck for UNIQUE(session, court, start time) before API create.
    const existingGames = await client.games(auth.token, record.clubId);
    const hasConflict = existingGames.some((game) => {
      if (game.session_id !== sessionToUse.id || game.court_id !== payload.courtId) return false;
      const start = new Date(game.start_time);
      if (Number.isNaN(start.getTime())) return false;
      return start.getHours() === h && start.getMinutes() === m;
    });
    if (hasConflict) {
      throw new Error('A game already exists for this session, court, and start time.');
    }

    const game = await client.createGame(auth.token, record.clubId, {
      session_id: sessionToUse.id,
      court_id: payload.courtId,
      start_time: startTimeIso,
      score_a: payload.scoreA,
      score_b: payload.scoreB,
    });

    await client.upsertGameParticipants(auth.token, record.clubId, game.id, [
      { player_id: payload.sideAPlayerIds[0], side: 'A' },
      { player_id: payload.sideAPlayerIds[1], side: 'A' },
      { player_id: payload.sideBPlayerIds[0], side: 'B' },
      { player_id: payload.sideBPlayerIds[1], side: 'B' },
    ]);

    await refresh();
  }

  function toLocalDateOnly(isoLike: string): string | null {
    const parsed = new Date(isoLike);
    if (Number.isNaN(parsed.getTime())) return null;
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  async function handleUpdateGame(gameId: number, payload: {
    courtId: number | null;
    startTimeLocal: string;
    scoreA: number;
    scoreB: number;
    sideAPlayerIds: [number, number];
    sideBPlayerIds: [number, number];
  }) {
    if (!auth) return;
    const effectiveRole = String(profile?.club_role ?? profile?.role ?? '').toUpperCase();
    const canRecord =
      effectiveRole === 'CLUB_ADMIN' || effectiveRole === 'RECORDER' || effectiveRole === 'USER';
    if (!canRecord) {
      throw new Error('Only club members with recording access can update games.');
    }

    if (!payload.courtId) {
      throw new Error('Please select a court.');
    }
    if (payload.scoreA === payload.scoreB) {
      throw new Error('No tied scores allowed.');
    }

    const allPlayerIds = [...payload.sideAPlayerIds, ...payload.sideBPlayerIds];
    if (new Set(allPlayerIds).size !== allPlayerIds.length) {
      throw new Error('Player appears more than once in this game. Choose 4 unique players.');
    }

    const targetGame = (record.existingGames.find((game) => game.id === gameId) ?? allGames.find((game) => game.id === gameId)) ?? null;
    if (!targetGame) {
      throw new Error('Game not found.');
    }
    if (targetGame.sessionStatus === 'FINALIZED') {
      throw new Error('This game belongs to a finalized session and cannot be edited.');
    }

    const gameDate = toLocalDateOnly(targetGame.startTime);
    const startTimeIso = gameDate ? combineSessionDateAndTimeToIso(gameDate, payload.startTimeLocal) : null;
    if (!startTimeIso) {
      throw new Error('Invalid start time. Please pick a valid time in 5-minute increments.');
    }

    const [h, m] = payload.startTimeLocal.split(':').map(Number);
    if (!Number.isInteger(h) || !Number.isInteger(m) || m % 5 !== 0) {
      throw new Error('Start time must be aligned to 5-minute increments.');
    }

    const existingGames = await client.games(auth.token, record.clubId);
    const hasConflict = existingGames.some((game) => {
      if (game.id === gameId) return false;
      if (game.session_id !== targetGame.sessionId || game.court_id !== payload.courtId) return false;
      const start = new Date(game.start_time);
      if (Number.isNaN(start.getTime())) return false;
      return start.getHours() === h && start.getMinutes() === m;
    });
    if (hasConflict) {
      throw new Error('A game already exists for this session, court, and start time.');
    }

    await client.updateGame(auth.token, record.clubId, gameId, {
      court_id: payload.courtId,
      start_time: startTimeIso,
      score_a: payload.scoreA,
      score_b: payload.scoreB,
    });
    await client.upsertGameParticipants(auth.token, record.clubId, gameId, [
      { player_id: payload.sideAPlayerIds[0], side: 'A' },
      { player_id: payload.sideAPlayerIds[1], side: 'A' },
      { player_id: payload.sideBPlayerIds[0], side: 'B' },
      { player_id: payload.sideBPlayerIds[1], side: 'B' },
    ]);

    await refresh();
    setSuccessMessage('Game updated.');
  }

  async function handleRecordSeasonChange(seasonId: number) {
    if (!auth) return;
    try {
      updateRecord({ seasonId, contextError: null });

      let seasonSessions = sessionsBySeason[seasonId];
      if (!seasonSessions) {
        seasonSessions = await client.sessions(auth.token, record.clubId, seasonId);
        setSessionsBySeason((prev) => ({ ...prev, [seasonId]: seasonSessions ?? [] }));
      }
      const picked = selectSingleOpenSession(seasonSessions ?? []);
      updateRecord({ session: picked.session, contextError: picked.error });
    } catch (e) {
      updateRecord({ session: null, contextError: e instanceof Error ? e.message : 'Failed to load session for the selected season.' });
    }
  }

  async function handleRecordClubChange(clubId: number) {
    if (!auth) return;
    const canRecord =
      profile?.role === 'CLUB_ADMIN' ||
      profile?.role === 'RECORDER' ||
      profile?.role === 'USER' ||
      profile?.club_role === 'CLUB_ADMIN' ||
      profile?.club_role === 'RECORDER' ||
      profile?.club_role === 'USER';
    if (!canRecord) return;
    try {
      setSelectedProfilePlayerId(null);
      updateRecord({ clubId, contextError: null });

      const [seasonsRes, playersRes, courtsRes] = await Promise.allSettled([
        client.seasons(auth.token, clubId, true),
        client.players(auth.token, clubId),
        client.courts(auth.token, clubId),
      ]);

      updateRecord({
        players: playersRes.status === 'fulfilled' ? playersRes.value : [],
        courts: courtsRes.status === 'fulfilled' ? courtsRes.value : [],
      });

      if (seasonsRes.status !== 'fulfilled') {
        updateRecord({
          seasons: [],
          seasonId: null,
          session: null,
          contextError: seasonsRes.reason instanceof Error ? seasonsRes.reason.message : 'Failed to load open seasons.',
        });
        return;
      }

      const openSeasons = listOpenSeasons(seasonsRes.value);
      updateRecord({ seasons: openSeasons });

      if (!openSeasons.length) {
        updateRecord({ seasonId: null, session: null, contextError: 'No open seasons available for this club.' });
        return;
      }

      const nextSeasonId = latestSeasonByCreatedAt(openSeasons)?.id ?? openSeasons[0].id;
      const sessions = await client.sessions(auth.token, clubId, nextSeasonId);
      setSessionsBySeason((prev) => ({ ...prev, [nextSeasonId]: sessions ?? [] }));
      const picked = selectSingleOpenSession(sessions ?? []);
      updateRecord({ seasonId: nextSeasonId, session: picked.session, contextError: picked.error });
    } catch (e) {
      updateRecord({
        seasons: [],
        seasonId: null,
        session: null,
        contextError: e instanceof Error ? e.message : 'Failed to load add game options.',
      });
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
      timezone: DEFAULT_TIMEZONE,
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
      if (!record.seasonId) {
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
      await client.updateSeason(auth.token, record.clubId, record.seasonId, {
        weekday: from.getDay(),
        start_time_local: time,
        timezone: DEFAULT_TIMEZONE,
      });

      let created = 0;
      let cursor = new Date(from);
      let status: 'OPEN' | 'UPCOMING' = 'OPEN';
      while (cursor.getTime() <= to.getTime()) {
        const y = cursor.getFullYear();
        const m = String(cursor.getMonth() + 1).padStart(2, '0');
        const d = String(cursor.getDate()).padStart(2, '0');
        const dateStr = `${y}-${m}-${d}`;
        const sessionStartIso = combineSessionDateAndTimeToIso(dateStr, time.slice(0, 5));
        if (!sessionStartIso) {
          throw new Error(`Invalid session date/time generated for ${dateStr} ${time}.`);
        }
        await client.createSession(auth.token, record.clubId, {
          season_id: record.seasonId,
          session_start_time: sessionStartIso,
          status,
          location: DEFAULT_SESSION_LOCATION,
          address: DEFAULT_SESSION_ADDRESS,
        });
        created += 1;
        status = 'UPCOMING';
        cursor.setDate(cursor.getDate() + 7);
      }

      await handleRecordSeasonChange(record.seasonId);
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

  async function handleToggleLeaderboardVisibility(visible: boolean) {
    if (!auth) return;
    const previousProfile = profile;
    try {
      setError(null);
      setProfile((current) => (current ? { ...current, show_on_leaderboard: visible } : current));
      const updated = await client.updateProfile(auth.token, { show_on_leaderboard: visible });
      setProfile(updated);
      setSuccessMessage(visible ? 'Your name will appear on leaderboards.' : 'Your name is now hidden from leaderboards.');
      await loadDashboard(auth.token, auth.clubId, selectedSeasonId ?? undefined, selectedProfilePlayerId);
    } catch (e) {
      setProfile(previousProfile);
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Failed to update leaderboard privacy preference.';
      setError(msg);
    }
  }

  async function handleUpdateProfileDetails(payload: { full_name?: string; display_name?: string }) {
    if (!auth) return;
    const previousProfile = profile;
    try {
      setError(null);
      const updated = await client.updateProfile(auth.token, payload);
      setProfile(updated);
      setSuccessMessage('Profile settings updated.');
    } catch (e) {
      setProfile(previousProfile);
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Failed to update profile settings.';
      setError(msg);
      throw new Error(msg);
    }
  }

  if (hydratingAuth) {
    return (
      <main
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#eef5ff',
          color: '#0f172a',
          fontWeight: 600,
        }}
      >
        Restoring your session…
      </main>
    );
  }

  if (!auth) {
    return <LoginView onLogin={handleLogin} error={error} loading={loading} />;
  }

  const effectiveRole = String(profile?.club_role ?? profile?.role ?? '').toUpperCase();
  const isClubAdmin = effectiveRole === 'CLUB_ADMIN';
  const isRecorder = effectiveRole === 'RECORDER';
  const isUser = effectiveRole === 'USER';
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
      recordClubId={record.clubId}
      recordSession={record.session}
      recordSeasonId={record.seasonId}
        leaderboard={leaderboard}
        teamLeaderboard={teamLeaderboard}
        enableTeamRanking={enableTeamRanking}
      loading={loading}
      error={error}
      successMessage={successMessage}
      recordSeasons={record.seasons}
      players={record.players}
      courts={record.courts}
      recordContextError={record.contextError}
      profileStats={profileStats}
      eloHistory={eloHistory}
      recentGames={recentGames}
      allGames={allGames}
      openTournaments={openTournaments}
      inboxNotifications={inboxNotifications}
      recordExistingGames={record.existingGames}
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
      canManageRecords={Boolean(isClubAdmin || isRecorder || isUser)}
      onFinalizeSession={handleFinalizeSession}
      onRevertSessionFinalize={handleRevertSessionFinalize}
      onRecordGame={handleRecordGame}
      onUpdateGame={handleUpdateGame}
      onRecordSeasonChange={handleRecordSeasonChange}
      onCreateSeason={handleCreateSeason}
      canOpenSession={Boolean(isClubAdmin)}
      onOpenSession={handleOpenRecordSession}
      onProfilePlayerChange={handleProfilePlayerChange}
      onToggleLeaderboardVisibility={handleToggleLeaderboardVisibility}
      onUpdateProfileDetails={handleUpdateProfileDetails}
      onMarkNotificationRead={async (notificationId) => {
        if (!auth) return;
        await client.markNotificationRead(auth.token, auth.clubId, notificationId);
        setInboxNotifications((prev) => prev.map((item) => (
          item.id === notificationId
            ? { ...item, isRead: true, readAt: item.readAt ?? new Date().toISOString() }
            : item
        )));
      }}
      onMarkAllNotificationsRead={async () => {
        if (!auth) return;
        await client.markAllNotificationsRead(auth.token, auth.clubId);
        const readAt = new Date().toISOString();
        setInboxNotifications((prev) => prev.map((item) => ({ ...item, isRead: true, readAt })));
      }}
      onLoadNotificationAttachment={async (notificationId) => {
        if (!auth) throw new Error('Not authenticated');
        return client.fetchNotificationAttachment(auth.token, auth.clubId, notificationId);
      }}
      onLogout={() => {
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem(PLAYER_STORAGE_AUTH);
          window.localStorage.removeItem(PLAYER_STORAGE_PROFILE);
        }
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
        setOpenTournaments([]);
        setInboxNotifications([]);
        setUpcomingSessions([]);
        setAllUpcomingSessions([]);
        setSelectedProfilePlayerId(null);
        setSelectedSeasonId(null);
        setSelectedSession(null);
        resetRecord();
        setSessionsBySeason({});
        setLeaderboard([]);
        setError(null);
        setSuccessMessage(null);
      }}
    />
  );
}
