'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_CLUB_ID } from '@leagueos/config';
import { createTournamentLiveChannel, type LiveUpdate } from '../../lib/tournamentLive';
import { tournamentsApi, type TournamentDisplayResponse, type TournamentMatch, type TournamentV2 } from '../../lib/tournamentsApi';

type Auth = { token: string; clubId: number };

const PLAYER_STORAGE_AUTH = 'leagueos.player.auth';
const ADMIN_STORAGE_AUTH = 'leagueos.admin.auth';

export function TournamentPublicPage() {
  const [auth, setAuth] = useState<Auth | null>(null);
  const [rows, setRows] = useState<TournamentV2[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [display, setDisplay] = useState<TournamentDisplayResponse | null>(null);
  const [liveMsg, setLiveMsg] = useState<LiveUpdate | null>(null);
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

  async function refreshDisplay() {
    if (!auth || !selected) return;
    const payload = await tournamentsApi.display(auth.clubId, selected, auth.token);
    setDisplay(payload);
  }

  useEffect(() => {
    if (!auth || !selected) return;
    void refreshDisplay();

    const live = createTournamentLiveChannel({
      tournamentId: selected,
      onMessage: (msg) => {
        setLiveMsg(msg);
        void refreshDisplay();
      },
    });
    return () => live.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth, selected]);

  const allMatches: TournamentMatch[] = useMemo(() => {
    if (!display) return [];
    return [...display.live_matches, ...display.upcoming_matches, ...display.completed_matches];
  }, [display]);

  const spotlight = useMemo(() => allMatches[activeMatch] ?? allMatches[0], [allMatches, activeMatch]);

  if (!auth) return <main style={{ padding: 24 }}>Login first to view tournaments.</main>;

  return (
    <main style={{ padding: 16, display: 'grid', gap: 12, background: '#f3f5f8', minHeight: '100vh' }}>
      <section style={{ borderRadius: 20, padding: 16, background: 'linear-gradient(145deg,#12336f,#3565b3)', color: '#f7f9ff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Public URL + QR ready</div>
            <h1 style={{ margin: '4px 0' }}>{rows.find((r) => r.id === selected)?.name ?? 'Tournament'}</h1>
          </div>
          <div style={{ fontSize: 12 }}>Live: {display?.live_matches.length ?? 0} · Upcoming: {display?.upcoming_matches.length ?? 0}</div>
        </div>
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'center' }}>
          <div style={{ textAlign: 'center' }}>
            <strong>{spotlight?.team_a_name ?? '-'}</strong>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Court TBD</div>
          </div>
          <div style={{ fontSize: 46, fontWeight: 900 }}>{spotlight?.team_a_points ?? 0} - {spotlight?.team_b_points ?? 0}</div>
          <div style={{ textAlign: 'center' }}>
            <strong>{spotlight?.team_b_name ?? '-'}</strong>
            <div style={{ fontSize: 12, opacity: 0.8 }}>{spotlight?.stage ?? '-'}</div>
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
            {allMatches.map((m, idx) => (
              <button key={m.id} onClick={() => setActiveMatch(idx)} style={{ textAlign: 'left', border: idx === activeMatch ? '2px solid #56cfa8' : '1px solid #d6e0f2', borderRadius: 14, padding: 10, background: '#f8fbff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}><strong>{m.stage} · Match #{m.id}</strong><span>{m.status}</span></div>
                <div style={{ fontSize: 13, color: '#475569' }}>{m.team_a_name} vs {m.team_b_name}</div>
                <div style={{ fontWeight: 900, fontSize: 24 }}>{m.team_a_points ?? 0} - {m.team_b_points ?? 0}</div>
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

          {'groups' in (display?.standings || {}) && Array.isArray((display?.standings as any)?.groups)
            ? (display?.standings as any).groups.map((g: any) => (
                <div key={g.group} style={{ border: '1px solid #d6e0f1', borderRadius: 10, padding: 8 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Group {g.group}</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead><tr><th style={{ textAlign: 'left' }}>Team</th><th>Pts</th><th>Diff</th></tr></thead>
                    <tbody>{(g.rows || []).map((r: any) => <tr key={r.team_id}><td>Team #{r.team_id}</td><td style={{ textAlign: 'center' }}>{r.points}</td><td style={{ textAlign: 'center' }}>{r.point_diff}</td></tr>)}</tbody>
                  </table>
                </div>
              ))
            : Array.isArray((display?.standings as any)?.rows)
              ? <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}><thead><tr><th style={{ textAlign: 'left' }}>Team</th><th>Pts</th><th>Diff</th></tr></thead><tbody>{(display?.standings as any).rows.map((r: any) => <tr key={r.team_id}><td>Team #{r.team_id}</td><td style={{ textAlign: 'center' }}>{r.points}</td><td style={{ textAlign: 'center' }}>{r.point_diff}</td></tr>)}</tbody></table>
              : <div style={{ fontSize: 12, color: '#64748b' }}>No standings yet.</div>}

          <div style={{ border: '1px solid #d6e0f1', borderRadius: 10, padding: 8 }}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>Knockout Bracket</div>
            <div style={{ display: 'grid', gap: 6, fontSize: 12 }}>
              {(display?.bracket.quarterfinals ?? []).map((m) => <div key={`qf-${m.id}`}>QF #{m.id}: {m.team_a_name} vs {m.team_b_name}</div>)}
              {(display?.bracket.semifinals ?? []).map((m) => <div key={`sf-${m.id}`}>SF #{m.id}: {m.team_a_name} vs {m.team_b_name}</div>)}
              {(display?.bracket.finals ?? []).map((m) => <div key={`f-${m.id}`}>Final #{m.id}: {m.team_a_name} vs {m.team_b_name}</div>)}
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
