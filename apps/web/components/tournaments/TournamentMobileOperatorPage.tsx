'use client';

import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_CLUB_ID } from '@leagueos/config';
import { createTournamentLiveChannel } from '../../lib/tournamentLive';

type Auth = { token: string; clubId: number };

const ADMIN_STORAGE_AUTH = 'leagueos.admin.auth';

export function TournamentMobileOperatorPage({ tournamentId }: { tournamentId: number }) {
  const [auth, setAuth] = useState<Auth | null>(null);
  const [leftTeam, setLeftTeam] = useState<'A' | 'B'>('A');
  const [server, setServer] = useState<'A' | 'B'>('A');
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [setA, setSetA] = useState(0);
  const [setB, setSetB] = useState(0);
  const [rallies, setRallies] = useState<string[]>(['0-0']);

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

  function publish(nextA: number, nextB: number, side: 'A' | 'B') {
    live.publishLocal({ type: 'match_update', payload: { scoreA: nextA, scoreB: nextB, server: side, setA, setB } });
  }

  function scorePoint(side: 'A' | 'B') {
    setServer(side);
    if (side === 'A') {
      const next = scoreA + 1;
      setScoreA(next);
      setRallies((r) => [...r, `${next}-${scoreB}`].slice(-60));
      publish(next, scoreB, side);
      if (next >= 21 && next - scoreB >= 2) {
        setSetA((s) => s + 1);
        setScoreA(0);
        setScoreB(0);
        setRallies(['0-0']);
      }
    } else {
      const next = scoreB + 1;
      setScoreB(next);
      setRallies((r) => [...r, `${scoreA}-${next}`].slice(-60));
      publish(scoreA, next, side);
      if (next >= 21 && next - scoreA >= 2) {
        setSetB((s) => s + 1);
        setScoreA(0);
        setScoreB(0);
        setRallies(['0-0']);
      }
    }
  }

  function undo() {
    setRallies((r) => {
      if (r.length <= 1) return r;
      const next = r.slice(0, -1);
      const [a, b] = next[next.length - 1].split('-').map(Number);
      setScoreA(a);
      setScoreB(b);
      return next;
    });
  }

  if (!auth) return <main style={{ padding: 24 }}>Login as admin first.</main>;

  const leftScore = leftTeam === 'A' ? scoreA : scoreB;
  const rightScore = leftTeam === 'A' ? scoreB : scoreA;

  return (
    <main style={{ maxWidth: 520, margin: '0 auto', minHeight: '100vh', background: '#f4f5f7', padding: 14, display: 'grid', gap: 12 }}>
      <section style={{ borderRadius: 22, padding: 14, background: 'linear-gradient(145deg,#12336f,#3565b3)', color: '#f7f9ff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
          <span>Mobile Operator</span>
          <span>Sets {setA}-{setB}</span>
        </div>
        <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 10 }}>
          <div style={{ textAlign: 'center' }}><strong>{leftTeam === 'A' ? 'Team A' : 'Team B'}</strong></div>
          <div style={{ fontSize: 64, fontWeight: 900 }}>{leftScore} - {rightScore}</div>
          <div style={{ textAlign: 'center' }}><strong>{leftTeam === 'A' ? 'Team B' : 'Team A'}</strong></div>
        </div>
        <div style={{ marginTop: 6, textAlign: 'center' }}>Server: Team {server}</div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <button style={{ fontSize: 42, minHeight: 100 }} onClick={() => scorePoint(leftTeam === 'A' ? 'A' : 'B')}>+</button>
        <button style={{ fontSize: 42, minHeight: 100 }} onClick={() => scorePoint(leftTeam === 'A' ? 'B' : 'A')}>+</button>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
        <button onClick={() => setLeftTeam((t) => (t === 'A' ? 'B' : 'A'))}>Flip side</button>
        <button onClick={undo}>Undo</button>
        <button onClick={() => setServer((s) => (s === 'A' ? 'B' : 'A'))}>Swap serve</button>
      </section>

      <section style={{ border: '1px solid #d8dfeb', borderRadius: 16, padding: 10, background: '#fff' }}>
        {rallies.slice(-20).map((r, idx) => (
          <span key={`${r}-${idx}`} style={{ display: 'inline-block', margin: 4, padding: '4px 8px', borderRadius: 999, border: '1px solid #d4deef', background: idx === rallies.length - 1 ? '#e5f7ee' : '#eaf1fb' }}>{r}</span>
        ))}
      </section>
    </main>
  );
}
