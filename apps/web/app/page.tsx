'use client';

import { useMemo, useState } from 'react';
import { LeagueOsApiClient } from '@leagueos/api';
import { DEFAULT_CLUB_ID } from '@leagueos/config';
import type { Club, Court, Game, GameParticipant, LeaderboardEntry, Player, Profile, Season, Session } from '@leagueos/schemas';
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

function pickWritableSession(sessions: Session[]): Session | null {
  const sorted = [...sessions].sort((a, b) => {
    const byDate = b.session_date.localeCompare(a.session_date);
    if (byDate !== 0) return byDate;
    return b.id - a.id;
  });
  return sorted.find((s) => s.status === 'OPEN') ?? sorted.find((s) => s.status === 'CLOSED') ?? null;
}

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
  const [recordSession, setRecordSession] = useState<Session | null>(null);
  const [recordSeasonId, setRecordSeasonId] = useState<number | null>(null);
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadDashboard(token: string, clubId: number, seasonId?: number) {
    setLoading(true);
    setError(null);
    try {
      const [meRes, seasonsRes, playersRes, courtsRes] = await Promise.allSettled([
        client.profile(token, clubId),
        client.seasons(token, clubId),
        client.players(token, clubId),
        client.courts(token, clubId),
      ]);

      if (meRes.status === 'fulfilled') {
        setProfile(meRes.value);
      } else {
        throw meRes.reason;
      }

      const clubsRes = await Promise.allSettled([client.profileClubs(token, clubId), client.clubs(token, clubId)]);
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

      if (playersRes.status === 'fulfilled') {
        setPlayers(playersRes.value);
      } else {
        setPlayers([]);
      }

      if (courtsRes.status === 'fulfilled') {
        setCourts(courtsRes.value);
      } else {
        setCourts([]);
      }

      const seasonList = seasonsRes.value;
      const seasonById = new Map<number, Season>(seasonList.map((season) => [season.id, season]));

      const seasonToLoad = seasonId ?? seasonList[0]?.id;
      if (!seasonToLoad) {
        setSelectedSeasonId(null);
        setSelectedSession(null);
        setRecordSession(null);
        setRecordSeasonId(null);
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

      // Record Game season defaults to currently selected season.
      setRecordSeasonId(seasonToLoad);
      const inSelectedSeason = pickWritableSession(nextSessionsBySeason[seasonToLoad] ?? []);
      const inAnySeason = seasonList
        .map((s) => pickWritableSession(nextSessionsBySeason[s.id] ?? []))
        .find((s): s is Session => Boolean(s));
      setRecordSession(inSelectedSeason ?? inAnySeason ?? null);

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
      const sourceGames = currentUserPlayerId
        ? games.filter((game) => (participantsByGame.get(game.id) ?? []).some((p) => p.player_id === currentUserPlayerId))
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
          const computed = outcomeForGame(game, participants, currentUserPlayerId);
          const partner = partnerNameForGame({
            participants,
            mySide: computed.mySide,
            userPlayerId: currentUserPlayerId,
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
        const computed = outcomeForGame(game, participants, currentUserPlayerId);
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
        const currentById = currentUserPlayerId ? candidates.find((row) => row.player_id === currentUserPlayerId) : null;
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

  async function handleLogin(args: { email: string; password: string; clubId: number }) {
    setLoading(true);
    setError(null);
    try {
      const res = await client.login({ email: args.email, password: args.password }, args.clubId);
      const nextAuth = { token: res.token, clubId: args.clubId };
      setSelectedClubId(args.clubId);
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
    setSelectedClubId(clubId);
    setAuth({ ...auth, clubId });
    await loadDashboard(auth.token, clubId);
  }

  async function handleSeasonChange(seasonId: number) {
    if (!auth) return;
    setSelectedSeasonId(seasonId);
    await loadDashboard(auth.token, auth.clubId, seasonId);
  }

  async function refresh() {
    if (!auth) return;
    await loadDashboard(auth.token, auth.clubId, selectedSeasonId ?? undefined);
  }

  async function handleRecordGame(payload: {
    courtId: number;
    startTimeIso: string;
    scoreA: number;
    scoreB: number;
    sideAPlayerIds: [number, number];
    sideBPlayerIds: [number, number];
  }) {
    if (!auth) return;
    const sessionToUse = recordSession ?? selectedSession;
    if (!sessionToUse) {
      throw new Error('No open/closed session available. Create or open a session first.');
    }

    const aligned = new Date(payload.startTimeIso);
    const mins = aligned.getUTCMinutes();
    aligned.setUTCMinutes(Math.floor(mins / 5) * 5, 0, 0);

    const game = await client.createGame(auth.token, auth.clubId, {
      session_id: sessionToUse.id,
      court_id: payload.courtId,
      start_time: aligned.toISOString(),
      score_a: payload.scoreA,
      score_b: payload.scoreB,
    });

    await client.upsertGameParticipants(auth.token, auth.clubId, game.id, [
      { player_id: payload.sideAPlayerIds[0], side: 'A' },
      { player_id: payload.sideAPlayerIds[1], side: 'A' },
      { player_id: payload.sideBPlayerIds[0], side: 'B' },
      { player_id: payload.sideBPlayerIds[1], side: 'B' },
    ]);

    await refresh();
  }

  async function handleRecordSeasonChange(seasonId: number) {
    if (!auth) return;
    setRecordSeasonId(seasonId);

    let seasonSessions = sessionsBySeason[seasonId];
    if (!seasonSessions) {
      seasonSessions = await client.sessions(auth.token, auth.clubId, seasonId);
      setSessionsBySeason((prev) => ({ ...prev, [seasonId]: seasonSessions ?? [] }));
    }
    setRecordSession(pickWritableSession(seasonSessions ?? []));
  }

  if (!auth) {
    return <LoginView onLogin={handleLogin} error={error} loading={loading} />;
  }

  return (
    <LeaderboardView
      profile={profile}
      clubs={clubs}
      seasons={seasons}
      selectedClubId={selectedClubId}
      selectedSeasonId={selectedSeasonId}
      selectedSession={selectedSession}
      recordSession={recordSession}
      recordSeasonId={recordSeasonId}
      leaderboard={leaderboard}
      loading={loading}
      error={error}
      recordSeasons={seasons}
      players={players}
      courts={courts}
      profileStats={profileStats}
      eloHistory={eloHistory}
      recentGames={recentGames}
      allGames={allGames}
      upcomingSessions={upcomingSessions}
      allUpcomingSessions={allUpcomingSessions}
      onClubChange={handleClubChange}
      onSeasonChange={handleSeasonChange}
      onRefresh={refresh}
      onRecordGame={handleRecordGame}
      onRecordSeasonChange={handleRecordSeasonChange}
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
        setSelectedSeasonId(null);
        setSelectedSession(null);
        setRecordSession(null);
        setRecordSeasonId(null);
        setSessionsBySeason({});
        setLeaderboard([]);
        setError(null);
      }}
    />
  );
}
