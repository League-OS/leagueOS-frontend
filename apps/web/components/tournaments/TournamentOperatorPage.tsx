'use client';

import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_CLUB_ID } from '@leagueos/config';
import { createTournamentLiveChannel } from '../../lib/tournamentLive';
import { tournamentsApi } from '../../lib/tournamentsApi';

type Auth = { token: string; clubId: number };

const ADMIN_STORAGE_AUTH = 'leagueos.admin.auth';

export function TournamentOperatorPage({ tournamentId }: { tournamentId: number }) {
  const [auth, setAuth] = useState<Auth | null>(null);
  const [matches, setMatches] = useState<any[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);
  const [winnerTeamId, setWinnerTeamId] = useState<number | null>(null);
  const [scoreA, setScoreA] = useState('21');
  const [scoreB, setScoreB] = useState('19');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ADMIN_STORAGE_AUTH);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Auth;
      setAuth({ token: parsed.token, clubId: parsed.clubId ?? DEFAULT_CLUB_ID });
    } catch {
      // ignore
    }
  }, []);

  async function refresh() {
    if (!auth) return;
    const tournamentList = await tournamentsApi.list(auth.clubId, auth.token);
    const selectedTournament = tournamentList.find((t) => t.id === tournamentId);
    if (!selectedTournament) return;

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/clubs/${auth.clubId}/tournaments-v2/${tournamentId}/standings`, {
      headers: { Authorization: `Bearer ${auth.token}` },
      cache: 'no-store',
    }).then((r) => r.json());

    const derivedMatches = Array.isArray(res?.matches) ? res.matches : [];
    setMatches(derivedMatches);
    if (derivedMatches[0]) setSelectedMatchId((prev) => prev ?? derivedMatches[0].id);
  }

  useEffect(() => {
    if (!auth) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.token, tournamentId]);

  const live = useMemo(() => {
    const ch = createTournamentLiveChannel({
      tournamentId,
      onMessage: () => void refresh(),
    });
    return ch;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId, auth?.token]);

  useEffect(() => () => live.close(), [live]);

  async function onRecord() {
    if (!auth || !selectedMatchId || !winnerTeamId) return;
    setError(null);
    try {
      await tournamentsApi.recordMatch(auth.clubId, tournamentId, selectedMatchId, auth.token, {
        status: 'COMPLETED',
        completion_reason: 'PLAYED',
        winner_team_id: winnerTeamId,
        team_a_points: Number(scoreA),
        team_b_points: Number(scoreB),
      });
      live.publishLocal({ type: 'match_update', matchId: selectedMatchId });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Record failed');
    }
  }

  if (!auth) return <main style={{ padding: 24 }}>Login as admin first.</main>;

  return (
    <main style={{ padding: 20, display: 'grid', gap: 12 }}>
      <h1 style={{ margin: 0 }}>Live Operator</h1>
      {error ? <div style={{ background: '#fff1f2', border: '1px solid #fecaca', padding: 10, borderRadius: 8 }}>{error}</div> : null}
      <div style={{ display: 'grid', gap: 8, maxWidth: 640 }}>
        <select value={selectedMatchId ?? ''} onChange={(e) => setSelectedMatchId(Number(e.target.value))}>
          <option value="">Select match</option>
          {matches.map((m) => <option key={m.id} value={m.id}>Match #{m.id}</option>)}
        </select>
        <input placeholder="Winner team id" value={winnerTeamId ?? ''} onChange={(e) => setWinnerTeamId(Number(e.target.value))} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <input value={scoreA} onChange={(e) => setScoreA(e.target.value)} placeholder="Team A" />
          <input value={scoreB} onChange={(e) => setScoreB(e.target.value)} placeholder="Team B" />
        </div>
        <button onClick={onRecord}>Record Result</button>
      </div>
    </main>
  );
}
