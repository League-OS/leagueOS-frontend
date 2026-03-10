'use client';

import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_CLUB_ID } from '@leagueos/config';
import { createTournamentLiveChannel, type LiveUpdate } from '../../lib/tournamentLive';
import { tournamentsApi, type TournamentDisplayResponse, type TournamentMatch } from '../../lib/tournamentsApi';

type Slide = 'live' | 'upcoming' | 'bracket' | 'standings';
const ADMIN_STORAGE_AUTH = 'leagueos.admin.auth';
const PLAYER_STORAGE_AUTH = 'leagueos.player.auth';
const ROTATE_MS = 8000;

type Auth = { token: string; clubId: number };

export function TournamentVenueDisplayPage({ tournamentId }: { tournamentId: number }) {
  const [auth, setAuth] = useState<Auth | null>(null);
  const [slide, setSlide] = useState<Slide>('live');
  const [lastSlideStart, setLastSlideStart] = useState(Date.now());
  const [display, setDisplay] = useState<TournamentDisplayResponse | null>(null);
  const [lastEvent, setLastEvent] = useState<LiveUpdate | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PLAYER_STORAGE_AUTH) || localStorage.getItem(ADMIN_STORAGE_AUTH);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Auth;
      setAuth({ token: parsed.token, clubId: parsed.clubId ?? DEFAULT_CLUB_ID });
    } catch {
      // ignore
    }
  }, []);

  async function refresh() {
    if (!auth) return;
    const payload = await tournamentsApi.display(auth.clubId, tournamentId, auth.token);
    setDisplay(payload);
  }

  useEffect(() => {
    if (!auth) return;
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.token, tournamentId]);

  const live = useMemo(() => createTournamentLiveChannel({
    tournamentId,
    onMessage: (msg) => {
      setLastEvent(msg);
      void refresh();
    },
  }), [tournamentId, auth?.token]);

  useEffect(() => () => live.close(), [live]);

  useEffect(() => {
    const id = setInterval(() => {
      const elapsed = Date.now() - lastSlideStart;
      if (elapsed < ROTATE_MS) return;
      setSlide((s) => (s === 'live' ? 'upcoming' : s === 'upcoming' ? 'bracket' : s === 'bracket' ? 'standings' : 'live'));
      setLastSlideStart(Date.now());
    }, 200);
    return () => clearInterval(id);
  }, [lastSlideStart]);

  const liveMatches = display?.live_matches ?? [];
  const upcoming = display?.upcoming_matches ?? [];
  const bracketQf = display?.bracket.quarterfinals ?? [];
  const bracketSf = display?.bracket.semifinals ?? [];
  const bracketF = display?.bracket.finals ?? [];

  const standingsRows: Array<{ team_id: number; points: number; point_diff: number }> =
    Array.isArray((display?.standings as any)?.rows)
      ? (display?.standings as any).rows
      : Array.isArray((display?.standings as any)?.groups)
        ? ((display?.standings as any).groups.flatMap((g: any) => g.rows || []))
        : [];

  return (
    <main style={{ minHeight: '100vh', background: 'linear-gradient(135deg,#0c1b43,#12336f,#1a4e95)', color: '#f5f8ff', padding: 20, display: 'grid', gap: 14 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.8, textTransform: 'uppercase' }}>LeagueOS Venue Display</div>
          <h1 style={{ margin: 0 }}>Tournament #{tournamentId}</h1>
        </div>
        <div style={{ fontSize: 13 }}>{slide.toUpperCase()} · {new Date().toLocaleTimeString()}</div>
      </header>

      {slide === 'live' ? <MatchGrid matches={liveMatches} /> : null}
      {slide === 'upcoming' ? <UpcomingGrid matches={upcoming} /> : null}

      {slide === 'bracket' ? (
        <section style={{ border: '1px solid rgba(255,255,255,.16)', borderRadius: 20, background: 'rgba(255,255,255,.08)', padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Knockout Bracket</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div style={{ border: '1px solid rgba(255,255,255,.2)', borderRadius: 12, padding: 10 }}>
              {bracketQf.map((m) => <div key={m.id}>QF #{m.id}: {m.team_a_name} vs {m.team_b_name}</div>)}
            </div>
            <div style={{ border: '1px solid rgba(255,255,255,.2)', borderRadius: 12, padding: 10 }}>
              {bracketSf.map((m) => <div key={m.id}>SF #{m.id}: {m.team_a_name} vs {m.team_b_name}</div>)}
            </div>
            <div style={{ border: '1px solid rgba(255,255,255,.2)', borderRadius: 12, padding: 10 }}>
              {bracketF.map((m) => <div key={m.id}>Final #{m.id}: {m.team_a_name} vs {m.team_b_name}</div>)}
            </div>
          </div>
        </section>
      ) : null}

      {slide === 'standings' ? (
        <section style={{ border: '1px solid rgba(255,255,255,.16)', borderRadius: 20, background: 'rgba(255,255,255,.08)', padding: 16 }}>
          <h2 style={{ marginTop: 0 }}>Standings</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr><th style={{ textAlign: 'left' }}>Team</th><th>Pts</th><th>Diff</th></tr></thead>
            <tbody>
              {standingsRows.map((r) => <tr key={r.team_id}><td>Team #{r.team_id}</td><td style={{ textAlign: 'center' }}>{r.points}</td><td style={{ textAlign: 'center' }}>{r.point_diff}</td></tr>)}
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

function MatchGrid({ matches }: { matches: TournamentMatch[] }) {
  return (
    <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
      {matches.map((m) => (
        <article key={m.id} style={{ border: '1px solid rgba(255,255,255,.16)', borderRadius: 20, background: 'rgba(255,255,255,.1)', padding: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span>{m.stage} · #{m.id}</span><span>{m.status}</span></div>
          <div style={{ marginTop: 8, fontSize: 34, fontWeight: 900, textAlign: 'center' }}>{m.team_a_points ?? 0} - {m.team_b_points ?? 0}</div>
          <div style={{ textAlign: 'center', opacity: 0.85 }}>{m.team_a_name} vs {m.team_b_name}</div>
        </article>
      ))}
    </section>
  );
}

function UpcomingGrid({ matches }: { matches: TournamentMatch[] }) {
  return (
    <section style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 12 }}>
      {matches.map((m) => (
        <article key={m.id} style={{ border: '1px solid rgba(255,255,255,.16)', borderRadius: 20, background: 'rgba(255,255,255,.1)', padding: 14 }}>
          <div style={{ fontSize: 12, opacity: 0.8 }}>{m.stage} · Match #{m.id}</div>
          <div style={{ marginTop: 6, fontSize: 24, fontWeight: 800 }}>{m.team_a_name}</div>
          <div>vs</div>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{m.team_b_name}</div>
        </article>
      ))}
    </section>
  );
}
