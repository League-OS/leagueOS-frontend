'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_CLUB_ID } from '@leagueos/config';
import { createTournamentLiveChannel, type LiveUpdate } from '../../lib/tournamentLive';
import { tournamentsApi, type TournamentV2 } from '../../lib/tournamentsApi';

type Auth = { token: string; clubId: number };

const PLAYER_STORAGE_AUTH = 'leagueos.player.auth';
const ADMIN_STORAGE_AUTH = 'leagueos.admin.auth';

type DemoMatch = {
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

const seedMatches: DemoMatch[] = [
  { id: 101, title: 'Group A · Match 12', stage: 'GROUP', court: 'C3', teamA: 'Alex / Jordan', teamB: 'Priya / Lila', status: 'LIVE', scoreA: 12, scoreB: 10 },
  { id: 102, title: 'Quarter Final · Match 3', stage: 'QUARTERFINAL', court: 'C1', teamA: 'Seth / Ming', teamB: 'Nina / Omar', status: 'LIVE', scoreA: 5, scoreB: 3 },
  { id: 201, title: 'Group B · Match 7', stage: 'GROUP', court: 'C2', teamA: 'Ken / Luca', teamB: 'Maya / Iris', status: 'UPCOMING', scoreA: 0, scoreB: 0 },
];

export function TournamentPublicPage() {
  const [auth, setAuth] = useState<Auth | null>(null);
  const [rows, setRows] = useState<TournamentV2[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [standings, setStandings] = useState<any>(null);
  const [liveMsg, setLiveMsg] = useState<LiveUpdate | null>(null);
  const [matches, setMatches] = useState<DemoMatch[]>(seedMatches);
  const [activeMatch, setActiveMatch] = useState(0);

  useEffect(() => {
    try {
      const p = localStorage.getItem(PLAYER_STORAGE_AUTH);
      const a = localStorage.getItem(ADMIN_STORAGE_AUTH);
      const raw = p || a;
      if (!raw) return;
      const parsed = JSON.parse(raw) as Auth;
      setAuth({ token: parsed.token, clubId: parsed.clubId ?? DEFAULT_CLUB_ID });
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (!auth) return;
    void tournamentsApi.list(auth.clubId, auth.token).then((list) => {
      setRows(list);
      if (list[0]) setSelected((prev) => prev ?? list[0].id);
    });
  }, [auth]);

  useEffect(() => {
    if (!auth || !selected) return;
    void tournamentsApi.standings(auth.clubId, selected, auth.token).then(setStandings).catch(() => setStandings(null));

    const live = createTournamentLiveChannel({
      tournamentId: selected,
      onMessage: (msg) => {
        setLiveMsg(msg);
        if (msg.matchId) {
          setMatches((prev) => prev.map((m) => (m.id === msg.matchId ? { ...m, status: 'LIVE' } : m)));
        }
      },
    });
    return () => live.close();
  }, [auth, selected]);

  const spotlight = useMemo(() => matches[activeMatch] ?? matches[0], [matches, activeMatch]);

  if (!auth) return <main style={{ padding: 24 }}>Login first to view tournaments.</main>;

  return (
    <main style={{ padding: 16, display: 'grid', gap: 12, background: '#f3f5f8', minHeight: '100vh' }}>
      <section style={{ borderRadius: 20, padding: 16, background: 'linear-gradient(145deg,#12336f,#3565b3)', color: '#f7f9ff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Public URL + QR ready</div>
            <h1 style={{ margin: '4px 0' }}>Spring Club Tournament</h1>
          </div>
          <div style={{ fontSize: 12 }}>Live: {matches.filter((m) => m.status === 'LIVE').length} · Upcoming: {matches.filter((m) => m.status === 'UPCOMING').length}</div>
        </div>
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <strong>{spotlight?.teamA}</strong>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Court {spotlight?.court}</div>
          </div>
          <div style={{ fontSize: 46, fontWeight: 900 }}>{spotlight?.scoreA} - {spotlight?.scoreB}</div>
          <div style={{ textAlign: 'center' }}>
            <strong>{spotlight?.teamB}</strong>
            <div style={{ fontSize: 12, opacity: 0.8 }}>{spotlight?.stage}</div>
          </div>
        </div>
      </section>

      <section style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12 }}>
        <div style={{ border: '1px solid #d8dfeb', borderRadius: 18, padding: 12, background: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <strong>Matches</strong>
            {liveMsg ? <span style={{ fontSize: 12 }}>Live sync {new Date(liveMsg.ts).toLocaleTimeString()}</span> : null}
          </div>
          <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
            {matches.map((m, idx) => (
              <button key={m.id} onClick={() => setActiveMatch(idx)} style={{ textAlign: 'left', border: idx === activeMatch ? '2px solid #56cfa8' : '1px solid #d6e0f2', borderRadius: 14, padding: 10, background: '#f8fbff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><strong>{m.title}</strong><span>{m.status}</span></div>
                <div style={{ fontSize: 13, color: '#475569' }}>{m.teamA} vs {m.teamB}</div>
                <div style={{ fontWeight: 900, fontSize: 24 }}>{m.scoreA} - {m.scoreB}</div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ border: '1px solid #d8dfeb', borderRadius: 18, padding: 12, background: '#fff', display: 'grid', gap: 8 }}>
          <strong>Standings</strong>
          <select value={selected ?? ''} onChange={(e) => setSelected(Number(e.target.value))}>
            <option value="">Select tournament</option>
            {rows.map((r) => <option key={r.id} value={r.id}>{r.name} · {r.status}</option>)}
          </select>

          {'groups' in (standings || {}) && Array.isArray(standings?.groups)
            ? standings.groups.map((g: any) => (
                <div key={g.group} style={{ border: '1px solid #d6e0f1', borderRadius: 10, padding: 8 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Group {g.group}</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr><th style={{ textAlign: 'left' }}>Team</th><th>Pts</th><th>Diff</th></tr>
                    </thead>
                    <tbody>
                      {(g.rows || []).map((r: any) => (
                        <tr key={r.team_id}>
                          <td>Team #{r.team_id}</td>
                          <td style={{ textAlign: 'center' }}>{r.points}</td>
                          <td style={{ textAlign: 'center' }}>{r.point_diff}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))
            : Array.isArray(standings?.rows)
              ? (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead><tr><th style={{ textAlign: 'left' }}>Team</th><th>Pts</th><th>Diff</th></tr></thead>
                  <tbody>
                    {standings.rows.map((r: any) => (
                      <tr key={r.team_id}><td>Team #{r.team_id}</td><td style={{ textAlign: 'center' }}>{r.points}</td><td style={{ textAlign: 'center' }}>{r.point_diff}</td></tr>
                    ))}
                  </tbody>
                </table>
              )
              : <div style={{ fontSize: 12, color: '#64748b' }}>No standings yet.</div>}

          <div style={{ border: '1px solid #d6e0f1', borderRadius: 10, padding: 8 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Knockout Bracket (preview)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 8 }}>Semifinal 1<br />Top Seed vs Seed 4</div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 8 }}>Semifinal 2<br />Seed 2 vs Seed 3</div>
              <div style={{ gridColumn: '1 / span 2', border: '1px solid #e2e8f0', borderRadius: 8, padding: 8 }}>Final<br />Winner SF1 vs Winner SF2</div>
            </div>
          </div>

          {selected ? <Link href={`/tournaments/${selected}/operator`}>Open operator console</Link> : null}
          {selected ? <Link href={`/tournaments/${selected}/operator-mobile`}>Open mobile operator</Link> : null}
          {selected ? <Link href={`/tournaments/${selected}/venue`}>Open venue slideshow</Link> : null}
        </div>
      </section>
    </main>
  );
}
