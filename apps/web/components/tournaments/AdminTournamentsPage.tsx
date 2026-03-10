'use client';

import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_CLUB_ID } from '@leagueos/config';
import { tournamentsApi, type TournamentV2 } from '../../lib/tournamentsApi';

type Auth = { token: string; clubId: number };

type Player = { id: number; display_name: string; active: boolean };

const ADMIN_STORAGE_AUTH = 'leagueos.admin.auth';

export function AdminTournamentsPage() {
  const [auth, setAuth] = useState<Auth | null>(null);
  const [rows, setRows] = useState<TournamentV2[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTournamentId, setSelectedTournamentId] = useState<number | null>(null);
  const [selectedPlayers, setSelectedPlayers] = useState<number[]>([]);

  const [name, setName] = useState('');
  const [eventType, setEventType] = useState<'DOUBLES' | 'MIXED_DOUBLES'>('DOUBLES');
  const [format, setFormat] = useState<'GROUPS_KO' | 'MATCH_COUNT_KO'>('GROUPS_KO');
  const [matchesPerTeam, setMatchesPerTeam] = useState('');
  const [pointsToWin, setPointsToWin] = useState<'15' | '21'>('21');
  const [maxPointCap, setMaxPointCap] = useState('23');

  const activeTournament = useMemo(
    () => rows.find((r) => r.id === selectedTournamentId) ?? null,
    [rows, selectedTournamentId],
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(ADMIN_STORAGE_AUTH);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Auth;
      if (!parsed?.token) return;
      setAuth({ token: parsed.token, clubId: parsed.clubId ?? DEFAULT_CLUB_ID });
    } catch {
      // ignore
    }
  }, []);

  async function refresh() {
    if (!auth) return;
    setLoading(true);
    setError(null);
    try {
      const [tournaments, playerRes] = await Promise.all([
        tournamentsApi.list(auth.clubId, auth.token),
        fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/players?club_id=${auth.clubId}&active_only=true`, {
          headers: { Authorization: `Bearer ${auth.token}` },
          cache: 'no-store',
        }).then((r) => r.json()),
      ]);
      setRows(tournaments);
      setPlayers(Array.isArray(playerRes) ? playerRes : []);
      if (!selectedTournamentId && tournaments[0]) setSelectedTournamentId(tournaments[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tournaments');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.token]);

  async function onCreateTournament() {
    if (!auth) return;
    setError(null);
    try {
      await tournamentsApi.create(auth.clubId, auth.token, {
        name,
        event_type: eventType,
        format,
        enable_quarterfinals: false,
        matches_per_team: format === 'MATCH_COUNT_KO' ? Number(matchesPerTeam || 0) : null,
        points_to_win: Number(pointsToWin),
        win_by_two: true,
        max_point_cap: Number(maxPointCap),
      });
      setName('');
      setMatchesPerTeam('');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create tournament');
    }
  }

  async function runAction(kind: 'players' | 'teams' | 'schedule' | 'advance') {
    if (!auth || !selectedTournamentId) return;
    setError(null);
    try {
      if (kind === 'players') await tournamentsApi.addPlayers(auth.clubId, selectedTournamentId, auth.token, selectedPlayers);
      if (kind === 'teams') await tournamentsApi.generateTeams(auth.clubId, selectedTournamentId, auth.token);
      if (kind === 'schedule') await tournamentsApi.generateSchedule(auth.clubId, selectedTournamentId, auth.token);
      if (kind === 'advance') await tournamentsApi.advance(auth.clubId, selectedTournamentId, auth.token);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    }
  }

  if (!auth) return <main style={{ padding: 24 }}>Please login from admin first.</main>;

  return (
    <main style={{ padding: 20, display: 'grid', gap: 16 }}>
      <h1 style={{ margin: 0 }}>Tournament Admin</h1>
      {error ? <div style={{ background: '#fff1f2', border: '1px solid #fecaca', padding: 10, borderRadius: 8 }}>{error}</div> : null}

      <section style={{ border: '1px solid #dbe3ef', borderRadius: 12, padding: 12, display: 'grid', gap: 8 }}>
        <strong>Create Tournament</strong>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tournament name" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8 }}>
          <select value={eventType} onChange={(e) => setEventType(e.target.value as 'DOUBLES' | 'MIXED_DOUBLES')}>
            <option value="DOUBLES">DOUBLES</option>
            <option value="MIXED_DOUBLES">MIXED_DOUBLES</option>
          </select>
          <select value={format} onChange={(e) => setFormat(e.target.value as 'GROUPS_KO' | 'MATCH_COUNT_KO')}>
            <option value="GROUPS_KO">GROUPS_KO</option>
            <option value="MATCH_COUNT_KO">MATCH_COUNT_KO</option>
          </select>
          {format === 'MATCH_COUNT_KO' ? <input value={matchesPerTeam} onChange={(e) => setMatchesPerTeam(e.target.value)} placeholder="matches/team" /> : null}
          <select value={pointsToWin} onChange={(e) => setPointsToWin(e.target.value as '15' | '21')}>
            <option value="15">15</option>
            <option value="21">21</option>
          </select>
          <input value={maxPointCap} onChange={(e) => setMaxPointCap(e.target.value)} placeholder="max cap" />
        </div>
        <button onClick={onCreateTournament} disabled={loading || !name.trim()}>Create</button>
      </section>

      <section style={{ border: '1px solid #dbe3ef', borderRadius: 12, padding: 12, display: 'grid', gap: 8 }}>
        <strong>Tournaments</strong>
        <select value={selectedTournamentId ?? ''} onChange={(e) => setSelectedTournamentId(Number(e.target.value))}>
          <option value="">Select tournament</option>
          {rows.map((r) => (
            <option key={r.id} value={r.id}>{r.name} · {r.status}</option>
          ))}
        </select>

        {activeTournament ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ color: '#475569' }}>{activeTournament.format} · {activeTournament.event_type} · {activeTournament.status}</div>
            <label style={{ fontSize: 13 }}>Enroll players</label>
            <select multiple value={selectedPlayers.map(String)} onChange={(e) => {
              const opts = Array.from(e.target.selectedOptions).map((o) => Number(o.value));
              setSelectedPlayers(opts);
            }} style={{ minHeight: 120 }}>
              {players.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={() => runAction('players')}>Add Players</button>
              <button onClick={() => runAction('teams')}>Generate Teams</button>
              <button onClick={() => runAction('schedule')}>Generate Schedule</button>
              <button onClick={() => runAction('advance')}>Advance</button>
              <button onClick={() => void refresh()}>Refresh</button>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}
