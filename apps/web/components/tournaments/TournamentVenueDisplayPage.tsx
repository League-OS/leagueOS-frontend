'use client';

import { useEffect, useMemo, useState } from 'react';
import { createTournamentLiveChannel, type LiveUpdate } from '../../lib/tournamentLive';

type Slide = 'live' | 'upcoming' | 'bracket' | 'standings';

type MatchRow = {
  id: number;
  title: string;
  stage: string;
  court: string;
  teamA: string;
  teamB: string;
  status: 'LIVE' | 'UPCOMING' | 'DONE';
  scoreA: number;
  scoreB: number;
};

const ROTATE_MS = 8000;

const seedMatches: MatchRow[] = [
  { id: 101, title: 'Group A · Match 12', stage: 'GROUP', court: 'C3', teamA: 'Alex / Jordan', teamB: 'Priya / Lila', status: 'LIVE', scoreA: 8, scoreB: 7 },
  { id: 102, title: 'Quarter Final · Match 3', stage: 'QUARTERFINAL', court: 'C1', teamA: 'Seth / Ming', teamB: 'Nina / Omar', status: 'LIVE', scoreA: 5, scoreB: 3 },
  { id: 201, title: 'Group B · Match 7', stage: 'GROUP', court: 'C2', teamA: 'Ken / Luca', teamB: 'Maya / Iris', status: 'UPCOMING', scoreA: 0, scoreB: 0 },
  { id: 202, title: 'Quarter Final · Match 4', stage: 'QUARTERFINAL', court: 'C4', teamA: 'Rita / Bo', teamB: 'Maya / Iris', status: 'UPCOMING', scoreA: 0, scoreB: 0 },
];

export function TournamentVenueDisplayPage({ tournamentId }: { tournamentId: number }) {
  const [slide, setSlide] = useState<Slide>('live');
  const [lastSlideStart, setLastSlideStart] = useState(Date.now());
  const [matches, setMatches] = useState(seedMatches);
  const [lastEvent, setLastEvent] = useState<LiveUpdate | null>(null);

  const live = useMemo(() => createTournamentLiveChannel({
    tournamentId,
    onMessage: (msg) => {
      setLastEvent(msg);
      if (msg.matchId) {
        setMatches((prev) => prev.map((m) => (m.id === msg.matchId
          ? {
              ...m,
              status: ((msg.payload?.status as string) ?? m.status) as MatchRow['status'],
              scoreA: Number((msg.payload?.scoreA as number) ?? m.scoreA),
              scoreB: Number((msg.payload?.scoreB as number) ?? m.scoreB),
            }
          : m)));
      }
    },
  }), [tournamentId]);

  useEffect(() => () => live.close(), [live]);

  useEffect(() => {
    const id = setInterval(() => {
      const elapsed = Date.now() - lastSlideStart;
      if (elapsed < ROTATE_MS) return;
      setSlide((s) => {
        if (s === 'live') return 'upcoming';
        if (s === 'upcoming') return 'bracket';
        if (s === 'bracket') return 'standings';
        return 'live';
      });
      setLastSlideStart(Date.now());
    }, 200);
    return () => clearInterval(id);
  }, [lastSlideStart]);

  const liveMatches = matches.filter((m) => m.status === 'LIVE');
  const upcoming = matches.filter((m) => m.status === 'UPCOMING');

  return (
    <main style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0c1b43,#12336f,#1a4e95)', color: '#f5f8ff', padding: 20, display: 'grid', gap: 14 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.8, textTransform: 'uppercase' }}>LeagueOS Venue Display</div>
          <h1 style={{ margin: 0 }}>Spring Club Tournament</h1>
        </div>
        <div style={{ fontSize: 13 }}>{slide.toUpperCase()} · {new Date().toLocaleTimeString()}</div>
      </header>

      {slide === 'live' ? (
        <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {liveMatches.map((m) => (
            <article key={m.id} style={{ border: '1px solid rgba(255,255,255,.16)', borderRadius: 20, background: 'rgba(255,255,255,.1)', padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span>{m.title}</span><span>LIVE</span></div>
              <div style={{ marginTop: 8, fontSize: 34, fontWeight: 900, textAlign: 'center' }}>{m.scoreA} - {m.scoreB}</div>
              <div style={{ textAlign: 'center', opacity: 0.85 }}>{m.teamA} vs {m.teamB}</div>
            </article>
          ))}
        </section>
      ) : null}

      {slide === 'upcoming' ? (
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12 }}>
          {upcoming.map((m) => (
            <article key={m.id} style={{ border: '1px solid rgba(255,255,255,.16)', borderRadius: 20, background: 'rgba(255,255,255,.1)', padding: 14 }}>
              <div style={{ fontSize: 12, opacity: 0.8 }}>{m.title}</div>
              <div style={{ marginTop: 6, fontSize: 24, fontWeight: 800 }}>{m.teamA}</div>
              <div>vs</div>
              <div style={{ fontSize: 24, fontWeight: 800 }}>{m.teamB}</div>
              <div style={{ marginTop: 6, fontSize: 12 }}>Court {m.court}</div>
            </article>
          ))}
        </section>
      ) : null}

      {slide === 'bracket' ? (
        <section style={{ border: '1px solid rgba(255,255,255,.16)', borderRadius: 20, background: 'rgba(255,255,255,.08)', padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Knockout Bracket</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div style={{ border: '1px solid rgba(255,255,255,.2)', borderRadius: 12, padding: 10 }}>QF1<br />Seed 1 vs Seed 8</div>
            <div style={{ border: '1px solid rgba(255,255,255,.2)', borderRadius: 12, padding: 10 }}>SF1<br />Winner QF1 vs Winner QF2</div>
            <div style={{ border: '1px solid rgba(255,255,255,.2)', borderRadius: 12, padding: 10 }}>Final<br />Winner SF1 vs Winner SF2</div>
          </div>
        </section>
      ) : null}

      {slide === 'standings' ? (
        <section style={{ border: '1px solid rgba(255,255,255,.16)', borderRadius: 20, background: 'rgba(255,255,255,.08)', padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Standings</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={{ textAlign: 'left' }}>Team</th><th>Pts</th><th>Diff</th></tr></thead>
            <tbody>
              <tr><td>Ken / Luca</td><td style={{ textAlign: 'center' }}>5</td><td style={{ textAlign: 'center' }}>+18</td></tr>
              <tr><td>Priya / Lila</td><td style={{ textAlign: 'center' }}>4</td><td style={{ textAlign: 'center' }}>+9</td></tr>
              <tr><td>Alex / Jordan</td><td style={{ textAlign: 'center' }}>4</td><td style={{ textAlign: 'center' }}>+4</td></tr>
            </tbody>
          </table>
        </section>
      ) : null}

      <footer style={{ fontSize: 12, opacity: 0.85 }}>
        {lastEvent ? `Last update: ${lastEvent.type} at ${new Date(lastEvent.ts).toLocaleTimeString()}` : 'Waiting for live updates'}
      </footer>
    </main>
  );
}
