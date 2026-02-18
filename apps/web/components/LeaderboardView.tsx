'use client';

import { useEffect, useRef, useState } from 'react';
import { ApiError } from '@leagueos/api';
import type { Club, Court, LeaderboardEntry, Player, Profile, Season, Session } from '@leagueos/schemas';
import { floorToFiveMinuteIncrement, validateAddGameInput } from './addGameLogic';

type TabKey = 'home' | 'leaderboard' | 'profile';
type HomeMode = 'main' | 'addGame' | 'allGames' | 'gameDetail' | 'allUpcoming' | 'upcomingDetail';

export type HomeGameRow = {
  id: number;
  sessionId: number;
  date: string;
  season: string;
  partner: string;
  score: string;
  outcome: 'W' | 'L';
  startTime: string;
  courtName: string;
  teamA: string[];
  teamB: string[];
  scoreA: number;
  scoreB: number;
};

export type UpcomingRow = {
  id: number;
  seasonId: number;
  date: string;
  season: string;
  club: string;
  status: string;
  location: string;
  address: string;
};

export type ProfileStatSummary = {
  singles: number;
  doubles: number;
  mixed: number;
  pointsFor: number;
  pointsAgainst: number;
  winPct: number;
};

export type EloHistoryRow = {
  season: string;
  club: string;
  elo: number;
  change: number;
};

type Props = {
  profile: Profile | null;
  clubs: Club[];
  seasons: Season[];
  selectedClubId: number;
  selectedSeasonId: number | null;
  selectedSession: Session | null;
  recordClubId: number;
  recordSession: Session | null;
  recordSeasonId: number | null;
  leaderboard: LeaderboardEntry[];
  recordSeasons: Season[];
  players: Player[];
  courts: Court[];
  loading: boolean;
  error: string | null;
  recordContextError: string | null;
  profileStats: ProfileStatSummary;
  eloHistory: EloHistoryRow[];
  recentGames: HomeGameRow[];
  allGames: HomeGameRow[];
  upcomingSessions: UpcomingRow[];
  allUpcomingSessions: UpcomingRow[];
  onRecordClubChange: (clubId: number) => Promise<void>;
  onClubChange: (clubId: number) => Promise<void>;
  onSeasonChange: (seasonId: number) => Promise<void>;
  onRefresh: () => Promise<void>;
  onRecordGame: (payload: {
    courtId: number | null;
    startTimeLocal: string;
    scoreA: number;
    scoreB: number;
    sideAPlayerIds: [number, number];
    sideBPlayerIds: [number, number];
  }) => Promise<void>;
  onRecordSeasonChange: (seasonId: number) => Promise<void>;
  onLogout: () => void;
};

export function LeaderboardView(props: Props) {
  const {
    profile,
    clubs,
    seasons,
    selectedClubId,
    selectedSeasonId,
    selectedSession,
    recordClubId,
    recordSession,
    recordSeasonId,
    leaderboard,
    recordSeasons,
    players,
    courts,
    loading,
    error,
    recordContextError,
    profileStats,
    eloHistory,
    recentGames,
    allGames,
    upcomingSessions,
    allUpcomingSessions,
    onRecordClubChange,
    onClubChange,
    onSeasonChange,
    onRefresh,
    onRecordGame,
    onRecordSeasonChange,
    onLogout,
  } = props;

  const [tab, setTab] = useState<TabKey>('home');
  const [profileTitle, setProfileTitle] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: 90 }}>
      {tab === 'home' ? (
        <HomeScreen
          profile={profile}
          clubs={clubs}
          recordClubId={recordClubId}
          selectedSession={recordSession}
          recordContextError={recordContextError}
          recordSeasonId={recordSeasonId}
          seasons={recordSeasons}
          players={players}
          courts={courts}
          recentGames={recentGames}
          allGames={allGames}
          upcomingSessions={upcomingSessions}
          allUpcomingSessions={allUpcomingSessions}
          onRecordClubChange={onRecordClubChange}
          onRecordGame={onRecordGame}
          onRecordSeasonChange={onRecordSeasonChange}
          onGoHome={() => setTab('home')}
          onGoLeaderboard={() => setTab('leaderboard')}
          onGoProfile={() => {
            setProfileTitle(null);
            setTab('profile');
          }}
          onLogout={onLogout}
        />
      ) : null}

      {tab === 'leaderboard' ? (
        <section>
          <header style={{ background: 'linear-gradient(135deg, var(--teal-start), var(--teal-end))', color: 'white', padding: '20px 16px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div>
                <h1 style={{ margin: 0, fontSize: 22 }}>Season Leaderboard</h1>
                <p style={{ margin: '4px 0 0', opacity: 0.95, fontSize: 14 }}>{profile?.display_name || profile?.full_name || profile?.email || 'LeagueOS'}</p>
              </div>
              <button onClick={onLogout} style={ghostBtn}>Logout</button>
            </div>

            <div style={{ display: 'grid', gap: 10, marginTop: 14, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
              <select value={selectedClubId} onChange={(e) => void onClubChange(Number(e.target.value))} style={selectStyle}>
                {!clubs.length ? <option value={selectedClubId}>Club {selectedClubId}</option> : null}
                {clubs.map((club) => (
                  <option key={club.id} value={club.id}>{club.name}</option>
                ))}
              </select>

              <select value={selectedSeasonId ?? ''} onChange={(e) => void onSeasonChange(Number(e.target.value))} style={selectStyle} disabled={!seasons.length}>
                {!seasons.length ? <option value="">No seasons</option> : null}
                {seasons.map((season) => (
                  <option key={season.id} value={season.id}>{season.name}</option>
                ))}
              </select>
            </div>
          </header>

          <section style={{ maxWidth: 1100, margin: '16px auto 0', padding: '0 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ fontSize: 13, color: 'var(--muted)' }}>
                Session: {selectedSession ? `${selectedSession.session_date} (${selectedSession.status})` : 'No session found'}
              </div>
              <button onClick={() => void onRefresh()} style={outlineBtn} disabled={loading}>{loading ? 'Refreshing...' : 'Refresh'}</button>
            </div>

            {error ? <div style={{ color: 'var(--bad)', marginBottom: 8 }}>{error}</div> : null}

            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
              <div style={leaderboardHeaderRow}>
                <div style={{ textAlign: 'center' }}>#</div>
                <div>Player</div>
                <div style={{ textAlign: 'center' }}>Delta</div>
                <div style={{ textAlign: 'center' }}>Played</div>
                <div style={{ textAlign: 'center' }}>Won</div>
                <div style={{ textAlign: 'right' }}>Global ELO</div>
              </div>

              {!leaderboard.length ? (
                <div style={{ padding: 22, color: 'var(--muted)' }}>No leaderboard data for this season/session yet.</div>
              ) : (
                leaderboard.map((row, i) => (
                  <div key={row.player_id} style={leaderboardRow}>
                    <div style={{ textAlign: 'center' }}>{rankBadge(i + 1)}</div>
                    <button
                      style={{ ...linkBtn, textAlign: 'left', fontWeight: 600 }}
                      onClick={() => {
                        setProfileTitle(row.display_name);
                        setTab('profile');
                      }}
                    >
                      {row.display_name}
                    </button>
                    <div style={{ textAlign: 'center', color: row.season_elo_delta >= 0 ? 'var(--ok)' : 'var(--bad)' }}>
                      {row.season_elo_delta >= 0 ? '+' : ''}
                      {row.season_elo_delta}
                    </div>
                    <div style={{ textAlign: 'center' }}>{row.matches_played ?? 0}</div>
                    <div style={{ textAlign: 'center' }}>{row.matches_won}</div>
                    <div style={{ textAlign: 'right', fontWeight: 700 }}>{row.global_elo_score ?? 1000}</div>
                  </div>
                ))
              )}
            </div>
          </section>
        </section>
      ) : null}

      {tab === 'profile' ? (
        <section>
          <header style={{ background: 'linear-gradient(135deg, var(--teal-start), var(--teal-end))', color: 'white', padding: '24px 16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h1 style={{ margin: 0, fontSize: 22 }}>Profile</h1>
              <button onClick={onLogout} style={ghostBtn}>Logout</button>
            </div>
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div
                style={{
                  width: 88,
                  height: 88,
                  borderRadius: '50%',
                  background: avatarPreview ? '#e2e8f0' : 'linear-gradient(135deg,#d1d5db,#9ca3af)',
                  border: '3px solid #fff',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {avatarPreview ? <img src={avatarPreview} alt="Profile avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => setAvatarPreview(typeof reader.result === 'string' ? reader.result : null);
                    reader.readAsDataURL(file);
                  }}
                />
                <button
                  style={{ position: 'absolute', right: -2, bottom: -2, border: 0, borderRadius: '50%', width: 28, height: 28, background: '#fff', boxShadow: '0 4px 10px rgba(0,0,0,.16)', cursor: 'pointer' }}
                  onClick={() => avatarInputRef.current?.click()}
                  aria-label="Change profile photo"
                >
                  📷
                </button>
              </div>
              <div style={{ marginTop: 10, fontSize: 28, fontWeight: 700 }}>
                {profileTitle || profile?.display_name || profile?.full_name || 'LeagueOS User'}
              </div>
            </div>
          </header>

          <section style={{ maxWidth: 1100, margin: '-12px auto 0', padding: '0 16px 16px' }}>
            <div style={{ background: '#fff', borderRadius: 20, border: '1px solid var(--border)', boxShadow: '0 8px 24px rgba(0,0,0,.06)', padding: 16 }}>
              <h2 style={{ margin: 0, fontSize: 22 }}>Headline Statistics</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 10, marginTop: 12 }}>
                <StatCard title="Singles" value={profileStats.singles} bg="#dbeafe" color="#2563eb" />
                <StatCard title="Doubles" value={profileStats.doubles} bg="#ede9fe" color="#7c3aed" />
                <StatCard title="Mixed" value={profileStats.mixed} bg="#fce7f3" color="#db2777" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10, marginTop: 10 }}>
                <StatLine title="Points For" value={profileStats.pointsFor.toLocaleString()} />
                <StatLine title="Points Against" value={profileStats.pointsAgainst.toLocaleString()} />
              </div>
              <div style={{ marginTop: 12, borderRadius: 16, background: '#ccfbf1', textAlign: 'center', padding: '16px 10px', color: '#0f766e' }}>
                <div style={{ fontSize: 15 }}>Win Percentage</div>
                <div style={{ fontSize: 40, fontWeight: 800, lineHeight: 1 }}>{profileStats.winPct}%</div>
              </div>
            </div>

            <div style={{ marginTop: 16, background: '#fff', borderRadius: 20, border: '1px solid var(--border)', overflow: 'hidden' }}>
              <div style={{ padding: 16, borderBottom: '1px solid var(--border)', fontSize: 24, fontWeight: 700 }}>ELO Score History</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px', gap: 10, padding: '12px 16px', background: '#f9fafb', fontWeight: 700, color: '#6b7280' }}>
                <div>Season</div>
                <div>Club</div>
                <div style={{ textAlign: 'right' }}>ELO</div>
              </div>
              {!eloHistory.length ? <div style={{ padding: 16, color: '#6b7280' }}>No ELO history available yet.</div> : null}
              {eloHistory.map((row) => (
                <div key={`${row.season}-${row.club}`} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px', gap: 10, padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
                  <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.season}</div>
                  <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: '#4b5563' }}>{row.club}</div>
                  <div style={{ textAlign: 'right', fontWeight: 700 }}>
                    {row.elo}
                    <span style={{ marginLeft: 6, color: row.change >= 0 ? 'var(--ok)' : 'var(--bad)' }}>
                      {row.change >= 0 ? '+' : ''}
                      {row.change}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </section>
      ) : null}

      <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, borderTop: '1px solid var(--border)', background: '#fff', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', maxWidth: 1100, margin: '0 auto' }}>
        <TabButton active={tab === 'home'} onClick={() => setTab('home')} icon="⌂" label="Home" />
        <TabButton active={tab === 'leaderboard'} onClick={() => setTab('leaderboard')} icon="🏆" label="Leaderboard" />
        <TabButton active={tab === 'profile'} onClick={() => setTab('profile')} icon="◉" label="Profile" />
      </nav>
    </main>
  );
}

function HomeScreen({
  profile,
  clubs,
  recordClubId,
  selectedSession,
  recordContextError,
  recordSeasonId,
  seasons,
  players,
  courts,
  recentGames,
  allGames,
  upcomingSessions,
  allUpcomingSessions,
  onRecordClubChange,
  onRecordGame,
  onRecordSeasonChange,
  onGoHome,
  onGoLeaderboard,
  onGoProfile,
  onLogout,
}: {
  profile: Profile | null;
  clubs: Club[];
  recordClubId: number;
  selectedSession: Session | null;
  recordContextError: string | null;
  recordSeasonId: number | null;
  seasons: Season[];
  players: Player[];
  courts: Court[];
  recentGames: HomeGameRow[];
  allGames: HomeGameRow[];
  upcomingSessions: UpcomingRow[];
  allUpcomingSessions: UpcomingRow[];
  onRecordClubChange: (clubId: number) => Promise<void>;
  onRecordGame: (payload: {
    courtId: number | null;
    startTimeLocal: string;
    scoreA: number;
    scoreB: number;
    sideAPlayerIds: [number, number];
    sideBPlayerIds: [number, number];
  }) => Promise<void>;
  onRecordSeasonChange: (seasonId: number) => Promise<void>;
  onGoHome: () => void;
  onGoLeaderboard: () => void;
  onGoProfile: () => void;
  onLogout: () => void;
}) {
  const [homeMode, setHomeMode] = useState<HomeMode>('main');
  const [activeGame, setActiveGame] = useState<HomeGameRow | null>(null);
  const [activeUpcoming, setActiveUpcoming] = useState<UpcomingRow | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <section>
      <header style={{ background: '#fff', borderBottom: '1px solid var(--border)', padding: '18px 16px 14px', position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>LeagueOS</div>
            <div style={{ color: '#6b7280', fontSize: 13 }}>{profile?.display_name || profile?.email || 'Welcome'}</div>
          </div>
          <button onClick={() => setMenuOpen((v) => !v)} style={outlineBtn}>☰</button>
        </div>
        {menuOpen ? (
          <div style={{ position: 'absolute', right: 16, top: 56, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.12)', overflow: 'hidden', zIndex: 20, minWidth: 170 }}>
            <button style={menuItemBtn} onClick={() => { setMenuOpen(false); onGoHome(); }}>Home</button>
            <button style={menuItemBtn} onClick={() => { setMenuOpen(false); onGoLeaderboard(); }}>Leaderboard</button>
            <button style={menuItemBtn} onClick={() => { setMenuOpen(false); onGoProfile(); }}>Profile</button>
            <button style={{ ...menuItemBtn, color: '#dc2626' }} onClick={onLogout}>Logout</button>
          </div>
        ) : null}
      </header>

      <section style={{ maxWidth: 1100, margin: '0 auto', padding: 16 }}>
        <button
          onClick={() => setHomeMode('addGame')}
          style={{ width: '100%', border: 0, borderRadius: 18, background: 'linear-gradient(90deg, var(--teal-start), var(--teal-end))', color: '#fff', padding: '18px 14px', fontSize: 18, fontWeight: 700, boxShadow: '0 12px 28px rgba(20,184,166,.35)', cursor: 'pointer' }}
        >
          + Add Game
        </button>

        {homeMode === 'main' ? (
          <>
            <HomeTableCard
              title="Recent Games"
              action="View All →"
              onActionClick={() => setHomeMode('allGames')}
              columns={['Date', 'Season', 'Partner', 'Score']}
              rows={recentGames.map((g) => ({
                id: g.id,
                cells: [g.date, g.season, g.partner, <span key={g.id} style={{ color: g.outcome === 'W' ? 'var(--ok)' : 'var(--bad)', fontWeight: 700 }}>{g.score}</span>],
                onClick: () => {
                  setActiveGame(g);
                  setHomeMode('gameDetail');
                },
              }))}
            />

            <HomeTableCard
              title="Upcoming Sessions"
              action="View All →"
              onActionClick={() => setHomeMode('allUpcoming')}
              columns={['Date', 'Season', 'Club']}
              rows={upcomingSessions.map((g) => ({
                id: g.id,
                cells: [g.date, g.season, g.club],
                onClick: () => {
                  setActiveUpcoming(g);
                  setHomeMode('upcomingDetail');
                },
              }))}
            />
          </>
        ) : null}

        {homeMode === 'addGame' ? (
          <AddGameScreen
            clubs={clubs}
            recordClubId={recordClubId}
            session={selectedSession}
            recordContextError={recordContextError}
            recordSeasonId={recordSeasonId}
            seasons={seasons}
            players={players}
            courts={courts}
            onRecordClubChange={onRecordClubChange}
            onRecordSeasonChange={onRecordSeasonChange}
            onBack={() => setHomeMode('main')}
            onSubmit={async (payload) => {
              await onRecordGame(payload);
              setHomeMode('main');
            }}
          />
        ) : null}

        {homeMode === 'allGames' ? (
          <HomeTableCard
            title="All Games"
            action="← Back"
            onActionClick={() => setHomeMode('main')}
            columns={['Date', 'Season', 'Partner', 'Score']}
            rows={allGames.map((g) => ({
              id: g.id,
              cells: [g.date, g.season, g.partner, <span key={g.id} style={{ color: g.outcome === 'W' ? 'var(--ok)' : 'var(--bad)', fontWeight: 700 }}>{g.score}</span>],
              onClick: () => {
                setActiveGame(g);
                setHomeMode('gameDetail');
              },
            }))}
          />
        ) : null}

        {homeMode === 'allUpcoming' ? (
          <HomeTableCard
            title="All Upcoming Sessions"
            action="← Back"
            onActionClick={() => setHomeMode('main')}
            columns={['Date', 'Season', 'Club']}
            rows={allUpcomingSessions.map((g) => ({
              id: g.id,
              cells: [g.date, g.season, g.club],
              onClick: () => {
                setActiveUpcoming(g);
                setHomeMode('upcomingDetail');
              },
            }))}
          />
        ) : null}

        {homeMode === 'gameDetail' && activeGame ? (
          <DetailCard title="Game Detail" onBack={() => setHomeMode('allGames')}>
            <DetailGrid rows={[
              ['Date', activeGame.date],
              ['Season', activeGame.season],
              ['Court', activeGame.courtName],
              ['Start Time', new Date(activeGame.startTime).toLocaleString()],
              ['Partner', activeGame.partner],
              ['Result', activeGame.score],
              ['Score', `${activeGame.scoreA} - ${activeGame.scoreB}`],
              ['Team A', activeGame.teamA.join(', ')],
              ['Team B', activeGame.teamB.join(', ')],
            ]} />
          </DetailCard>
        ) : null}

        {homeMode === 'upcomingDetail' && activeUpcoming ? (
          <DetailCard title="Upcoming Session" onBack={() => setHomeMode('allUpcoming')}>
            <DetailGrid rows={[
              ['Date', activeUpcoming.date],
              ['Season', activeUpcoming.season],
              ['Club', activeUpcoming.club],
              ['Status', activeUpcoming.status],
              ['Location', activeUpcoming.location || '-'],
              ['Address', activeUpcoming.address || '-'],
            ]} />
          </DetailCard>
        ) : null}
      </section>
    </section>
  );
}

function HomeTableCard({
  title,
  action,
  onActionClick,
  columns,
  rows,
}: {
  title: string;
  action: string;
  onActionClick: () => void;
  columns: string[];
  rows: Array<{ id: number; cells: (string | JSX.Element)[]; onClick: () => void }>;
}) {
  const colTemplate = columns.length === 4 ? '90px 1fr 1fr 90px' : '90px 1fr 1fr';

  return (
    <div style={{ marginTop: 16, background: '#fff', borderRadius: 20, border: '1px solid var(--border)', overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
        <button onClick={onActionClick} style={{ border: 0, background: 'transparent', color: '#0d9488', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>{action}</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: colTemplate, gap: 10, padding: '10px 16px', background: '#f9fafb', color: '#4b5563', fontWeight: 700 }}>
        {columns.map((c) => (
          <div key={c}>{c}</div>
        ))}
      </div>
      {!rows.length ? <div style={{ padding: 14, color: '#6b7280' }}>No data available.</div> : null}
      {rows.map((r) => (
        <button key={`${title}-${r.id}`} onClick={r.onClick} style={{ width: '100%', border: 0, borderTop: '1px solid var(--border)', background: '#fff', display: 'grid', gridTemplateColumns: colTemplate, gap: 10, padding: '12px 16px', textAlign: 'left', cursor: 'pointer' }}>
          {r.cells.map((cell, idx) => (
            <div key={`${r.id}-${idx}`} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cell}</div>
          ))}
        </button>
      ))}
    </div>
  );
}

function DetailCard({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 16, background: '#fff', borderRadius: 20, border: '1px solid var(--border)', overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
        <button onClick={onBack} style={{ border: 0, background: 'transparent', color: '#0d9488', fontWeight: 700, cursor: 'pointer' }}>← Back</button>
      </div>
      <div style={{ padding: 16 }}>{children}</div>
    </div>
  );
}

function DetailGrid({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 8, borderBottom: '1px solid #f1f5f9', paddingBottom: 8 }}>
          <div style={{ color: '#64748b', fontWeight: 600 }}>{k}</div>
          <div style={{ color: '#0f172a' }}>{v}</div>
        </div>
      ))}
    </div>
  );
}

function AddGameScreen({
  clubs,
  recordClubId,
  session,
  recordContextError,
  recordSeasonId,
  seasons,
  players,
  courts,
  onRecordClubChange,
  onRecordSeasonChange,
  onBack,
  onSubmit,
}: {
  clubs: Club[];
  recordClubId: number;
  session: Session | null;
  recordContextError: string | null;
  recordSeasonId: number | null;
  seasons: Season[];
  players: Player[];
  courts: Court[];
  onRecordClubChange: (clubId: number) => Promise<void>;
  onRecordSeasonChange: (seasonId: number) => Promise<void>;
  onBack: () => void;
  onSubmit: (payload: {
    courtId: number | null;
    startTimeLocal: string;
    scoreA: number;
    scoreB: number;
    sideAPlayerIds: [number, number];
    sideBPlayerIds: [number, number];
  }) => Promise<void>;
}) {
  const nowLocal = new Date();
  const defaultTime = floorToFiveMinuteIncrement(`${String(nowLocal.getHours()).padStart(2, '0')}:${String(nowLocal.getMinutes()).padStart(2, '0')}`);

  const [courtId, setCourtId] = useState<number | null>(null);
  const [startTime, setStartTime] = useState(defaultTime);
  const [scoreA, setScoreA] = useState(21);
  const [scoreB, setScoreB] = useState(17);
  const [a1, setA1] = useState<number>(players[0]?.id ?? 0);
  const [a2, setA2] = useState<number>(players[1]?.id ?? 0);
  const [b1, setB1] = useState<number>(players[2]?.id ?? 0);
  const [b2, setB2] = useState<number>(players[3]?.id ?? 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const saveDisabled = busy || !session || Boolean(recordContextError);


  const playerOptions = players.length ? players : [{ id: 0, display_name: 'No players', club_id: 0, is_active: false, created_at: '' }];

  useEffect(() => {
    setA1(players[0]?.id ?? 0);
    setA2(players[1]?.id ?? 0);
    setB1(players[2]?.id ?? 0);
    setB2(players[3]?.id ?? 0);
  }, [players]);

  useEffect(() => {
    setCourtId(null);
  }, [courts, recordClubId, recordSeasonId]);

  return (
    <div style={{ marginTop: 16, background: '#fff', borderRadius: 20, border: '1px solid var(--border)', padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>Add Game</h2>
        <button onClick={onBack} style={outlineBtn}>← Back</button>
      </div>

      <p style={{ marginTop: 8, color: '#4b5563' }}>
        Session Date: {session ? session.session_date : 'No open session selected'}
      </p>
      {recordContextError ? <p style={{ marginTop: 6, color: 'var(--bad)', fontSize: 14 }}>{recordContextError}</p> : null}

      <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span>Club</span>
          <select value={recordClubId} onChange={(e) => void onRecordClubChange(Number(e.target.value))} style={modalInput}>
            {!clubs.length ? <option value={recordClubId}>Club {recordClubId}</option> : null}
            {clubs.map((club) => (
              <option key={club.id} value={club.id}>{club.name}</option>
            ))}
          </select>
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <span>Season (open only)</span>
          <select value={recordSeasonId ?? ''} onChange={(e) => { const next = Number(e.target.value); if (!Number.isNaN(next)) void onRecordSeasonChange(next); }} style={modalInput} disabled={!seasons.length}>
            {!seasons.length ? <option value="">No open seasons</option> : null}
            {seasons.map((season) => (
              <option key={season.id} value={season.id}>{season.name}</option>
            ))}
          </select>
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <span>Court</span>
          <select value={courtId ?? ''} onChange={(e) => setCourtId(e.target.value ? Number(e.target.value) : null)} style={modalInput}>
            <option value="">Select court</option>
            {courts.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>

        <label style={{ display: 'grid', gap: 6 }}>
          <span>Start Time</span>
          <input type="time" step={300} value={startTime} onChange={(e) => setStartTime(floorToFiveMinuteIncrement(e.target.value))} style={modalInput} />
        </label>

        <div style={{ border: '1px solid var(--border)', borderRadius: 14, background: '#f8fafc', padding: 12, display: 'grid', gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 16 }}>Teams and Score</h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span>Score A</span>
              <input type="number" min={0} value={scoreA} onChange={(e) => setScoreA(Number(e.target.value))} style={modalInput} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span>Score B</span>
              <input type="number" min={0} value={scoreB} onChange={(e) => setScoreB(Number(e.target.value))} style={modalInput} />
            </label>
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            <span>Team A</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <select value={a1} onChange={(e) => setA1(Number(e.target.value))} style={modalInput}>{playerOptions.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}</select>
              <select value={a2} onChange={(e) => setA2(Number(e.target.value))} style={modalInput}>{playerOptions.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}</select>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 6 }}>
            <span>Team B</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <select value={b1} onChange={(e) => setB1(Number(e.target.value))} style={modalInput}>{playerOptions.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}</select>
              <select value={b2} onChange={(e) => setB2(Number(e.target.value))} style={modalInput}>{playerOptions.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}</select>
            </div>
          </div>
        </div>

        {error ? <div style={{ color: 'var(--bad)', fontSize: 14 }}>{error}</div> : null}

        <button
          style={{
            border: 0,
            borderRadius: 12,
            background: 'linear-gradient(90deg, var(--teal-start), var(--teal-end))',
            color: '#fff',
            padding: '12px 14px',
            fontWeight: 700,
            cursor: saveDisabled ? 'not-allowed' : 'pointer',
            opacity: saveDisabled ? 0.65 : 1,
          }}
          disabled={saveDisabled}
          onClick={async () => {
            setError(null);
            const validationError = validateAddGameInput({
              courtId,
              scoreA,
              scoreB,
              sideAPlayerIds: [a1, a2],
              sideBPlayerIds: [b1, b2],
              sessionId: session?.id ?? null,
              startTime,
            });
            if (validationError) {
              setError(validationError);
              return;
            }

            try {
              setBusy(true);
              await onSubmit({ courtId, startTimeLocal: floorToFiveMinuteIncrement(startTime), scoreA, scoreB, sideAPlayerIds: [a1, a2], sideBPlayerIds: [b1, b2] });
            } catch (e) {
              if (e instanceof ApiError && e.code === 'GAME_CONFLICT') {
                const [hoursRaw, minutesRaw] = floorToFiveMinuteIncrement(startTime).split(':');
                const hours = Number(hoursRaw);
                const minutes = Number(minutesRaw);
                if (Number.isInteger(hours) && Number.isInteger(minutes)) {
                  const next = new Date(0, 0, 1, hours, minutes + 5, 0, 0);
                  setStartTime(`${String(next.getHours()).padStart(2, '0')}:${String(next.getMinutes()).padStart(2, '0')}`);
                }
                setError('A game already exists for this court and start time. Time moved to the next 5-minute slot.');
              } else if (e instanceof ApiError && e.code === 'INVALID_GAME_TIME') {
                setError('Start time must be on a 5-minute boundary. Try 7:00, 7:05, 7:10.');
              } else if (e instanceof ApiError && e.code === 'SESSION_IMMUTABLE') {
                setError('Selected session is not writable anymore. Select a season with one OPEN session.');
              } else {
                setError(e instanceof Error ? e.message : 'Failed to add game');
              }
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Saving...' : 'Save Game'}
        </button>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: string; label: string }) {
  return (
    <button onClick={onClick} style={{ border: 0, background: '#fff', padding: '8px 4px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, color: active ? '#0d9488' : '#6b7280', fontWeight: active ? 700 : 500, cursor: 'pointer' }}>
      <span style={{ fontSize: 20 }}>{icon}</span>
      <span style={{ fontSize: 13 }}>{label}</span>
    </button>
  );
}

function StatCard({ title, value, bg, color }: { title: string; value: number; bg: string; color: string }) {
  return (
    <div style={{ background: bg, borderRadius: 16, padding: '14px 8px', textAlign: 'center' }}>
      <div style={{ fontSize: 36, fontWeight: 800, lineHeight: 1, color }}>{value}</div>
      <div style={{ marginTop: 8, color: '#4b5563', fontSize: 14 }}>{title}</div>
    </div>
  );
}

function StatLine({ title, value }: { title: string; value: string }) {
  return (
    <div style={{ background: '#f9fafb', borderRadius: 14, padding: '12px 14px' }}>
      <div style={{ color: '#4b5563', fontSize: 14 }}>{title}</div>
      <div style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.05, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function rankBadge(rank: number) {
  if (rank === 1) return '🥇';
  if (rank === 2) return '🥈';
  if (rank === 3) return '🥉';
  return rank;
}

const leaderboardHeaderRow: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '70px 1fr 120px 120px 120px 120px',
  gap: 10,
  padding: '12px 14px',
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--muted)',
  background: '#f9fafb',
  borderBottom: '1px solid var(--border)',
};

const leaderboardRow: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '70px 1fr 120px 120px 120px 120px',
  gap: 10,
  padding: '12px 14px',
  borderBottom: '1px solid var(--border)',
  alignItems: 'center',
};

const linkBtn: React.CSSProperties = {
  border: 0,
  background: 'transparent',
  color: '#0f172a',
  cursor: 'pointer',
  padding: 0,
};

const menuItemBtn: React.CSSProperties = {
  width: '100%',
  border: 0,
  background: '#fff',
  textAlign: 'left',
  padding: '10px 12px',
  cursor: 'pointer',
  borderBottom: '1px solid #f1f5f9',
};

const selectStyle: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,0.45)',
  borderRadius: 12,
  padding: '10px 12px',
  background: 'rgba(255,255,255,0.2)',
  color: '#fff',
};

const ghostBtn: React.CSSProperties = {
  border: '1px solid rgba(255,255,255,0.45)',
  borderRadius: 10,
  color: '#fff',
  background: 'transparent',
  padding: '8px 10px',
  cursor: 'pointer',
};

const outlineBtn: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 10,
  background: '#fff',
  padding: '8px 10px',
  cursor: 'pointer',
};

const modalInput: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '10px 12px',
  width: '100%',
};
