'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { DEFAULT_CLUB_ID } from '@leagueos/config';
import { createTournamentLiveChannel, type LiveUpdate } from '../../lib/tournamentLive';
import { tournamentsApi, type TournamentV2 } from '../../lib/tournamentsApi';

type Auth = { token: string; clubId: number };

const PLAYER_STORAGE_AUTH = 'leagueos.player.auth';
const ADMIN_STORAGE_AUTH = 'leagueos.admin.auth';

export function TournamentPublicPage() {
  const [auth, setAuth] = useState<Auth | null>(null);
  const [rows, setRows] = useState<TournamentV2[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [standings, setStandings] = useState<any>(null);
  const [liveMsg, setLiveMsg] = useState<LiveUpdate | null>(null);

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
      onMessage: (msg) => setLiveMsg(msg),
    });
    return () => live.close();
  }, [auth, selected]);

  if (!auth) return <main style={{ padding: 24 }}>Login first to view tournaments.</main>;

  return (
    <main style={{ padding: 20, display: 'grid', gap: 14 }}>
      <h1 style={{ margin: 0 }}>Tournaments</h1>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 8 }}>
        <select value={selected ?? ''} onChange={(e) => setSelected(Number(e.target.value))}>
          <option value="">Select tournament</option>
          {rows.map((r) => <option key={r.id} value={r.id}>{r.name} · {r.status}</option>)}
        </select>
        {selected ? <Link href={`/tournaments/${selected}/public`}>Public Display</Link> : null}
        {selected ? <Link href={`/tournaments/${selected}/operator`}>Operator</Link> : null}
      </div>

      {liveMsg ? <div style={{ fontSize: 12, color: '#334155' }}>Live update: {liveMsg.type} @ {new Date(liveMsg.ts).toLocaleTimeString()}</div> : null}

      <section style={{ border: '1px solid #dbe3ef', borderRadius: 12, padding: 12 }}>
        <strong>Standings</strong>
        <pre style={{ overflow: 'auto', background: '#f8fafc', padding: 12, borderRadius: 8 }}>{JSON.stringify(standings, null, 2)}</pre>
      </section>
    </main>
  );
}
