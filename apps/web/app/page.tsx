'use client';

import { useMemo, useState } from 'react';
import { LeagueOsApiClient } from '@leagueos/api';
import { DEFAULT_CLUB_ID } from '@leagueos/config';
import type { Club, Court, LeaderboardEntry, Player, Profile, Season, Session } from '@leagueos/schemas';
import { LeaderboardView } from '../components/LeaderboardView';
import { LoginView } from '../components/LoginView';
import type { AuthState } from '../components/types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8000';
const CLUB_NAME_FALLBACK: Record<number, string> = {
  1: 'Fraser Valley Badminton Club',
};

function pickWritableSession(sessions: Session[]): Session | null {
  const sorted = [...sessions].sort((a, b) => {
    const byDate = b.session_date.localeCompare(a.session_date);
    if (byDate !== 0) return byDate;
    return b.id - a.id;
  });
  return sorted.find((s) => s.status === 'OPEN') ?? sorted.find((s) => s.status === 'CLOSED') ?? null;
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

      // /clubs is global-admin scoped in this backend; keep selected club as local context.
      setClubs([
        {
          id: clubId,
          name: CLUB_NAME_FALLBACK[clubId] ?? `Club ${clubId}`,
          created_at: new Date().toISOString(),
        },
      ]);

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

      const seasonToLoad = seasonId ?? seasonList[0]?.id;
      if (!seasonToLoad) {
        setSelectedSeasonId(null);
        setSelectedSession(null);
        setRecordSession(null);
        setRecordSeasonId(null);
        setSessionsBySeason({});
        setLeaderboard([]);
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

      // Record Game season defaults to currently selected season.
      setRecordSeasonId(seasonToLoad);
      const inSelectedSeason = pickWritableSession(nextSessionsBySeason[seasonToLoad] ?? []);
      const inAnySeason = seasonList
        .map((s) => pickWritableSession(nextSessionsBySeason[s.id] ?? []))
        .find((s): s is Session => Boolean(s));
      setRecordSession(inSelectedSeason ?? inAnySeason ?? null);
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
