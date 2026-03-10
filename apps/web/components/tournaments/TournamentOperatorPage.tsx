'use client';

import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_CLUB_ID } from '@leagueos/config';
import { createTournamentLiveChannel } from '../../lib/tournamentLive';
import { tournamentsApi } from '../../lib/tournamentsApi';

type Auth = { token: string; clubId: number };

const ADMIN_STORAGE_AUTH = 'leagueos.admin.auth';

export function TournamentOperatorPage({ tournamentId }: { tournamentId: number }) {
  const [auth, setAuth] = useState<Auth | null>(null);
  const [selectedMatchId, setSelectedMatchId] = useState<number | null>(101);
  const [winnerTeamId, setWinnerTeamId] = useState<number | null>(1);
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

  const live = useMemo(() => createTournamentLiveChannel({ tournamentId, onMessage: () => {} }), [tournamentId]);
  useEffect(() => () => live.close(), [live]);

  function scorePoint(side: 'A' | 'B') {
    setServes(side);
    setScoreA((prev) => {
      const a = Number(prev);
      const b = Number(scoreB);
      const nextA = side === 'A' ? a + 1 : a;
      const nextB = side === 'B' ? b + 1 : b;
      setScoreB(String(nextB));
      setRallies((r) => [...r, `${nextA}-${nextB}`].slice(-60));
      live.publishLocal({ type: 'match_update', matchId: selectedMatchId ?? undefined, payload: { scoreA: nextA, scoreB: nextB } });
      return String(nextA);
    });
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

        <div style={{ textAlign: 'center', fontSize: 56, fontWeight: 900, marginTop: 8 }}>{scoreA} - {scoreB}</div>
        <div style={{ textAlign: 'center', color: '#475569' }}>Server: Team {serves}</div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 8, marginTop: 10 }}>
          <button onClick={() => scorePoint('A')}>+1 Team A</button>
          <button onClick={() => scorePoint('B')}>+1 Team B</button>
          <button onClick={() => setRallies((r) => (r.length > 1 ? r.slice(0, -1) : r))}>Undo</button>
        </div>

        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <input value={selectedMatchId ?? ''} onChange={(e) => setSelectedMatchId(Number(e.target.value))} placeholder="Match id" />
          <input value={winnerTeamId ?? ''} onChange={(e) => setWinnerTeamId(Number(e.target.value))} placeholder="Winner team id" />
        </div>

        <button onClick={onRecord} style={{ marginTop: 10, width: '100%' }}>Finalize Result</button>

        <div style={{ marginTop: 10, border: '1px solid #d8e0ee', borderRadius: 10, padding: 8, background: '#f8fbff' }}>
          {rallies.slice(-18).map((r, idx) => (
            <span key={`${r}-${idx}`} style={{ display: 'inline-block', marginRight: 8, marginBottom: 6, padding: '4px 8px', border: '1px solid #d5deee', borderRadius: 999, background: idx === rallies.length - 1 ? '#e5f7ee' : '#eaf0fa' }}>{r}</span>
          ))}
        </div>
      </section>
    </main>
  );
}
