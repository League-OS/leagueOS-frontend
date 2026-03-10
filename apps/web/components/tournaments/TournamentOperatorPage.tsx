'use client';

import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_CLUB_ID } from '@leagueos/config';
import { createTournamentLiveChannel } from '../../lib/tournamentLive';
import { tournamentsApi, type TournamentMatch } from '../../lib/tournamentsApi';

type Auth = { token: string; clubId: number };

const ADMIN_STORAGE_AUTH = 'leagueos.admin.auth';

export function TournamentOperatorPage({ tournamentId }: { tournamentId: number }) {
  const [auth, setAuth] = useState<Auth | null>(null);
  const [matches, setMatches] = useState<TournamentMatch[]>([]);
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(null);
  const [winnerTeamId, setWinnerTeamId] = useState<number | null>(null);
  const [scoreA, setScoreA] = useState('0');
  const [scoreB, setScoreB] = useState('0');
  const [rallies, setRallies] = useState<string[]>(['0-0']);
  const [serves, setServes] = useState<'A' | 'B'>('A');
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

  async function refreshMatches() {
    if (!auth) return;
    const res = await tournamentsApi.matches(auth.clubId, tournamentId, auth.token);
    setMatches(res.matches);
    if (!selectedMatchId && res.matches[0]) {
      setSelectedMatchId(res.matches[0].id);
      setWinnerTeamId(res.matches[0].team_a_id);
      setScoreA(String(res.matches[0].team_a_points ?? 0));
      setScoreB(String(res.matches[0].team_b_points ?? 0));
    }
  }

  useEffect(() => {
    if (!auth) return;
    void refreshMatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.token, tournamentId]);

  const selectedMatch = useMemo(() => matches.find((m) => m.id === selectedMatchId) ?? null, [matches, selectedMatchId]);

  useEffect(() => {
    if (!selectedMatch) return;
    setWinnerTeamId(selectedMatch.team_a_id);
    setScoreA(String(selectedMatch.team_a_points ?? 0));
    setScoreB(String(selectedMatch.team_b_points ?? 0));
  }, [selectedMatchId, selectedMatch]);

  const live = useMemo(() => createTournamentLiveChannel({ tournamentId, onMessage: () => void refreshMatches() }), [tournamentId, auth?.token]);
  useEffect(() => () => live.close(), [live]);

  function scorePoint(side: 'A' | 'B') {
    setServes(side);
    const a = Number(scoreA);
    const b = Number(scoreB);
    const nextA = side === 'A' ? a + 1 : a;
    const nextB = side === 'B' ? b + 1 : b;
    setScoreA(String(nextA));
    setScoreB(String(nextB));
    setRallies((r) => [...r, `${nextA}-${nextB}`].slice(-60));
    live.publishLocal({ type: 'match_update', matchId: selectedMatchId ?? undefined, payload: { scoreA: nextA, scoreB: nextB } });
  }

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
      live.publishLocal({ type: 'match_update', matchId: selectedMatchId, payload: { status: 'COMPLETED' } });
      await refreshMatches();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Record failed');
    }
  }

  if (!auth) return <main style={{ padding: 24 }}>Login as admin first.</main>;

  return (
    <main style={{ minHeight: '100vh', padding: 16, background: '#f3f6fb', display: 'grid', gap: 12 }}>
      <section style={{ border: '1px solid #d8e0ee', borderRadius: 14, padding: 14, background: '#fff' }}>
        <h1 style={{ margin: 0 }}>Courtside Scoring</h1>
        <p style={{ color: '#5d6b86', marginTop: 6 }}>Dedicated scoring surface for scorer/umpire.</p>
        {error ? <div style={{ background: '#fff1f2', border: '1px solid #fecaca', padding: 10, borderRadius: 8 }}>{error}</div> : null}

        <div style={{ marginTop: 8 }}>
          <select value={selectedMatchId ?? ''} onChange={(e) => setSelectedMatchId(Number(e.target.value))} style={{ width: '100%' }}>
            <option value="">Select match</option>
            {matches.map((m) => <option key={m.id} value={m.id}>#{m.id} · {m.stage} · {m.team_a_name} vs {m.team_b_name}</option>)}
          </select>
        </div>

        <div style={{ textAlign: 'center', fontSize: 56, fontWeight: 900, marginTop: 8 }}>{scoreA} - {scoreB}</div>
        <div style={{ textAlign: 'center', color: '#475569' }}>Server: Team {serves}</div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8, marginTop: 10 }}>
          <button onClick={() => scorePoint('A')}>+1 Team A</button>
          <button onClick={() => scorePoint('B')}>+1 Team B</button>
          <button onClick={() => setRallies((r) => (r.length > 1 ? r.slice(0, -1) : r))}>Undo</button>
        </div>

        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <select value={winnerTeamId ?? ''} onChange={(e) => setWinnerTeamId(Number(e.target.value))}>
            <option value={selectedMatch?.team_a_id ?? ''}>{selectedMatch?.team_a_name ?? 'Team A'}</option>
            <option value={selectedMatch?.team_b_id ?? ''}>{selectedMatch?.team_b_name ?? 'Team B'}</option>
          </select>
          <button onClick={onRecord}>Finalize Result</button>
        </div>

        <div style={{ marginTop: 10, border: '1px solid #d8e0ee', borderRadius: 10, padding: 8, background: '#f8fbff' }}>
          {rallies.slice(-18).map((r, idx) => (
            <span key={`${r}-${idx}`} style={{ display: 'inline-block', marginRight: 8, marginBottom: 6, padding: '4px 8px', border: '1px solid #d5deee', borderRadius: 999, background: idx === rallies.length - 1 ? '#e5f7ee' : '#eaf0fa' }}>{r}</span>
          ))}
        </div>
      </section>
    </main>
  );
}
