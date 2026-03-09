'use client';

import { useEffect, useRef, useState } from 'react';
import { ApiError } from '@leagueos/api';
import type { Club, Court, LeaderboardEntry, Player, Profile, Season, Session, TeamLeaderboardEntry } from '@leagueos/schemas';
import { floorToFiveMinuteIncrement, validateAddGameInput, validateBadmintonEndScore } from './addGameLogic';

type TabKey = 'home' | 'leaderboard' | 'profile';
type LeaderboardMode = 'player' | 'team';
type HomeMode = 'main' | 'addGame' | 'allGames' | 'gameDetail' | 'allUpcoming' | 'upcomingDetail';

export type HomeGameRow = {
  id: number;
  sessionId: number;
  sessionStatus?: 'UPCOMING' | 'OPEN' | 'CLOSED' | 'FINALIZED' | 'CANCELLED';
  status: 'CREATED' | 'FINALIZED';
  createdBy: string;
  date: string;
  season: string;
  partner: string;
  score: string;
  outcome: 'W' | 'L';
  startTime: string;
  courtId: number;
  courtName: string;
  teamA: string[];
  teamB: string[];
  teamAIds: number[];
  teamBIds: number[];
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
  teamLeaderboard: TeamLeaderboardEntry[];
  enableTeamRanking: boolean;
  recordSeasons: Season[];
  players: Player[];
  courts: Court[];
  loading: boolean;
  error: string | null;
  successMessage: string | null;
  recordContextError: string | null;
  profileStats: ProfileStatSummary;
  eloHistory: EloHistoryRow[];
  recentGames: HomeGameRow[];
  allGames: HomeGameRow[];
  recordExistingGames: HomeGameRow[];
  upcomingSessions: UpcomingRow[];
  allUpcomingSessions: UpcomingRow[];
  onRecordClubChange: (clubId: number) => Promise<void>;
  onClubChange: (clubId: number) => Promise<void>;
  onSeasonChange: (seasonId: number) => Promise<void>;
  canCreateSeason: boolean;
  allowProfilePlayerPick: boolean;
  profilePlayers: Player[];
  selectedProfilePlayerId: number | null;
  showFinalizeAction: boolean;
  canFinalizeSession: boolean;
  canRevertSessionFinalize: boolean;
  canManageRecords: boolean;
  canOpenSession: boolean;
  onFinalizeSession: () => Promise<void>;
  onRevertSessionFinalize: () => Promise<void>;
  onRecordGame: (payload: {
    courtId: number | null;
    startTimeLocal: string;
    scoreA: number;
    scoreB: number;
    sideAPlayerIds: [number, number];
    sideBPlayerIds: [number, number];
  }) => Promise<void>;
  onUpdateGame: (gameId: number, payload: {
    courtId: number | null;
    startTimeLocal: string;
    scoreA: number;
    scoreB: number;
    sideAPlayerIds: [number, number];
    sideBPlayerIds: [number, number];
  }) => Promise<void>;
  onRecordSeasonChange: (seasonId: number) => Promise<void>;
  onCreateSeason: (payload: {
    name: string;
    format: 'SINGLES' | 'DOUBLES' | 'MIXED_DOUBLES';
    weekday: number;
    start_time_local: string;
    is_active: boolean;
  }) => Promise<void>;
  onOpenSession: (args: { fromDate: string; toDate: string; startTime: string }) => Promise<void>;
  onProfilePlayerChange: (playerId: number) => Promise<void>;
  onToggleLeaderboardVisibility: (visible: boolean) => Promise<void>;
  onLogout: () => void;
};

const PROFILE_AVATAR_OPTIONS: Array<{ id: string; emoji: string; label: string; gradient: string }> = [
  { id: 'shuttle-pro', emoji: '🏸', label: 'Shuttle Pro', gradient: 'linear-gradient(135deg,#0f766e,#14b8a6)' },
  { id: 'smash-star', emoji: '💥', label: 'Smash Star', gradient: 'linear-gradient(135deg,#7c3aed,#a78bfa)' },
  { id: 'trophy-chaser', emoji: '🏆', label: 'Trophy Chaser', gradient: 'linear-gradient(135deg,#d97706,#f59e0b)' },
  { id: 'rally-ace', emoji: '🎯', label: 'Rally Ace', gradient: 'linear-gradient(135deg,#0f766e,#22c55e)' },
  { id: 'lightning-shot', emoji: '⚡', label: 'Lightning Shot', gradient: 'linear-gradient(135deg,#be123c,#f43f5e)' },
  { id: 'phoenix-player', emoji: '🔥', label: 'Phoenix Player', gradient: 'linear-gradient(135deg,#b45309,#f97316)' },
];

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
    teamLeaderboard,
    enableTeamRanking,
    recordSeasons,
    players,
    courts,
    loading,
    error,
    successMessage,
    recordContextError,
    profileStats,
    eloHistory,
    recentGames,
    allGames,
    recordExistingGames,
    upcomingSessions,
    allUpcomingSessions,
    onRecordClubChange,
    onClubChange,
    onSeasonChange,
    canCreateSeason,
    allowProfilePlayerPick,
    profilePlayers,
    selectedProfilePlayerId,
    showFinalizeAction,
    canFinalizeSession,
    canRevertSessionFinalize,
    canManageRecords,
    canOpenSession,
    onFinalizeSession,
    onRevertSessionFinalize,
    onRecordGame,
    onUpdateGame,
    onRecordSeasonChange,
    onCreateSeason,
    onOpenSession,
    onProfilePlayerChange,
    onToggleLeaderboardVisibility,
    onLogout,
  } = props;

  const [tab, setTab] = useState<TabKey>('home');
  const [leaderboardMode, setLeaderboardMode] = useState<LeaderboardMode>('player');
  const tabStorageGlobalKey = 'leagueos.player.selectedTab';
  const tabStorageProfileKey = profile?.email ? `leagueos.player.selectedTab.${profile.email.toLowerCase()}` : null;
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);
  const [selectedAvatarId, setSelectedAvatarId] = useState<string>(PROFILE_AVATAR_OPTIONS[0]?.id ?? 'shuttle-pro');
  const [createSeasonOpen, setCreateSeasonOpen] = useState(false);
  const [createSeasonName, setCreateSeasonName] = useState('');
  const [createSeasonFormat, setCreateSeasonFormat] = useState<'SINGLES' | 'DOUBLES' | 'MIXED_DOUBLES'>('DOUBLES');
  const [createSeasonWeekday, setCreateSeasonWeekday] = useState(2);
  const [createSeasonStartTime, setCreateSeasonStartTime] = useState('19:00');
  const [createSeasonBusy, setCreateSeasonBusy] = useState(false);
  const [createSeasonError, setCreateSeasonError] = useState<string | null>(null);
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [leaderboardPlayerPreview, setLeaderboardPlayerPreview] = useState<{ row: LeaderboardEntry; rank: number } | null>(null);
  const [homeResetSignal, setHomeResetSignal] = useState(0);
  const [profileFocusSection, setProfileFocusSection] = useState<'preferences' | null>(null);
  const [preferencesExpanded, setPreferencesExpanded] = useState(false);
  const preferencesSectionRef = useRef<HTMLDivElement | null>(null);
  const profileDisplayName = profile?.display_name || profile?.full_name || 'LeagueOS User';
  const profileInitials = profileDisplayName
    .split(' ')
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  const topFormat =
    profileStats.doubles >= profileStats.singles && profileStats.doubles >= profileStats.mixed
      ? 'DOUBLES'
      : profileStats.singles >= profileStats.mixed
        ? 'SINGLES'
        : 'MIXED';
  const topFormatEmoji = topFormat === 'DOUBLES' ? '🏸🏸' : topFormat === 'SINGLES' ? '🏸' : '🏸✨';
  const profileTier =
    profileStats.winPct >= 75
      ? { label: 'Smash Elite', emoji: '🥇' }
      : profileStats.winPct >= 50
        ? { label: 'Rally Pro', emoji: '🔥' }
        : { label: 'In Training', emoji: '🎯' };
  const selectedAvatar = PROFILE_AVATAR_OPTIONS.find((option) => option.id === selectedAvatarId) ?? PROFILE_AVATAR_OPTIONS[0];
  const avatarStorageKey = profile?.email ? `leagueos.profile.avatar.${profile.email.toLowerCase()}` : null;
  const showOnLeaderboard = profile?.show_on_leaderboard ?? true;
  const hideFromLeaderboard = !showOnLeaderboard;

  useEffect(() => {
    if (!enableTeamRanking && leaderboardMode !== 'player') {
      setLeaderboardMode('player');
    }
  }, [enableTeamRanking, leaderboardMode]);

  useEffect(() => {
    if (!avatarStorageKey || typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(avatarStorageKey);
      if (!raw) {
        setAvatarPreview(null);
        setSelectedAvatarId(PROFILE_AVATAR_OPTIONS[0]?.id ?? 'shuttle-pro');
        return;
      }
      const parsed = JSON.parse(raw) as { avatarPreview?: string | null; selectedAvatarId?: string | null };
      setAvatarPreview(parsed.avatarPreview ?? null);
      const nextId = parsed.selectedAvatarId ?? PROFILE_AVATAR_OPTIONS[0]?.id ?? 'shuttle-pro';
      setSelectedAvatarId(PROFILE_AVATAR_OPTIONS.some((option) => option.id === nextId) ? nextId : (PROFILE_AVATAR_OPTIONS[0]?.id ?? 'shuttle-pro'));
    } catch {
      setAvatarPreview(null);
      setSelectedAvatarId(PROFILE_AVATAR_OPTIONS[0]?.id ?? 'shuttle-pro');
    }
  }, [avatarStorageKey]);

  useEffect(() => {
    if (!avatarStorageKey || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        avatarStorageKey,
        JSON.stringify({
          avatarPreview,
          selectedAvatarId,
        }),
      );
    } catch {
      // ignore storage errors
    }
  }, [avatarStorageKey, avatarPreview, selectedAvatarId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = tabStorageProfileKey
        ? window.localStorage.getItem(tabStorageProfileKey) ?? window.localStorage.getItem(tabStorageGlobalKey)
        : window.localStorage.getItem(tabStorageGlobalKey);
      if (stored === 'home' || stored === 'leaderboard' || stored === 'profile') {
        setTab(stored);
      }
    } catch {
      // ignore storage errors
    }
  }, [tabStorageProfileKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(tabStorageGlobalKey, tab);
      if (tabStorageProfileKey) {
        window.localStorage.setItem(tabStorageProfileKey, tab);
      }
    } catch {
      // ignore storage errors
    }
  }, [tab, tabStorageGlobalKey, tabStorageProfileKey]);

  useEffect(() => {
    if (tab !== 'profile' || profileFocusSection !== 'preferences') return;
    setPreferencesExpanded(true);
    const timer = window.setTimeout(() => {
      preferencesSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [tab, profileFocusSection]);

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', paddingBottom: 90 }}>
      {tab === 'home' ? (
        <HomeScreen
          resetSignal={homeResetSignal}
          profile={profile}
          avatarPreview={avatarPreview}
          avatarGradient={selectedAvatar.gradient}
          avatarEmoji={selectedAvatar.emoji}
          profileInitials={profileInitials}
          profileTierTag={`${profileTier.emoji} ${profileTier.label}`}
          profileFormatTag={`${topFormatEmoji} ${topFormat}`}
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
          recordExistingGames={recordExistingGames}
          upcomingSessions={upcomingSessions}
          allUpcomingSessions={allUpcomingSessions}
          onRecordClubChange={onRecordClubChange}
          onRecordGame={onRecordGame}
          onUpdateGame={onUpdateGame}
          onRecordSeasonChange={onRecordSeasonChange}
          canOpenSession={canOpenSession}
          onOpenSession={onOpenSession}
          canManageRecords={canManageRecords}
          onGoHome={() => setTab('home')}
          onGoLeaderboard={() => setTab('leaderboard')}
          onGoProfile={() => {
            setTab('profile');
            setProfileFocusSection(null);
          }}
          onGoPreferences={() => {
            setTab('profile');
            setProfileFocusSection('preferences');
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {canCreateSeason ? (
                  <button
                    onClick={() => {
                      setCreateSeasonError(null);
                      setCreateSeasonOpen(true);
                    }}
                    style={outlineBtn}
                    disabled={loading}
                    title="Create a new season for this club."
                  >
                    {loading ? 'Processing...' : 'Create Season'}
                  </button>
                ) : null}
                {showFinalizeAction ? (
                  <>
                    <button
                      onClick={() => {
                        const shouldFinalize = window.confirm(
                          'Finalize this session now? This will apply Elo updates and lock the session from further changes.',
                        );
                        if (!shouldFinalize) return;
                        void onFinalizeSession();
                      }}
                      style={primaryBtn}
                      disabled={loading || !canFinalizeSession}
                      title={canFinalizeSession ? 'Finalize this closed session and apply Elo updates.' : 'Session must be CLOSED before finalizing.'}
                    >
                      {loading ? 'Processing...' : 'Finalize Session'}
                    </button>
                    <button
                      onClick={() => {
                        const shouldRevert = window.confirm(
                          'Revert this finalized session to CLOSED? This will remove applied Elo ledger rows so scores can be corrected.',
                        );
                        if (!shouldRevert) return;
                        void onRevertSessionFinalize();
                      }}
                      style={outlineBtn}
                      disabled={loading || !canRevertSessionFinalize}
                      title={canRevertSessionFinalize ? 'Revert finalized ratings so corrections can be made.' : 'Only FINALIZED sessions can be reverted.'}
                    >
                      {loading ? 'Processing...' : 'Revert Finalize'}
                    </button>
                  </>
                ) : null}
              </div>
            </div>

            {showFinalizeAction && selectedSession && !canFinalizeSession && !canRevertSessionFinalize ? (
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
                {selectedSession.status === 'FINALIZED' ? 'Session already finalized.' : 'Session must be CLOSED before finalization.'}
              </div>
            ) : null}

            {successMessage ? (
              <div style={{ marginBottom: 10, color: '#065f46', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 10, padding: '8px 10px', fontSize: 13 }}>
                {successMessage}
              </div>
            ) : null}

            {error ? <div style={{ color: 'var(--bad)', marginBottom: 8 }}>{error}</div> : null}

            <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' }}>
              <div style={{ display: 'flex', gap: 8, padding: '14px 16px 0' }}>
                <button
                  type="button"
                  onClick={() => setLeaderboardMode('player')}
                  style={leaderboardMode === 'player' ? primaryBtn : outlineBtn}
                >
                  Player Ranking
                </button>
                {enableTeamRanking ? (
                  <button
                    type="button"
                    onClick={() => setLeaderboardMode('team')}
                    style={leaderboardMode === 'team' ? primaryBtn : outlineBtn}
                  >
                    Team Ranking
                  </button>
                ) : null}
              </div>
              <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
                {leaderboardMode === 'player' ? (
                  <>
                    <div style={leaderboardHeaderRow}>
                      <div style={{ textAlign: 'center' }}>#</div>
                      <div>Player</div>
                      <div style={{ textAlign: 'center' }}>Delta</div>
                      <div style={{ textAlign: 'center' }}>Played</div>
                      <div style={{ textAlign: 'center' }}>Won</div>
                      <div style={{ textAlign: 'left' }}>ELO</div>
                    </div>

                    {!leaderboard.length ? (
                      <div style={{ padding: 22, color: 'var(--muted)' }}>No leaderboard data for this season/session yet.</div>
                    ) : (
                      leaderboard.map((row, i) => {
                        const rowRank = row.rank ?? (i + 1);
                        return (
                        <div key={row.player_id} style={leaderboardRow}>
                          <div style={{ textAlign: 'center' }}>{rankBadge(rowRank)}</div>
                          <button
                            style={{ ...linkBtn, textAlign: 'left', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}
                            onClick={() => {
                              setLeaderboardPlayerPreview({ row, rank: rowRank });
                            }}
                          >
                            {(() => {
                              const rowName = (row.display_name || '').trim();
                              const rowNameLower = rowName.toLowerCase();
                              const currentNames = [
                                profileDisplayName,
                                profile?.display_name || '',
                                profile?.full_name || '',
                              ].map((v) => String(v || '').trim().toLowerCase()).filter(Boolean);
                              const isCurrentProfileRow = currentNames.includes(rowNameLower);
                              const initials = rowName
                                .split(' ')
                                .filter(Boolean)
                                .slice(0, 2)
                                .map((part) => part[0]?.toUpperCase() || '')
                                .join('') || 'P';
                              const hash = rowNameLower.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
                              const fallbackBg = `hsl(${hash % 360} 62% 38%)`;
                              return (
                                <>
                                  <span
                                    style={{
                                      width: 20,
                                      height: 20,
                                      borderRadius: '50%',
                                      overflow: 'hidden',
                                      display: 'grid',
                                      placeItems: 'center',
                                      background: isCurrentProfileRow ? (avatarPreview ? '#e2e8f0' : selectedAvatar.gradient) : fallbackBg,
                                      color: '#fff',
                                      fontSize: 9,
                                      fontWeight: 800,
                                      lineHeight: 1,
                                      border: '1px solid rgba(255,255,255,0.75)',
                                      boxShadow: '0 0 0 1px rgba(148,163,184,.35)',
                                      flexShrink: 0,
                                    }}
                                  >
                                    {isCurrentProfileRow && avatarPreview ? (
                                      <img src={avatarPreview} alt="Profile avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : (
                                      initials
                                    )}
                                  </span>
                                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.display_name}</span>
                                </>
                              );
                            })()}
                          </button>
                          <div style={{ textAlign: 'center', color: row.season_elo_delta >= 0 ? 'var(--ok)' : 'var(--bad)' }}>
                            {row.season_elo_delta >= 0 ? '+' : ''}
                            {row.season_elo_delta}
                          </div>
                          <div style={{ textAlign: 'center' }}>{row.matches_played ?? 0}</div>
                          <div style={{ textAlign: 'center' }}>{row.matches_won}</div>
                          <div style={{ textAlign: 'left', fontWeight: 700 }}>{row.global_elo_score ?? 1000}</div>
                        </div>
                      );
                      })
                    )}
                  </>
                ) : (
                  <>
                    <div style={leaderboardHeaderRow}>
                      <div style={{ textAlign: 'center' }}>#</div>
                      <div>Team</div>
                      <div style={{ textAlign: 'center' }}>Delta</div>
                      <div style={{ textAlign: 'center' }}>Played</div>
                      <div style={{ textAlign: 'center' }}>Won</div>
                      <div style={{ textAlign: 'left' }}>ELO</div>
                    </div>
                    {!teamLeaderboard.length ? (
                      <div style={{ padding: 22, color: 'var(--muted)' }}>No team ranking data for this club and season yet.</div>
                    ) : (
                      teamLeaderboard.map((row) => (
                        <div key={row.pair_key} style={leaderboardRow}>
                          <div style={{ textAlign: 'center' }}>{rankBadge(row.rank)}</div>
                          <div style={{ fontWeight: 600, minWidth: 0, lineHeight: 1.25, color: 'var(--text)' }}>
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {row.player_a_display_name}
                            </div>
                            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              / {row.player_b_display_name}
                            </div>
                          </div>
                          <div style={{ textAlign: 'center', color: row.season_elo_delta >= 0 ? 'var(--ok)' : 'var(--bad)' }}>
                            {row.season_elo_delta >= 0 ? '+' : ''}
                            {row.season_elo_delta}
                          </div>
                          <div style={{ textAlign: 'center' }}>{row.matches_played}</div>
                          <div style={{ textAlign: 'center' }}>{row.matches_won}</div>
                          <div style={{ textAlign: 'left', fontWeight: 700 }}>{row.current_elo}</div>
                        </div>
                      ))
                    )}
                  </>
                )}
              </div>
            </div>
          </section>
        </section>
      ) : null}

      {leaderboardPlayerPreview ? (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.45)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 1000,
            padding: 16,
          }}
          onClick={() => setLeaderboardPlayerPreview(null)}
        >
          <div
            style={{
              width: 'min(460px, 100%)',
              background: '#fff',
              borderRadius: 16,
              border: '1px solid var(--border)',
              boxShadow: '0 20px 60px rgba(15,23,42,.3)',
              padding: 16,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0, fontSize: 20, color: '#0f172a' }}>Player Profile</h3>
              <button style={outlineBtn} onClick={() => setLeaderboardPlayerPreview(null)}>Close</button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              {(() => {
                const rowName = (leaderboardPlayerPreview.row.display_name || '').trim();
                const rowNameLower = rowName.toLowerCase();
                const currentNames = [
                  profileDisplayName,
                  profile?.display_name || '',
                  profile?.full_name || '',
                ].map((v) => String(v || '').trim().toLowerCase()).filter(Boolean);
                const isCurrentProfileRow = currentNames.includes(rowNameLower);
                const initials = rowName
                  .split(' ')
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((part) => part[0]?.toUpperCase() || '')
                  .join('') || 'P';
                const hash = rowNameLower.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
                const fallbackBg = `hsl(${hash % 360} 62% 38%)`;

                return (
                  <span
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: '50%',
                      overflow: 'hidden',
                      display: 'grid',
                      placeItems: 'center',
                      background: isCurrentProfileRow ? (avatarPreview ? '#e2e8f0' : selectedAvatar.gradient) : fallbackBg,
                      color: '#fff',
                      fontSize: 18,
                      fontWeight: 800,
                      lineHeight: 1,
                      border: '2px solid rgba(255,255,255,0.9)',
                      boxShadow: '0 0 0 1px rgba(148,163,184,.35)',
                      flexShrink: 0,
                    }}
                  >
                    {isCurrentProfileRow && avatarPreview ? (
                      <img src={avatarPreview} alt="Profile avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      initials
                    )}
                  </span>
                );
              })()}
              <div>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a' }}>{leaderboardPlayerPreview.row.display_name}</div>
                <div style={{ fontSize: 13, color: '#64748b' }}>Rank #{leaderboardPlayerPreview.rank}</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10 }}>
              <StatLine title="ELO" value={String(leaderboardPlayerPreview.row.global_elo_score ?? 1000)} />
              <StatLine
                title="Delta"
                value={`${leaderboardPlayerPreview.row.season_elo_delta >= 0 ? '+' : ''}${leaderboardPlayerPreview.row.season_elo_delta}`}
              />
              <StatLine title="Played" value={String(leaderboardPlayerPreview.row.matches_played ?? 0)} />
              <StatLine title="Won" value={String(leaderboardPlayerPreview.row.matches_won)} />
            </div>
          </div>
        </div>
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
                  background: avatarPreview ? '#e2e8f0' : selectedAvatar.gradient,
                  border: '3px solid #fff',
                  position: 'relative',
                  overflow: 'hidden',
                  display: 'grid',
                  placeItems: 'center',
                  color: '#fff',
                  cursor: 'pointer',
                }}
                onClick={() => setAvatarPickerOpen(true)}
                title="Choose avatar"
              >
                {avatarPreview ? <img src={avatarPreview} alt="Profile avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
                {!avatarPreview ? (
                  <div style={{ display: 'grid', placeItems: 'center', lineHeight: 1 }}>
                    <div style={{ fontSize: 22 }}>{selectedAvatar.emoji}</div>
                    <div style={{ fontSize: 16, fontWeight: 800 }}>{profileInitials || 'P'}</div>
                  </div>
                ) : null}
                <button
                  style={{ position: 'absolute', right: -2, bottom: -2, border: 0, borderRadius: '50%', width: 28, height: 28, background: '#fff', boxShadow: '0 4px 10px rgba(0,0,0,.16)', cursor: 'pointer' }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setAvatarPickerOpen(true);
                  }}
                  aria-label="Change avatar"
                >
                  ✨
                </button>
              </div>
              <div style={{ marginTop: 10, fontSize: 28, fontWeight: 700 }}>
                {profileDisplayName}
              </div>
              <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                <span style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.35)', borderRadius: 999, padding: '4px 10px', fontSize: 13 }}>
                  {profileTier.emoji} {profileTier.label}
                </span>
                <span style={{ background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.35)', borderRadius: 999, padding: '4px 10px', fontSize: 13 }}>
                  {topFormatEmoji} {topFormat}
                </span>
              </div>
              {allowProfilePlayerPick ? (
                <div style={{ marginTop: 10, width: 'min(420px, 100%)' }}>
                  <select
                    value={selectedProfilePlayerId ?? ''}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      if (!Number.isNaN(next)) {
                        void onProfilePlayerChange(next);
                      }
                    }}
                    style={{ ...modalInput, background: 'rgba(255,255,255,0.96)' }}
                  >
                    <option value="">Select player</option>
                    {profilePlayers.map((p) => (
                      <option key={p.id} value={p.id}>{p.display_name}</option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>
          </header>

          {avatarPickerOpen ? (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'grid', placeItems: 'center', zIndex: 1000, padding: 16 }}>
              <div style={{ width: 'min(560px, 100%)', background: '#fff', borderRadius: 16, border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(15,23,42,.3)', padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h3 style={{ margin: 0, fontSize: 20, color: '#0f172a' }}>Choose Your Avatar</h3>
                  <button style={outlineBtn} onClick={() => setAvatarPickerOpen(false)}>Close</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 10 }}>
                  {PROFILE_AVATAR_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      style={{
                        border: option.id === selectedAvatarId && !avatarPreview ? '2px solid #0f766e' : '1px solid #dbe3ef',
                        borderRadius: 12,
                        background: option.gradient,
                        color: '#fff',
                        padding: '10px 8px',
                        display: 'grid',
                        placeItems: 'center',
                        gap: 4,
                        cursor: 'pointer',
                      }}
                      onClick={() => {
                        setSelectedAvatarId(option.id);
                        setAvatarPreview(null);
                        setAvatarPickerOpen(false);
                      }}
                    >
                      <span style={{ fontSize: 24 }}>{option.emoji}</span>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>{option.label}</span>
                    </button>
                  ))}
                </div>
                <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  {avatarPreview ? (
                    <button style={outlineBtn} onClick={() => setAvatarPreview(null)}>
                      Remove Photo
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          <section style={{ maxWidth: 1100, margin: '-12px auto 0', padding: '0 16px 16px' }}>
            <div style={{ background: '#fff', borderRadius: 20, border: '1px solid var(--border)', boxShadow: '0 8px 24px rgba(0,0,0,.06)', padding: 16 }}>
              <h2 style={{ margin: 0, fontSize: 22 }}>Headline Statistics</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,minmax(0,1fr))', gap: 10, marginTop: 12 }}>
                <StatCard title="Singles 🏸" value={profileStats.singles} bg="#dbeafe" color="#2563eb" />
                <StatCard title="Doubles 🏸🏸" value={profileStats.doubles} bg="#ede9fe" color="#7c3aed" />
                <StatCard title="Mixed ✨" value={profileStats.mixed} bg="#fce7f3" color="#db2777" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 10, marginTop: 10 }}>
                <StatLine title="Points For 🚀" value={profileStats.pointsFor.toLocaleString()} />
                <StatLine title="Points Against 🛡️" value={profileStats.pointsAgainst.toLocaleString()} />
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

            <div ref={preferencesSectionRef} style={{ marginTop: 16, background: '#fff', borderRadius: 20, border: '1px solid var(--border)', boxShadow: '0 8px 24px rgba(0,0,0,.04)', overflow: 'hidden' }}>
              <button
                type="button"
                onClick={() => setPreferencesExpanded((prev) => !prev)}
                style={{
                  width: '100%',
                  border: 0,
                  background: 'transparent',
                  padding: 16,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  textAlign: 'left',
                  cursor: 'pointer',
                  color: '#0f172a',
                }}
                aria-expanded={preferencesExpanded}
                aria-controls="user-preferences-panel"
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <span
                    aria-hidden="true"
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 10,
                      display: 'grid',
                      placeItems: 'center',
                      background: '#f1f5f9',
                      border: '1px solid var(--border)',
                      fontSize: 16,
                      flexShrink: 0,
                    }}
                  >
                    ⚙️
                  </span>
                  <div>
                    <h2 style={{ margin: 0, fontSize: 18 }}>User Preferences</h2>
                    <div style={{ marginTop: 8, color: '#64748b', fontSize: 13, lineHeight: 1.5 }}>
                      Personal settings for how your account behaves in the app.
                    </div>
                  </div>
                </div>
                <span style={{ fontSize: 20, color: '#64748b', flexShrink: 0 }}>
                  {preferencesExpanded ? '⌃' : '⌄'}
                </span>
              </button>
              {preferencesExpanded ? (
                <div id="user-preferences-panel" style={{ padding: '0 16px 16px' }}>
                  <div style={{ display: 'grid', gap: 12 }}>
                    <div style={{ width: 'min(520px, 100%)', background: '#f8fafc', borderRadius: 12, border: '1px solid var(--border)', padding: '12px 14px', color: '#0f172a' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: '#64748b', marginBottom: 8 }}>
                        Leaderboard Privacy
                      </div>
                      <button
                        type="button"
                        aria-label="Hide my name on leaderboard"
                        aria-pressed={hideFromLeaderboard}
                        onClick={() => void onToggleLeaderboardVisibility(hideFromLeaderboard)}
                        style={{
                          width: '100%',
                          border: 0,
                          background: 'transparent',
                          padding: 0,
                          margin: 0,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          cursor: 'pointer',
                          textAlign: 'left',
                          color: '#0f172a',
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            width: 24,
                            height: 24,
                            borderRadius: 6,
                            border: `2px solid ${hideFromLeaderboard ? '#0f766e' : '#94a3b8'}`,
                            background: hideFromLeaderboard ? '#0f766e' : '#fff',
                            display: 'grid',
                            placeItems: 'center',
                            color: '#fff',
                            fontSize: 15,
                            fontWeight: 800,
                            flexShrink: 0,
                          }}
                        >
                          {hideFromLeaderboard ? '✓' : ''}
                        </span>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>Hide my name on leaderboard</span>
                      </button>
                      <div style={{ fontSize: 12, marginTop: 6, color: '#334155', lineHeight: 1.5 }}>
                        Turn this on to hide your name from leaderboard results. Your games and ELO still count in standings and calculations.
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </section>
        </section>
      ) : null}

      <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, borderTop: '1px solid var(--border)', background: '#fff', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', maxWidth: 1100, margin: '0 auto', zIndex: 90 }}>
        <TabButton
          active={tab === 'home'}
          onClick={() => {
            setTab('home');
            setHomeResetSignal((prev) => prev + 1);
          }}
          icon="⌂"
          label="Home"
        />
        <TabButton active={tab === 'leaderboard'} onClick={() => setTab('leaderboard')} icon="🏆" label="Leaderboard" />
        <TabButton active={tab === 'profile'} onClick={() => setTab('profile')} icon="◉" label="Profile" />
      </nav>

      {createSeasonOpen ? (
        <div style={seasonModalBackdrop}>
          <div style={seasonModalCard}>
            <h3 style={{ margin: 0, fontSize: 20, color: '#0f172a' }}>Create Season</h3>
            <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ color: '#0f766e', fontWeight: 600 }}>Season Name</span>
                <input
                  value={createSeasonName}
                  onChange={(e) => setCreateSeasonName(e.target.value)}
                  style={modalInput}
                  placeholder="e.g. Summer League 2026"
                />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ color: '#0f766e', fontWeight: 600 }}>Format</span>
                <select value={createSeasonFormat} onChange={(e) => setCreateSeasonFormat(e.target.value as 'SINGLES' | 'DOUBLES' | 'MIXED_DOUBLES')} style={modalInput}>
                  <option value="DOUBLES">DOUBLES</option>
                  <option value="SINGLES">SINGLES</option>
                  <option value="MIXED_DOUBLES">MIXED_DOUBLES</option>
                </select>
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: '#0f766e', fontWeight: 600 }}>Weekday (0-6)</span>
                  <input
                    type="number"
                    min={0}
                    max={6}
                    value={createSeasonWeekday}
                    onChange={(e) => setCreateSeasonWeekday(Number(e.target.value))}
                    style={modalInput}
                  />
                </label>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: '#0f766e', fontWeight: 600 }}>Start Time</span>
                  <input
                    type="time"
                    value={createSeasonStartTime}
                    onChange={(e) => setCreateSeasonStartTime(e.target.value)}
                    style={modalInput}
                  />
                </label>
              </div>
              {createSeasonError ? <div style={{ color: 'var(--bad)', fontSize: 13 }}>{createSeasonError}</div> : null}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <button
                style={outlineBtn}
                onClick={() => {
                  if (createSeasonBusy) return;
                  setCreateSeasonOpen(false);
                }}
                disabled={createSeasonBusy}
              >
                Cancel
              </button>
              <button
                style={primaryBtn}
                disabled={createSeasonBusy}
                onClick={async () => {
                  setCreateSeasonError(null);
                  const name = createSeasonName.trim();
                  if (!name) {
                    setCreateSeasonError('Season name is required.');
                    return;
                  }
                  if (!Number.isInteger(createSeasonWeekday) || createSeasonWeekday < 0 || createSeasonWeekday > 6) {
                    setCreateSeasonError('Weekday must be an integer between 0 and 6.');
                    return;
                  }
                  if (!/^\d{2}:\d{2}$/.test(createSeasonStartTime)) {
                    setCreateSeasonError('Start time must be in HH:MM format.');
                    return;
                  }
                  try {
                    setCreateSeasonBusy(true);
                    await onCreateSeason({
                      name,
                      format: createSeasonFormat,
                      weekday: createSeasonWeekday,
                      start_time_local: `${createSeasonStartTime}:00`,
                      is_active: true,
                    });
                    setCreateSeasonOpen(false);
                    setCreateSeasonName('');
                  } catch (e) {
                    setCreateSeasonError(e instanceof Error ? e.message : 'Failed to create season.');
                  } finally {
                    setCreateSeasonBusy(false);
                  }
                }}
              >
                {createSeasonBusy ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function HomeScreen({
  resetSignal,
  profile,
  avatarPreview,
  avatarGradient,
  avatarEmoji,
  profileInitials,
  profileTierTag,
  profileFormatTag,
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
  recordExistingGames,
  upcomingSessions,
  allUpcomingSessions,
  onRecordClubChange,
  onRecordGame,
  onUpdateGame,
  onRecordSeasonChange,
  canOpenSession,
  onOpenSession,
  canManageRecords,
  onGoHome,
  onGoLeaderboard,
  onGoProfile,
  onGoPreferences,
  onLogout,
}: {
  resetSignal: number;
  profile: Profile | null;
  avatarPreview: string | null;
  avatarGradient: string;
  avatarEmoji: string;
  profileInitials: string;
  profileTierTag: string;
  profileFormatTag: string;
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
  recordExistingGames: HomeGameRow[];
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
  onUpdateGame: (gameId: number, payload: {
    courtId: number | null;
    startTimeLocal: string;
    scoreA: number;
    scoreB: number;
    sideAPlayerIds: [number, number];
    sideBPlayerIds: [number, number];
  }) => Promise<void>;
  onRecordSeasonChange: (seasonId: number) => Promise<void>;
  canOpenSession: boolean;
  onOpenSession: (args: { fromDate: string; toDate: string; startTime: string }) => Promise<void>;
  canManageRecords: boolean;
  onGoHome: () => void;
  onGoLeaderboard: () => void;
  onGoProfile: () => void;
  onGoPreferences: () => void;
  onLogout: () => void;
}) {
  const [tooltipVisible, setTooltipVisible] = useState(false);
  const [homeMode, setHomeMode] = useState<HomeMode>('main');
  const [activeGame, setActiveGame] = useState<HomeGameRow | null>(null);
  const [activeUpcoming, setActiveUpcoming] = useState<UpcomingRow | null>(null);
  const [editingGame, setEditingGame] = useState<HomeGameRow | null>(null);
  const rawHomePlayerName = profile?.display_name || profile?.full_name || profile?.email || 'player_one';
  const homePlayerName = rawHomePlayerName.slice(0, 12);

  useEffect(() => {
    setHomeMode('main');
    setActiveGame(null);
    setActiveUpcoming(null);
    setEditingGame(null);
  }, [resetSignal]);

  return (
    <section>
      <header style={{ background: '#fff', borderBottom: '1px solid var(--border)', padding: '18px 16px 14px', position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <img
                src="/LeagueOS_Small_Logo.png"
                alt="LeagueOS menu"
                style={{
                  height: 32,
                  width: 'auto',
                  maxHeight: 32,
                  opacity: 1,
                  transform: 'scale(2.0)',
                  transformOrigin: 'left center',
                }}
              />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
              <button
                onClick={onGoPreferences}
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  border: 0,
                  background: 'transparent',
                  padding: 0,
                  margin: 0,
                  color: '#0f172a',
                  cursor: 'pointer',
                }}
                title="Open user preferences"
                aria-label="Open user preferences"
              >
                {homePlayerName}
              </button>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <span
                  style={{
                    background: '#e6f7f6',
                    border: '1px solid #b7ebe6',
                    borderRadius: 999,
                    padding: '1px 6px',
                    fontSize: 9,
                    color: '#0f766e',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {profileTierTag}
                </span>
                <span
                  style={{
                    background: '#e6f7f6',
                    border: '1px solid #b7ebe6',
                    borderRadius: 999,
                    padding: '1px 6px',
                    fontSize: 9,
                    color: '#0f766e',
                    fontWeight: 600,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {profileFormatTag}
                </span>
              </div>
            </div>
            <button
              onClick={onGoProfile}
              style={{
                width: 42,
                height: 42,
                borderRadius: '50%',
                background: avatarPreview ? '#e2e8f0' : avatarGradient,
                border: '2px solid #fff',
                boxShadow: '0 0 0 1px var(--border)',
                position: 'relative',
                overflow: 'hidden',
                display: 'grid',
                placeItems: 'center',
                color: '#fff',
                cursor: 'pointer',
                padding: 0,
              }}
              title="Open profile"
              aria-label="Open profile"
            >
              {avatarPreview ? <img src={avatarPreview} alt="Profile avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
              {!avatarPreview ? (
                <div style={{ display: 'grid', placeItems: 'center', lineHeight: 1 }}>
                  <div style={{ fontSize: 12 }}>{avatarEmoji}</div>
                  <div style={{ fontSize: 12, fontWeight: 800 }}>{profileInitials || 'P'}</div>
                </div>
              ) : null}
            </button>
          </div>
        </div>
      </header>

      <section style={{ maxWidth: 1100, margin: '0 auto', padding: 16 }}>
        {/* Floating button shown below */}

        {homeMode === 'main' ? (
          <>
            <HomeTableCard
              title="Recent Games"
              action="View All →"
              onActionClick={() => setHomeMode('allGames')}
              columns={['Date', 'Partner', 'Result', 'Game Score']}
              rows={recentGames.map((g) => ({
                id: g.id,
                cells: [
                  g.date,
                  g.partner,
                  <span key={`${g.id}-result`} style={{ color: g.outcome === 'W' ? 'var(--ok)' : 'var(--bad)', fontWeight: 700 }}>{g.score}</span>,
                  `${g.scoreA}-${g.scoreB}`,
                ],
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

        {canManageRecords && homeMode !== 'addGame' ? (
          <div
            style={{
              position: 'fixed',
              right: 'max(24px, calc((100vw - 1100px) / 2 + 24px))',
              bottom: 'calc(70px + env(safe-area-inset-bottom, 0px) + 8px)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              zIndex: 95,
            }}
            onMouseEnter={() => setTooltipVisible(true)}
            onMouseLeave={() => setTooltipVisible(false)}
          >
            <span
              style={{
                background: 'rgba(15, 118, 110, 0.9)',
                color: '#fff',
                padding: '4px 10px',
                borderRadius: 999,
                fontSize: 13,
                fontWeight: 600,
                boxShadow: '0 6px 18px rgba(15, 118, 110, 0.3)',
                opacity: tooltipVisible ? 1 : 0,
                transition: 'opacity 0.2s ease',
                transform: tooltipVisible ? 'translateY(-4px)' : 'translateY(0)',
              }}
            >
              Add Game
            </span>
            <button
              onClick={() => setHomeMode('addGame')}
              style={{
                width: 64,
                height: 64,
                borderRadius: '50%',
                border: 'none',
                background: 'linear-gradient(135deg, var(--teal-start), var(--teal-end))',
                color: '#fff',
                fontSize: 36,
                fontWeight: 600,
                lineHeight: 1,
                boxShadow: '0 12px 30px rgba(14, 165, 233, 0.35)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              +
            </button>
          </div>
        ) : null}

        {homeMode === 'addGame' && canManageRecords ? (
          <AddGameScreen
            clubs={clubs}
            recordClubId={recordClubId}
            session={selectedSession}
            recordContextError={recordContextError}
            recordSeasonId={recordSeasonId}
            seasons={seasons}
            players={players}
            courts={courts}
            existingGames={recordExistingGames}
            onRecordClubChange={onRecordClubChange}
            onRecordSeasonChange={onRecordSeasonChange}
            canOpenSession={canOpenSession}
            onOpenSession={onOpenSession}
            editGame={editingGame}
            onBack={() => {
              if (editingGame) {
                setEditingGame(null);
                setHomeMode('gameDetail');
                return;
              }
              setHomeMode('main');
            }}
            onSubmit={async (payload) => {
              if (editingGame) {
                await onUpdateGame(editingGame.id, payload);
                setEditingGame(null);
                setHomeMode('allGames');
                return;
              }
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
            columns={['Date', 'Partner', 'Result', 'Status', 'Game Score']}
            rows={allGames.map((g) => ({
              id: g.id,
              cells: [
                g.date,
                g.partner,
                <span key={`${g.id}-result`} style={{ color: g.outcome === 'W' ? 'var(--ok)' : 'var(--bad)', fontWeight: 700 }}>{g.score}</span>,
                <span
                  key={`${g.id}-status-indicator`}
                  title={g.status === 'FINALIZED' ? 'Finalized' : 'Created'}
                  aria-label={g.status === 'FINALIZED' ? 'Finalized' : 'Created'}
                  style={{
                    display: 'inline-block',
                    width: 12,
                    height: 12,
                    background: g.status === 'FINALIZED' ? '#22c55e' : '#f59e0b',
                    borderRadius: g.status === 'FINALIZED' ? 2 : '50%',
                  }}
                />,
                `${g.scoreA}-${g.scoreB}`,
              ],
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
              ['Status', activeGame.status],
              ['Created By', activeGame.createdBy || 'Unknown'],
              ['Season', activeGame.season],
              ['Court', activeGame.courtName],
              ['Start Time', new Date(activeGame.startTime).toLocaleString()],
              ['Partner', activeGame.partner],
              ['Result', activeGame.score],
              ['Score', `${activeGame.scoreA} - ${activeGame.scoreB}`],
              ['Team A', activeGame.teamA.join(', ')],
              ['Team B', activeGame.teamB.join(', ')],
            ]} />
            {canManageRecords && activeGame.sessionStatus !== 'FINALIZED' ? (
              <div style={{ marginTop: 16, borderTop: '1px solid #e2e8f0', paddingTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  style={outlineBtn}
                  onClick={() => {
                    setEditingGame(activeGame);
                    setHomeMode('addGame');
                  }}
                  title="Edit game"
                  aria-label="Edit game"
                >
                  ✏️ Edit Game
                </button>
              </div>
            ) : null}
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
  const colTemplate =
    columns.length === 5
      ? '68px minmax(96px, 1.1fr) 56px 52px 66px'
      : columns.length === 4
        ? '90px 1fr 1fr 90px'
        : '90px 1fr 1fr';

  return (
    <div style={{ marginTop: 16, background: '#fff', borderRadius: 20, border: '1px solid var(--border)', overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>{title}</h2>
        <button onClick={onActionClick} style={{ border: 0, background: 'transparent', color: '#0d9488', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}>{action}</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: colTemplate, gap: 10, padding: '10px 16px', background: '#f9fafb', color: '#4b5563', fontWeight: 700, alignItems: 'center' }}>
        {columns.map((c, idx) => (
          <div
            key={c}
            style={{
              whiteSpace: idx === 4 ? 'normal' : 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              textAlign: idx === 2 || idx === 3 || idx === 4 ? 'center' : 'left',
            }}
          >
            {c}
          </div>
        ))}
      </div>
      {!rows.length ? <div style={{ padding: 14, color: '#6b7280' }}>No data available.</div> : null}
      {rows.map((r) => (
        <button key={`${title}-${r.id}`} onClick={r.onClick} style={{ width: '100%', border: 0, borderTop: '1px solid var(--border)', background: '#fff', display: 'grid', gridTemplateColumns: colTemplate, gap: 10, padding: '12px 16px', textAlign: 'left', cursor: 'pointer', alignItems: 'center' }}>
          {r.cells.map((cell, idx) => (
            <div
              key={`${r.id}-${idx}`}
              style={{
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                minWidth: 0,
                textAlign: idx === 2 || idx === 3 || idx === 4 ? 'center' : 'left',
              }}
            >
              {cell}
            </div>
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
  existingGames,
  onRecordClubChange,
  onRecordSeasonChange,
  canOpenSession,
  onOpenSession,
  editGame,
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
  existingGames: HomeGameRow[];
  onRecordClubChange: (clubId: number) => Promise<void>;
  onRecordSeasonChange: (seasonId: number) => Promise<void>;
  canOpenSession: boolean;
  onOpenSession: (args: { fromDate: string; toDate: string; startTime: string }) => Promise<void>;
  editGame: HomeGameRow | null;
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
  type SlotKey = 'a1' | 'a2' | 'b1' | 'b2';

  const [step, setStep] = useState<1 | 2>(1);
  const [playersBySlot, setPlayersBySlot] = useState<Record<SlotKey, number>>({
    a1: 0,
    a2: 0,
    b1: 0,
    b2: 0,
  });
  const [courtId, setCourtId] = useState<number | null>(null);
  const [startTime, setStartTime] = useState('');
  const [scoreA, setScoreA] = useState(21);
  const [scoreB, setScoreB] = useState(17);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSlot, setPickerSlot] = useState<SlotKey | null>(null);
  const [pickerQuery, setPickerQuery] = useState('');
  const [showCustomTime, setShowCustomTime] = useState(false);
  const [customTime, setCustomTime] = useState('');
  const [courtExpanded, setCourtExpanded] = useState(true);
  const [timeExpanded, setTimeExpanded] = useState(false);
  const [confirmSoftDuplicate, setConfirmSoftDuplicate] = useState<null | {
    message: string;
    payload: {
      courtId: number | null;
      startTimeLocal: string;
      scoreA: number;
      scoreB: number;
      sideAPlayerIds: [number, number];
      sideBPlayerIds: [number, number];
    };
  }>(null);
  const isEditMode = Boolean(editGame);

  const activePlayers = players.filter((player) => player.is_active);
  const playerOptions = activePlayers.length
    ? activePlayers
    : [{ id: 0, display_name: 'No active players', club_id: 0, is_active: false, created_at: '' }];
  const playerById = new Map(activePlayers.map((player) => [player.id, player]));

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  // Cap at 5 min before now, floored to 5-min boundary — prevents future slots
  const nowCapMinutes = Math.max(0, nowMinutes - 5 - ((nowMinutes - 5) % 5));

  const sessionStartDate = session ? new Date(session.session_start_time) : null;
  const sessionStartLocalMinutes = sessionStartDate
    ? sessionStartDate.getHours() * 60 + sessionStartDate.getMinutes()
    : Math.max(0, nowCapMinutes - 120);

  const sessionEndDate = session?.session_end_time ? new Date(session.session_end_time) : null;
  const sessionEndLocalMinutes = sessionEndDate
    ? sessionEndDate.getHours() * 60 + sessionEndDate.getMinutes()
    : sessionStartLocalMinutes + 120; // default 2h session if no end time set

  // Selectable slots: from session start → session end, capped at now
  const windowStartMinutes = sessionStartLocalMinutes;
  const latestAllowedMinutes = Math.min(sessionEndLocalMinutes, nowCapMinutes);

  const formatTimeLabel = (value: string) => {
    const [hh, mm] = value.split(':').map(Number);
    if (!Number.isInteger(hh) || !Number.isInteger(mm)) return value;
    const suffix = hh >= 12 ? 'PM' : 'AM';
    const hour12 = hh % 12 === 0 ? 12 : hh % 12;
    return `${hour12}:${String(mm).padStart(2, '0')} ${suffix}`;
  };

  const parseHHmm = (value: string): number | null => {
    const [hh, mm] = value.split(':').map(Number);
    if (!Number.isInteger(hh) || !Number.isInteger(mm)) return null;
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
    return hh * 60 + mm;
  };

  const toHHmm = (totalMinutes: number): string => {
    const hh = Math.floor(totalMinutes / 60);
    const mm = totalMinutes % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  };

  const normalizeName = (name: string) => name.toLowerCase().replace(/[^a-z]/g, '');
  const selectedPlayerIds = (Object.values(playersBySlot).filter((value) => value > 0)) as number[];
  const step1Valid = selectedPlayerIds.length === 4 && new Set(selectedPlayerIds).size === 4;
  const scoreGateError = validateAddGameInput({
    courtId,
    scoreA,
    scoreB,
    sideAPlayerIds: [playersBySlot.a1, playersBySlot.a2],
    sideBPlayerIds: [playersBySlot.b1, playersBySlot.b2],
    sessionId: session?.id ?? null,
    startTime,
  });
  const saveDisabled = busy || !session || Boolean(recordContextError) || !step1Valid || Boolean(scoreGateError);
  const scoreRuleMessage =
    step === 2 && scoreGateError && (
      scoreGateError.includes('Winner') ||
      scoreGateError.includes('Maximum score') ||
      scoreGateError.includes('Draw is not allowed')
    )
      ? 'Score is invalid for standard badminton game end rules.'
      : scoreGateError;

  const sessionTimeKeys = (() => {
    const keys: string[] = [];
    for (let minute = windowStartMinutes; minute <= latestAllowedMinutes; minute += 5) {
      keys.push(toHHmm(minute));
    }
    return keys;
  })();

  const getHHmm = (iso: string): string | null => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const occupiedSlotSet = (() => {
    const occupied = new Set<string>();
    if (!courtId || !session) return occupied;
    existingGames.forEach((game) => {
      if (game.sessionId !== session.id) return;
      if (game.courtId !== courtId) return;
      const slot = getHHmm(game.startTime);
      if (!slot) return;
      occupied.add(floorToFiveMinuteIncrement(slot));
    });
    return occupied;
  })();

  const availableTimeKeys = courtId ? sessionTimeKeys.filter((slot) => !occupiedSlotSet.has(slot)) : [];

  const buildRecentsAndSuggested = (slot: SlotKey) => {
    const currentValue = playersBySlot[slot];
    const selectedWithoutCurrent = new Set<number>(selectedPlayerIds.filter((playerId) => playerId !== currentValue));
    const candidates = activePlayers.filter((player) => !selectedWithoutCurrent.has(player.id));

    const recentIds: number[] = [];
    const seenRecent = new Set<number>();
    const sortedHistory = [...existingGames].sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
    sortedHistory.forEach((game) => {
      [...game.teamAIds, ...game.teamBIds].forEach((id) => {
        if (selectedWithoutCurrent.has(id) || seenRecent.has(id)) return;
        if (!playerById.has(id)) return;
        seenRecent.add(id);
        recentIds.push(id);
      });
    });
    const recents = recentIds.slice(0, 6);

    const teammateId =
      slot === 'a1' ? playersBySlot.a2 :
      slot === 'a2' ? playersBySlot.a1 :
      slot === 'b1' ? playersBySlot.b2 :
      playersBySlot.b1;
    const opponentIds = slot.startsWith('a')
      ? [playersBySlot.b1, playersBySlot.b2].filter((id) => id > 0)
      : [playersBySlot.a1, playersBySlot.a2].filter((id) => id > 0);
    const selectedTimeMinutes = parseHHmm(startTime);

    const scoreByCandidate = new Map<number, number>();
    candidates.forEach((candidate) => {
      if (recents.includes(candidate.id)) return;
      let score = 0;
      sortedHistory.forEach((game, idx) => {
        const recency = Math.max(0, 20 - idx);
        const inA = game.teamAIds.includes(candidate.id);
        const inB = game.teamBIds.includes(candidate.id);
        if (!inA && !inB) return;
        score += 1 + recency;
        if (teammateId && ((inA && game.teamAIds.includes(teammateId)) || (inB && game.teamBIds.includes(teammateId)))) {
          score += 16;
        }
        opponentIds.forEach((oppId) => {
          const opposed = (inA && game.teamBIds.includes(oppId)) || (inB && game.teamAIds.includes(oppId));
          if (opposed) score += 8;
        });
        if (courtId && game.courtId === courtId) score += 4;
        if (selectedTimeMinutes !== null) {
          const gameMinutes = parseHHmm(getHHmm(game.startTime) ?? '');
          if (gameMinutes !== null && Math.abs(gameMinutes - selectedTimeMinutes) <= 15) score += 3;
        }
        if (session && game.sessionId === session.id) score += 3;
      });
      scoreByCandidate.set(candidate.id, score);
    });

    const suggestions = [...scoreByCandidate.entries()]
      .filter(([, score]) => score > 0)
      .sort((a, b) => b[1] - a[1] || (playerById.get(a[0])?.display_name ?? '').localeCompare(playerById.get(b[0])?.display_name ?? ''))
      .slice(0, 8)
      .map(([id]) => id);

    return { recents, suggestions, candidates };
  };

  const pickerData = pickerSlot ? buildRecentsAndSuggested(pickerSlot) : { recents: [], suggestions: [], candidates: [] as Player[] };

  const filterByQuery = (list: Player[]) => {
    const query = pickerQuery.trim().toLowerCase();
    if (!query) return list;
    return list.filter((player) => player.display_name.toLowerCase().includes(query));
  };

  const recentPlayers = filterByQuery(pickerData.recents.map((id) => playerById.get(id)).filter(Boolean) as Player[]);
  const suggestedPlayers = filterByQuery(pickerData.suggestions.map((id) => playerById.get(id)).filter(Boolean) as Player[]);
  const recentsSet = new Set(pickerData.recents);
  const suggestedSet = new Set(pickerData.suggestions);
  const allPlayersRemainder = [...pickerData.candidates]
    .filter((player) => !recentsSet.has(player.id) && !suggestedSet.has(player.id))
    .sort((a, b) => a.display_name.localeCompare(b.display_name));
  const allPlayersList = filterByQuery(allPlayersRemainder);

  const duplicateSelection = selectedPlayerIds.length !== new Set(selectedPlayerIds).size;
  const similarNameWarning = (() => {
    const values = selectedPlayerIds.map((id) => playerById.get(id)?.display_name ?? '').filter(Boolean);
    const normalized = values.map(normalizeName);
    for (let i = 0; i < normalized.length; i += 1) {
      for (let j = i + 1; j < normalized.length; j += 1) {
        if (!normalized[i] || !normalized[j]) continue;
        if (normalized[i] === normalized[j]) continue;
        if (normalized[i].slice(0, 5) === normalized[j].slice(0, 5)) {
          return 'Heads up: similar player names selected. Please verify correct players before saving.';
        }
      }
    }
    return null;
  })();

  const isSoftDuplicate = (payload: {
    courtId: number | null;
    startTimeLocal: string;
    scoreA: number;
    scoreB: number;
    sideAPlayerIds: [number, number];
    sideBPlayerIds: [number, number];
  }) => {
    if (!session) return false;
    const incomingPlayers = [...payload.sideAPlayerIds, ...payload.sideBPlayerIds].sort((a, b) => a - b).join(',');
    return existingGames.some((game) => {
      if (game.sessionId !== session.id) return false;
      const gamePlayers = [...game.teamAIds, ...game.teamBIds].sort((a, b) => a - b).join(',');
      const samePlayers = gamePlayers === incomingPlayers;
      const sameScore =
        (game.scoreA === payload.scoreA && game.scoreB === payload.scoreB) ||
        (game.scoreA === payload.scoreB && game.scoreB === payload.scoreA);
      return samePlayers && sameScore;
    });
  };

  const openPicker = (slot: SlotKey) => {
    setPickerSlot(slot);
    setPickerOpen(true);
    setPickerQuery('');
  };

  const applyPlayerToSlot = (playerId: number) => {
    if (!pickerSlot) return;
    setPlayersBySlot((prev) => ({ ...prev, [pickerSlot]: playerId }));
    setPickerOpen(false);
    setPickerSlot(null);
  };
  const clearPickerSlotSelection = () => {
    if (!pickerSlot) return;
    setPlayersBySlot((prev) => ({ ...prev, [pickerSlot]: null }));
  };

  const slotPlayerName = (slot: SlotKey) => {
    const id = playersBySlot[slot];
    if (!id) return 'Select player';
    return playerById.get(id)?.display_name ?? 'Select player';
  };

  async function submitPayload(payload: {
    courtId: number | null;
    startTimeLocal: string;
    scoreA: number;
    scoreB: number;
    sideAPlayerIds: [number, number];
    sideBPlayerIds: [number, number];
  }) {
    try {
      setBusy(true);
      await onSubmit(payload);
      setStep(1);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'GAME_CONFLICT') {
        setError('A game already exists for this court and start time. Choose a different slot.');
      } else if (e instanceof ApiError && e.code === 'INVALID_GAME_TIME') {
        setError('Start time must be on a 5-minute boundary.');
      } else if (e instanceof ApiError && e.code === 'SESSION_IMMUTABLE') {
        setError('Selected session is not writable anymore. Select a season with one OPEN session.');
      } else {
        setError(e instanceof Error ? e.message : 'Failed to add game');
      }
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    setPlayersBySlot((prev) => {
      const activeIds = new Set(activePlayers.map((player) => player.id));
      return {
        a1: activeIds.has(prev.a1) ? prev.a1 : 0,
        a2: activeIds.has(prev.a2) ? prev.a2 : 0,
        b1: activeIds.has(prev.b1) ? prev.b1 : 0,
        b2: activeIds.has(prev.b2) ? prev.b2 : 0,
      };
    });
  }, [players]);

  useEffect(() => {
    setCourtId(null);
    setStartTime('');
    setCourtExpanded(true);
    setTimeExpanded(false);
    setShowCustomTime(false);
    setCustomTime('');
  }, [courts, recordClubId, recordSeasonId, isEditMode]);

  useEffect(() => {
    if (!editGame) return;
    const teamAIds: [number, number] = [editGame.teamAIds[0] ?? 0, editGame.teamAIds[1] ?? 0];
    const teamBIds: [number, number] = [editGame.teamBIds[0] ?? 0, editGame.teamBIds[1] ?? 0];
    setPlayersBySlot({
      a1: teamAIds[0],
      a2: teamAIds[1],
      b1: teamBIds[0],
      b2: teamBIds[1],
    });
    setCourtId(editGame.courtId);
    const existingStart = getHHmm(editGame.startTime);
    setStartTime(existingStart ? floorToFiveMinuteIncrement(existingStart) : '');
    setScoreA(editGame.scoreA);
    setScoreB(editGame.scoreB);
    setStep(1);
    setCourtExpanded(true);
    setTimeExpanded(false);
    setError(null);
    setWarning(null);
  }, [editGame]);

  useEffect(() => {
    if (!courtId && startTime) {
      setStartTime('');
    }
    if (courtId && startTime && occupiedSlotSet.has(startTime)) {
      setStartTime('');
    }
  }, [courtId, occupiedSlotSet, startTime]);

  const courtName = courtId ? (courts.find((court) => court.id === courtId)?.name ?? 'Select court') : 'Select court';
  const selectedTimeLabel = startTime ? formatTimeLabel(startTime) : 'Select time';
  const selectedSeasonName = seasons.find((season) => season.id === recordSeasonId)?.name ?? (recordSeasonId ? `Season ${recordSeasonId}` : 'Season not selected');
  const selectedSessionLabel = session ? 'Open' : 'No open session';
  const nowChipLabel = formatTimeLabel(toHHmm(latestAllowedMinutes));
  const teamANames = [playersBySlot.a1, playersBySlot.a2].map((id) => playerById.get(id)?.display_name).filter(Boolean) as string[];
  const teamBNames = [playersBySlot.b1, playersBySlot.b2].map((id) => playerById.get(id)?.display_name).filter(Boolean) as string[];

  const renderNameBubbles = (names: string[], tone: 'neutral' | 'red' = 'neutral') => {
    if (!names.length) return <span style={{ color: '#64748b', fontSize: 13 }}>-</span>;
    const chipStyle: React.CSSProperties =
      tone === 'red'
        ? {
            border: '1px solid #f8b4c0',
            borderRadius: 999,
            background: 'linear-gradient(180deg, #fff6f7 0%, #ffeef1 100%)',
            color: '#7f1d1d',
            padding: '4px 10px',
            fontWeight: 600,
            lineHeight: 1.2,
            fontSize: 13,
            display: 'block',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '100%',
          }
        : {
            border: '1px solid #bfdaf6',
            borderRadius: 999,
            background: 'linear-gradient(180deg, #f8fbff 0%, #eef5ff 100%)',
            color: '#334155',
            padding: '4px 10px',
            fontWeight: 600,
            lineHeight: 1.2,
            fontSize: 13,
            display: 'block',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            maxWidth: '100%',
          };
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 5, minWidth: 0, overflow: 'hidden' }}>
        {names.map((name) => (
          <span key={name} style={chipStyle} title={name}>{name}</span>
        ))}
      </div>
    );
  };

  return (
    <div
      style={{
        marginTop: 16,
        background: '#f8fafc',
        borderRadius: 20,
        border: '1px solid var(--border)',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        minHeight: step === 2 ? 760 : undefined,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>{isEditMode ? 'Edit Game' : 'New Game'}</h2>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap' }}>{`Step ${step} of 2`}</div>
      </div>

      <div style={{ display: 'grid', gap: 10, marginTop: 8 }}>
        <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
          <button
            type="button"
            onClick={() => setStep(1)}
            style={{
              border: '1px solid #cce7e8',
              borderRadius: 999,
              padding: '8px 18px',
              fontWeight: 700,
              fontSize: 16,
              background: step === 1 ? 'linear-gradient(180deg, #d3ecee 0%, #c6e7e8 100%)' : 'linear-gradient(180deg, #e6edf5 0%, #dbe4ef 100%)',
              color: step === 1 ? '#0f766e' : '#52667d',
              cursor: 'pointer',
            }}
          >
            Players
          </button>
          <button
            type="button"
            onClick={() => {
              if (!step1Valid) {
                setWarning('Select 4 unique players before moving to Score + Save.');
                return;
              }
              setWarning(null);
              setStep(2);
            }}
            style={{
              border: '1px solid #cce7e8',
              borderRadius: 999,
              padding: '8px 18px',
              fontWeight: 700,
              fontSize: 16,
              background: step === 2 ? 'linear-gradient(180deg, #d3ecee 0%, #c6e7e8 100%)' : 'linear-gradient(180deg, #e6edf5 0%, #dbe4ef 100%)',
              color: step === 2 ? '#0f766e' : '#52667d',
              cursor: 'pointer',
            }}
          >
            Score + Save
          </button>
        </div>

        {step === 1 ? (
          <div style={{ borderTop: '1px solid #dbe3ee', margin: '2px -16px 0', paddingTop: 10, paddingLeft: 16, paddingRight: 16 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <span style={{ borderRadius: 999, padding: '6px 12px', fontSize: 12, fontWeight: 700, background: '#e8edf4', color: '#42566f' }}>
                Season: {selectedSeasonName}
              </span>
              <span style={{ borderRadius: 999, padding: '6px 12px', fontSize: 12, fontWeight: 700, background: '#e8edf4', color: '#42566f' }}>
                Session: {selectedSessionLabel}
              </span>
              <span style={{ borderRadius: 999, padding: '6px 12px', fontSize: 12, fontWeight: 700, background: '#e8edf4', color: '#42566f' }}>
                Now: {nowChipLabel}
              </span>
            </div>
          </div>
        ) : null}

        {recordContextError ? (
          <div style={{ marginTop: 2, border: '1px solid #fecaca', background: '#fff1f2', borderRadius: 12, padding: 10, color: '#9f1239', fontSize: 13 }}>
            {recordContextError}
          </div>
        ) : null}

        {step === 1 ? (
          <>
            {duplicateSelection ? (
              <div style={{ color: 'var(--bad)', fontSize: 14 }}>Duplicate player selected. Each slot must have a unique player.</div>
            ) : null}
            {similarNameWarning ? (
              <div style={{ color: '#9a3412', fontSize: 14, background: '#ffedd5', border: '1px solid #fdba74', borderRadius: 10, padding: '8px 10px' }}>
                {similarNameWarning}
              </div>
            ) : null}
            {warning ? <div style={{ color: '#9a3412', fontSize: 14 }}>{warning}</div> : null}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
              <div style={{ borderRadius: 14, background: '#e8edff', border: '1px solid #c7d2fe', padding: 12, display: 'grid', gap: 8 }}>
                <div style={{ fontWeight: 700, color: '#334155' }}>Team A</div>
                <button type="button" onClick={() => openPicker('a1')} style={{ ...modalInput, textAlign: 'left', background: '#fff' }}>{slotPlayerName('a1')}</button>
                <button type="button" onClick={() => openPicker('a2')} style={{ ...modalInput, textAlign: 'left', background: '#fff' }}>{slotPlayerName('a2')}</button>
              </div>
              <div style={{ borderRadius: 14, background: '#fdecef', border: '1px solid #fecdd3', padding: 12, display: 'grid', gap: 8 }}>
                <div style={{ fontWeight: 700, color: '#7f1d1d' }}>Team B</div>
                <button type="button" onClick={() => openPicker('b1')} style={{ ...modalInput, textAlign: 'left', background: '#fff' }}>{slotPlayerName('b1')}</button>
                <button type="button" onClick={() => openPicker('b2')} style={{ ...modalInput, textAlign: 'left', background: '#fff' }}>{slotPlayerName('b2')}</button>
              </div>
            </div>
          </>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <button
                type="button"
                onClick={() => setCourtExpanded((prev) => !prev)}
                style={{ width: '100%', border: 0, background: '#f8fafc', textAlign: 'left', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 700, color: '#0f172a' }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span>Court:</span>
                  <span style={{ border: '1px solid #bfdaf6', borderRadius: 999, background: 'linear-gradient(180deg, #f8fbff 0%, #eef5ff 100%)', color: '#334155', padding: '3px 10px', fontWeight: 700, fontSize: 14 }}>{courtName}</span>
                </span>
                <span
                  style={{
                    border: '1px solid #b9cfe5',
                    borderRadius: 999,
                    padding: '2px 10px',
                    fontSize: 12,
                    fontWeight: 700,
                    lineHeight: 1.2,
                    background: '#f1f6fb',
                    color: '#486581',
                  }}
                >
                  {courtExpanded ? 'Collapse' : 'Expand'}
                </span>
              </button>
              {courtExpanded ? (
                <div style={{ padding: 10, display: 'grid', gap: 8 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {courts.map((court) => (
                      <button
                        key={court.id}
                        type="button"
                        onClick={() => {
                          setCourtId(court.id);
                          setCourtExpanded(false);
                          setTimeExpanded(true);
                          setError(null);
                        }}
                        style={{
                          border: `1px solid ${courtId === court.id ? '#78d8d3' : '#b9cfe5'}`,
                          borderRadius: 999,
                          background: courtId === court.id ? 'linear-gradient(180deg, #e3f8f7 0%, #d1f2ee 100%)' : 'linear-gradient(180deg, #f8fbff 0%, #eef5ff 100%)',
                          color: courtId === court.id ? '#0f766e' : '#334155',
                          padding: '7px 14px',
                          fontWeight: 700,
                          fontSize: 14,
                          cursor: 'pointer',
                        }}
                      >
                        {court.name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
              <button
                type="button"
                onClick={() => setTimeExpanded((prev) => !prev)}
                style={{ width: '100%', border: 0, background: '#f8fafc', textAlign: 'left', padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontWeight: 700, color: '#0f172a' }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <span>Time Slot:</span>
                  <span style={{ border: '1px solid #bfdaf6', borderRadius: 999, background: 'linear-gradient(180deg, #f8fbff 0%, #eef5ff 100%)', color: '#334155', padding: '3px 10px', fontWeight: 700, fontSize: 14 }}>{selectedTimeLabel}</span>
                </span>
                <span
                  style={{
                    border: '1px solid #b9cfe5',
                    borderRadius: 999,
                    padding: '2px 10px',
                    fontSize: 12,
                    fontWeight: 700,
                    lineHeight: 1.2,
                    background: '#f1f6fb',
                    color: '#486581',
                  }}
                >
                  {timeExpanded ? 'Collapse' : 'Expand'}
                </span>
              </button>
              {timeExpanded ? (
                <div style={{ padding: 10, display: 'grid', gap: 8 }}>
                  <div style={{ color: '#64748b', fontSize: 12 }}>
                    {session
                      ? `Session: ${formatTimeLabel(toHHmm(sessionStartLocalMinutes))} → ${formatTimeLabel(toHHmm(sessionEndLocalMinutes))}${latestAllowedMinutes < sessionEndLocalMinutes ? ` (slots up to ${formatTimeLabel(toHHmm(latestAllowedMinutes))} available now)` : ''}`
                      : `Available: ${formatTimeLabel(toHHmm(windowStartMinutes))} to ${formatTimeLabel(toHHmm(latestAllowedMinutes))}`}
                  </div>
                  {!courtId ? (
                    <div style={{ color: '#64748b', fontSize: 13 }}>Select a court first.</div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {availableTimeKeys.map((slot) => (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => {
                            setStartTime(slot);
                            setTimeExpanded(false);
                            setError(null);
                          }}
                        style={{
                            border: `1px solid ${startTime === slot ? '#78d8d3' : '#9fd8dd'}`,
                            borderRadius: 999,
                            background: startTime === slot ? 'linear-gradient(180deg, #e3f8f7 0%, #d1f2ee 100%)' : 'linear-gradient(180deg, #e6f8f8 0%, #d7f2f3 100%)',
                            color: startTime === slot ? '#0b7b73' : '#0f6c75',
                            padding: '7px 13px',
                            fontWeight: 700,
                            fontSize: 14,
                            cursor: 'pointer',
                          }}
                        >
                          {formatTimeLabel(slot)}
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowCustomTime((prev) => !prev)}
                    style={{
                      border: '1px dashed #9fd8dd',
                      borderRadius: 999,
                      background: showCustomTime
                        ? 'linear-gradient(180deg, #e3f8f7 0%, #d1f2ee 100%)'
                        : 'linear-gradient(180deg, #f0fdfb 0%, #e6f8f8 100%)',
                      color: '#0f6c75',
                      padding: '7px 13px',
                      fontWeight: 700,
                      fontSize: 14,
                      cursor: 'pointer',
                    }}
                  >
                    {showCustomTime ? '✕ Hide custom time' : '+ Custom time'}
                  </button>
                  {showCustomTime ? (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        type="time"
                        step={300}
                        value={customTime}
                        onChange={(e) => setCustomTime(e.target.value)}
                        style={{ ...modalInput, width: 170 }}
                      />
                      <button
                        type="button"
                        style={{
                          border: '1px solid #9fd8dd',
                          borderRadius: 999,
                          background: 'linear-gradient(180deg, #e6f8f8 0%, #d7f2f3 100%)',
                          color: '#0f6c75',
                          padding: '7px 13px',
                          fontWeight: 700,
                          fontSize: 14,
                          cursor: 'pointer',
                        }}
                        onClick={() => {
                          if (!courtId) {
                            setError('Select a court before using custom time.');
                            return;
                          }
                          if (!customTime) {
                            setError('Choose a custom time first.');
                            return;
                          }
                          const normalized = floorToFiveMinuteIncrement(customTime);
                          if (normalized !== customTime) {
                            setError('Custom time must be on a 5-minute boundary.');
                            return;
                          }
                          const minutes = parseHHmm(normalized);
                          if (minutes === null || minutes > latestAllowedMinutes) {
                            setError('Custom time must be in the past (at least 5 minutes earlier than now).');
                            return;
                          }
                          if (occupiedSlotSet.has(normalized)) {
                            setError('That custom time is already occupied for the selected court.');
                            return;
                          }
                          setStartTime(normalized);
                          setTimeExpanded(false);
                          setError(null);
                        }}
                      >
                        Use time
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, minWidth: 0, overflow: 'hidden' }}>
              <div style={{ borderRadius: 14, background: '#e8edff', border: '1px solid #c7d2fe', padding: 12, display: 'grid', gap: 8, minWidth: 0, overflow: 'hidden' }}>
                <div style={{ fontWeight: 700, color: '#334155' }}>Team A</div>
                {renderNameBubbles(teamANames, 'neutral')}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button type="button" onClick={() => setScoreA((prev) => Math.max(0, prev - 1))} style={outlineBtn}>-</button>
                  <div
                    style={{
                      ...modalInput,
                      width: 88,
                      textAlign: 'center',
                      background: '#fff',
                      fontWeight: 900,
                      fontSize: 40,
                      lineHeight: 1.05,
                      color: '#0f172a',
                      padding: '8px 10px',
                    }}
                  >
                    {scoreA}
                  </div>
                  <button type="button" onClick={() => setScoreA((prev) => Math.min(30, prev + 1))} style={outlineBtn}>+</button>
                </div>
              </div>
              <div style={{ borderRadius: 14, background: '#fdecef', border: '1px solid #fecdd3', padding: 12, display: 'grid', gap: 8, minWidth: 0, overflow: 'hidden' }}>
                <div style={{ fontWeight: 700, color: '#7f1d1d' }}>Team B</div>
                {renderNameBubbles(teamBNames, 'red')}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button type="button" onClick={() => setScoreB((prev) => Math.max(0, prev - 1))} style={outlineBtn}>-</button>
                  <div
                    style={{
                      ...modalInput,
                      width: 88,
                      textAlign: 'center',
                      background: '#fff',
                      fontWeight: 900,
                      fontSize: 40,
                      lineHeight: 1.05,
                      color: '#0f172a',
                      padding: '8px 10px',
                    }}
                  >
                    {scoreB}
                  </div>
                  <button type="button" onClick={() => setScoreB((prev) => Math.min(30, prev + 1))} style={outlineBtn}>+</button>
                </div>
              </div>
            </div>

            {scoreRuleMessage ? (
              <div
                style={{
                  color: '#9f1239',
                  fontSize: 13,
                  border: '1px solid #fecaca',
                  background: '#fff1f2',
                  borderRadius: 12,
                  padding: '10px 12px',
                }}
              >
                {scoreRuleMessage}
              </div>
            ) : null}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {['21-20', '21-19', '21-18', '21-17', '21-16', '22-20', '23-21', '24-22', '25-23', '30-29'].map((chip) => (
                <button
                  key={chip}
                  type="button"
                  style={{
                    border: '1px solid #9fd8dd',
                    borderRadius: 999,
                    background: 'linear-gradient(180deg, #e6f8f8 0%, #d7f2f3 100%)',
                    color: '#0f6c75',
                    padding: '7px 13px',
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: 'pointer',
                  }}
                  onClick={() => {
                    const [nextA, nextB] = chip.split('-').map(Number);
                    setScoreA(nextA);
                    setScoreB(nextB);
                    setError(null);
                  }}
                >
                  {chip}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => {
                setScoreA((prevA) => {
                  setScoreB(prevA);
                  return scoreB;
                });
              }}
              style={{
                border: '1px solid #9fd8dd',
                borderRadius: 999,
                background: 'linear-gradient(180deg, #e6f8f8 0%, #d7f2f3 100%)',
                color: '#0f6c75',
                padding: '10px 18px',
                fontWeight: 800,
                fontSize: 16,
                cursor: 'pointer',
                alignSelf: 'center',
              }}
            >
              Flip Sides (A ↔ B)
            </button>
          </div>
        )}

        {error ? <div style={{ color: 'var(--bad)', fontSize: 14 }}>{error}</div> : null}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: step === 2 ? 'auto' : 0 }}>
          <button
            style={{
              border: 0,
              borderRadius: 12,
              background: 'linear-gradient(90deg, #cbd5e1, #94a3b8)',
              color: '#fff',
              padding: '12px 14px',
              fontWeight: 700,
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.65 : 1,
            }}
            disabled={busy}
            onClick={() => {
              if (step === 2) {
                setStep(1);
                return;
              }
              onBack();
            }}
          >
            Back
          </button>
          {step === 1 ? (
            <button
              style={{
                border: 0,
                borderRadius: 12,
                background: 'linear-gradient(90deg, var(--teal-start), var(--teal-end))',
                color: '#fff',
                padding: '12px 14px',
                fontWeight: 700,
                cursor: step1Valid ? 'pointer' : 'not-allowed',
                opacity: step1Valid ? 1 : 0.65,
              }}
              disabled={!step1Valid}
              onClick={() => setStep(2)}
            >
              Next: Score
            </button>
          ) : (
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
                const normalizedTime = floorToFiveMinuteIncrement(startTime);
                const duplicateBySlot = existingGames.some((game) => {
                  if (!session || game.sessionId !== session.id || !courtId) return false;
                  const gameHhmm = getHHmm(game.startTime);
                  return gameHhmm === normalizedTime && game.courtId === courtId;
                });
                if (duplicateBySlot) {
                  setError('A game already exists for this session, court, and start time.');
                  return;
                }
                const validationError = validateAddGameInput({
                  courtId,
                  scoreA,
                  scoreB,
                  sideAPlayerIds: [playersBySlot.a1, playersBySlot.a2],
                  sideBPlayerIds: [playersBySlot.b1, playersBySlot.b2],
                  sessionId: session?.id ?? null,
                  startTime: normalizedTime,
                });
                if (validationError) {
                  setError(validationError);
                  return;
                }

                const payload = {
                  courtId,
                  startTimeLocal: normalizedTime,
                  scoreA,
                  scoreB,
                  sideAPlayerIds: [playersBySlot.a1, playersBySlot.a2] as [number, number],
                  sideBPlayerIds: [playersBySlot.b1, playersBySlot.b2] as [number, number],
                };
                if (isSoftDuplicate(payload)) {
                  setConfirmSoftDuplicate({
                    message: 'Potential duplicate: same session, same 4 players, and same score. Save anyway?',
                    payload,
                  });
                  return;
                }
                await submitPayload(payload);
              }}
            >
              {busy ? 'Saving...' : isEditMode ? 'Update Game' : 'Save Game'}
            </button>
          )}
        </div>
        {confirmSoftDuplicate ? (
          <div style={seasonModalBackdrop}>
            <div style={{ ...seasonModalCard, maxWidth: 520 }}>
              <h3 style={{ margin: 0, fontSize: 20, color: '#0f766e' }}>Confirm Duplicate</h3>
              <p style={{ margin: '10px 0 0', color: '#334155' }}>{confirmSoftDuplicate.message}</p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
                <button style={outlineBtn} onClick={() => setConfirmSoftDuplicate(null)}>Cancel</button>
                <button
                  style={primaryBtn}
                  onClick={async () => {
                    const payload = confirmSoftDuplicate.payload;
                    setConfirmSoftDuplicate(null);
                    await submitPayload(payload);
                  }}
                >
                  Continue Save
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {pickerOpen && pickerSlot ? (
        <div style={seasonModalBackdrop}>
          <div style={{ ...seasonModalCard, maxWidth: 620 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <h3 style={{ margin: 0, fontSize: 20 }}>Select Player</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  style={{
                    ...outlineBtn,
                    borderColor: '#fca5a5',
                    color: '#b91c1c',
                  }}
                  onClick={clearPickerSlotSelection}
                  disabled={!playersBySlot[pickerSlot]}
                >
                  Clear
                </button>
                <button style={outlineBtn} onClick={() => setPickerOpen(false)}>Close</button>
              </div>
            </div>
            <div style={{ color: '#64748b', fontSize: 13, marginTop: 6 }}>
              Slot: {pickerSlot.toUpperCase()} · selected players are removed automatically.
            </div>
            <input
              value={pickerQuery}
              onChange={(e) => setPickerQuery(e.target.value)}
              placeholder="Search players..."
              style={{ ...modalInput, marginTop: 10 }}
            />
            <div style={{ display: 'grid', gap: 10, marginTop: 10, maxHeight: '55vh', overflow: 'auto', paddingRight: 4 }}>
              <div style={{ border: '1px solid #d1d5db', borderRadius: 12, padding: 10 }}>
                <div style={{ fontWeight: 700, color: '#64748b', marginBottom: 8 }}>Recents</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {!recentPlayers.length ? <span style={{ color: '#94a3b8', fontSize: 13 }}>No recent players</span> : null}
                  {recentPlayers.map((player) => (
                    <button key={`recent-${player.id}`} type="button" style={outlineBtn} onClick={() => applyPlayerToSlot(player.id)}>
                      {player.display_name}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ border: '1px solid #d1d5db', borderRadius: 12, padding: 10 }}>
                <div style={{ fontWeight: 700, color: '#64748b', marginBottom: 8 }}>Suggested</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {!suggestedPlayers.length ? <span style={{ color: '#94a3b8', fontSize: 13 }}>No suggestions yet</span> : null}
                  {suggestedPlayers.map((player) => (
                    <button key={`suggested-${player.id}`} type="button" style={outlineBtn} onClick={() => applyPlayerToSlot(player.id)}>
                      {player.display_name}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ border: '1px solid #d1d5db', borderRadius: 12, padding: 10 }}>
                <div style={{ fontWeight: 700, color: '#64748b', marginBottom: 8 }}>All Players</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {!allPlayersList.length ? <span style={{ color: '#94a3b8', fontSize: 13 }}>No matching players</span> : null}
                  {allPlayersList.map((player) => (
                    <button key={`all-${player.id}`} type="button" style={outlineBtn} onClick={() => applyPlayerToSlot(player.id)}>
                      {player.display_name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ModernDateInput({
  label,
  value,
  onChange,
  displayValue,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  displayValue: string;
}) {
  const inputId = `date-${label.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <label htmlFor={inputId} style={{ display: 'grid', gap: 4 }}>
      <span style={{ fontSize: 12, color: '#0f766e', fontWeight: 600 }}>{label}</span>
      <div style={{ position: 'relative' }}>
        <input
          id={inputId}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            ...modalInput,
            color: 'transparent',
            textShadow: '0 0 0 transparent',
            position: 'relative',
            zIndex: 2,
            background: 'transparent',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: 0,
            border: '1px solid #cbd5e1',
            borderRadius: 12,
            background: 'linear-gradient(180deg, #ffffff, #f8fafc)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 12px',
            color: '#0f172a',
            fontWeight: 600,
            pointerEvents: 'none',
          }}
        >
          <span>{displayValue}</span>
          <span style={{ fontSize: 16 }}>📅</span>
        </div>
      </div>
    </label>
  );
}

function ModernTimeSelect({
  value,
  onChange,
  options,
  formatLabel,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  formatLabel: (v: string) => string;
  label?: string;
}) {
  return (
    <label style={{ display: 'grid', gap: 4 }}>
      {label ? <span style={{ fontSize: 12, color: '#0f766e', fontWeight: 600 }}>{label}</span> : null}
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...modalInput, background: 'linear-gradient(180deg, #ffffff, #f8fafc)', fontWeight: 600 }}>
        {options.map((time) => (
          <option key={time} value={time}>
            {formatLabel(time)}
          </option>
        ))}
      </select>
    </label>
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
  gridTemplateColumns: '28px minmax(96px, 1fr) 46px 50px 40px 4ch',
  gap: 4,
  padding: '12px 8px',
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--muted)',
  background: '#f9fafb',
  borderBottom: '1px solid var(--border)',
};

const leaderboardRow: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '28px minmax(96px, 1fr) 46px 50px 40px 4ch',
  gap: 4,
  padding: '12px 8px',
  borderBottom: '1px solid var(--border)',
  alignItems: 'center',
};

const linkBtn: React.CSSProperties = {
  border: 0,
  background: 'transparent',
  color: '#0f172a',
  cursor: 'pointer',
  padding: 0,
  minWidth: 0,
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

const primaryBtn: React.CSSProperties = {
  border: 0,
  borderRadius: 10,
  background: 'linear-gradient(90deg, var(--teal-start), var(--teal-end))',
  color: '#fff',
  padding: '8px 12px',
  cursor: 'pointer',
  fontWeight: 700,
};

const modalInput: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: '10px 12px',
  width: '100%',
};

const seasonModalBackdrop: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(2, 6, 23, 0.45)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  zIndex: 1000,
};

const seasonModalCard: React.CSSProperties = {
  width: 'min(520px, 100%)',
  borderRadius: 16,
  border: '1px solid #99f6e4',
  background: 'linear-gradient(180deg, #f0fdfa 0%, #ffffff 100%)',
  boxShadow: '0 20px 50px rgba(15, 118, 110, 0.28)',
  padding: 16,
};
