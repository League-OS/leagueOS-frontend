'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ApiError, LeagueOsApiClient } from '@leagueos/api';
import { DEFAULT_API_BASE_URL, DEFAULT_CLUB_ID } from '@leagueos/config';
import type { AdminUser, Club, ClubUser, Court, FeatureFlag, Game, GameParticipant, LeaderboardEntry, Player, Profile, Season, Session } from '@leagueos/schemas';
import type { AuthState } from '../types';
import { LoginView } from '../LoginView';
import { canAccessAdmin, canManageClubs, toAdminEffectiveRole } from '../../lib/adminPermissions';
import {
  adminAlertError,
  adminAlertSuccess,
  AdminBreadcrumbs,
  AdminCard,
  AdminEmptyState,
  adminMainPanel,
  adminPageShell,
  AdminSidebar,
  AdminTable,
  AdminTopbar,
  field,
  outlineBtn,
  primaryBtn,
} from './AdminShellParts';
import type { AdminNavKey } from './AdminShellParts';
import { adminPageTitle, buildAdminBreadcrumbs, countUniquePlayersInSessionGames, mergeAdminPlayers, type AdminPage } from './adminWorkspaceLogic';
import { combineSessionDateAndTimeToIso, floorToFiveMinuteIncrement, validateAddGameInput } from '../addGameLogic';
import { formatSequentialFinalizeBlockedError } from '../lib/apiErrorMessages';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;
const STORAGE_AUTH = 'leagueos.admin.auth';
const STORAGE_CTX = 'leagueos.admin.ctx';
const STORAGE_PROFILE = 'leagueos.admin.profile';

type Props = {
  page: AdminPage;
  seasonId?: number;
  sessionId?: number;
};

type AdminCtx = {
  selectedSeasonId: number | null;
};

type AddMatchPayload = {
  courtId: number | null;
  startTimeLocal: string;
  scoreA: number;
  scoreB: number;
  sideAPlayerIds: [number, number];
  sideBPlayerIds: [number, number];
};

function getMessage(e: unknown, fallback: string): string {
  if (e instanceof ApiError) {
    if (e.code === 'SEQUENTIAL_FINALIZE_BLOCKED') {
      return formatSequentialFinalizeBlockedError(e);
    }
    return e.message;
  }
  if (typeof e === 'object' && e !== null && 'issues' in e) {
    const issues = (e as { issues?: Array<{ message?: string }> }).issues;
    if (Array.isArray(issues) && issues.length) return issues[0]?.message || fallback;
  }
  if (e instanceof Error) return e.message;
  return fallback;
}

function fmtDate(value?: string | null) {
  if (!value) return '-';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    const localDate = new Date(y, (m || 1) - 1, d || 1);
    return Number.isNaN(localDate.getTime()) ? value : localDate.toLocaleDateString();
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString();
}

function fmtDateTime(value?: string | null) {
  if (!value) return '-';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
}

function fmtLocalTimeLabel(value?: string | null) {
  if (!value) return '-';
  const [hhStr, mmStr] = value.split(':');
  const hh = Number(hhStr);
  const mm = Number(mmStr);
  if (!Number.isInteger(hh) || !Number.isInteger(mm)) return value;
  const suffix = hh >= 12 ? 'PM' : 'AM';
  const hour12 = hh % 12 === 0 ? 12 : hh % 12;
  return `${hour12}:${String(mm).padStart(2, '0')} ${suffix}`;
}

function toLocalDateInputValue(value?: string | null): string {
  if (!value) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function defaultSessionTimes(base = new Date()) {
  const start = new Date(base);
  start.setSeconds(0, 0);
  start.setMinutes(Math.floor(start.getMinutes() / 5) * 5);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  const date = toLocalDateInputValue(start.toISOString());
  const pad2 = (v: number) => String(v).padStart(2, '0');
  return {
    date,
    startTimeHHMMSS: `${pad2(start.getHours())}:${pad2(start.getMinutes())}:00`,
    endTimeHHMM: `${pad2(end.getHours())}:${pad2(end.getMinutes())}`,
  };
}

function generateTempPassword(length = 12): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return `Temp@${out}`;
}

export function AdminWorkspace({ page, seasonId, sessionId }: Props) {
  const client = useMemo(() => new LeagueOsApiClient({ apiBaseUrl: API_BASE }), []);
  const router = useRouter();
  const [auth, setAuth] = useState<AuthState | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(STORAGE_AUTH);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as AuthState;
      return parsed?.token && Number.isInteger(parsed?.clubId) ? parsed : null;
    } catch {
      return null;
    }
  });
  const [profile, setProfile] = useState<Profile | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(STORAGE_PROFILE);
      if (!raw) return null;
      return JSON.parse(raw) as Profile;
    } catch {
      return null;
    }
  });
  const [clubs, setClubs] = useState<Club[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [participantsByGame, setParticipantsByGame] = useState<Record<number, GameParticipant[]>>({});
  const [seasonLeaderboardRows, setSeasonLeaderboardRows] = useState<LeaderboardEntry[]>([]);
  const [seasonLeaderboardSession, setSeasonLeaderboardSession] = useState<Session | null>(null);
  const [selectedClubId, setSelectedClubId] = useState<number>(() => {
    if (typeof window === 'undefined') return DEFAULT_CLUB_ID;
    try {
      const raw = window.localStorage.getItem(STORAGE_AUTH);
      if (!raw) return DEFAULT_CLUB_ID;
      const parsed = JSON.parse(raw) as AuthState;
      return parsed?.clubId ?? DEFAULT_CLUB_ID;
    } catch {
      return DEFAULT_CLUB_ID;
    }
  });
  const [ctx, setCtx] = useState<AdminCtx>(() => {
    if (typeof window === 'undefined') return { selectedSeasonId: null };
    try {
      const raw = window.localStorage.getItem(STORAGE_CTX);
      if (!raw) return { selectedSeasonId: null };
      const parsed = JSON.parse(raw) as AdminCtx;
      return { selectedSeasonId: parsed?.selectedSeasonId ?? null };
    } catch {
      return { selectedSeasonId: null };
    }
  });
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(typeof window !== 'undefined');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [showAddClubModal, setShowAddClubModal] = useState(false);
  const [newClubName, setNewClubName] = useState('');
  const [newClubDescription, setNewClubDescription] = useState('');
  const [clubAdminSearch, setClubAdminSearch] = useState('');
  const [clubAdminInviteEmail, setClubAdminInviteEmail] = useState('');
  const [clubAdminCandidates, setClubAdminCandidates] = useState<Array<{ id: number; email: string; full_name?: string | null; display_name?: string | null }>>([]);
  const [selectedClubAdminId, setSelectedClubAdminId] = useState<number | null>(null);
  const [clubAdminSearching, setClubAdminSearching] = useState(false);
  const [lastClubInvite, setLastClubInvite] = useState<null | { email: string; temporary_password: string; invite_link: string }>(null);
  const [lastPlayerInvite, setLastPlayerInvite] = useState<null | { email: string; temporary_password?: string | null; invite_link: string; status: string }>(null);
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [clubUsers, setClubUsers] = useState<ClubUser[]>([]);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>([]);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [addUserError, setAddUserError] = useState<string | null>(null);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserFullName, setNewUserFullName] = useState('');
  const [newUserPrimaryClubId, setNewUserPrimaryClubId] = useState<number | null>(null);
  const [newUserRole, setNewUserRole] = useState<'CLUB_ADMIN' | 'RECORDER'>('RECORDER');
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerEmail, setNewPlayerEmail] = useState('');
  const [newPlayerPhone, setNewPlayerPhone] = useState('');
  const [newPlayerAddress, setNewPlayerAddress] = useState('');
  const [newPlayerSex, setNewPlayerSex] = useState<'M' | 'F'>('M');
  const [newPlayerEloSingles, setNewPlayerEloSingles] = useState('1000');
  const [newPlayerEloDoubles, setNewPlayerEloDoubles] = useState('1000');
  const [newPlayerEloMixed, setNewPlayerEloMixed] = useState('1000');
  const [newPlayerShowOnLeaderboard, setNewPlayerShowOnLeaderboard] = useState(true);
  const [showAddPlayerModal, setShowAddPlayerModal] = useState(false);
  const [newPlayerType, setNewPlayerType] = useState<'ROSTER' | 'DROP_IN' | 'DROP_IN_A1'>('ROSTER');
  const [newCourtName, setNewCourtName] = useState('');
  const [newSeasonName, setNewSeasonName] = useState('');
  const [newSeasonFormat, setNewSeasonFormat] = useState<'SINGLES' | 'DOUBLES' | 'MIXED_DOUBLES'>('DOUBLES');
  const [newSessionSeasonId, setNewSessionSeasonId] = useState<number | null>(null);
  const [newSessionDate, setNewSessionDate] = useState(() => defaultSessionTimes().date);
  const [newSessionStartTime, setNewSessionStartTime] = useState(() => defaultSessionTimes().startTimeHHMMSS);
  const [newSessionStatus, setNewSessionStatus] = useState<'UPCOMING' | 'OPEN' | 'CANCELLED'>('UPCOMING');
  const [newSessionName, setNewSessionName] = useState('Club Session');
  const [newSessionLocation, setNewSessionLocation] = useState('');

  const role = toAdminEffectiveRole(profile?.role, profile?.club_role);
  const allowed = canAccessAdmin(role);
  const isGlobalAdmin = role === 'GLOBAL_ADMIN';
  const globalAdminAllowedPages = new Set<AdminPage>(['dashboard', 'clubs', 'config', 'users']);
  const pageAllowedForRole = !isGlobalAdmin || globalAdminAllowedPages.has(page);
  const visibleNavItems: AdminNavKey[] = isGlobalAdmin
    ? ['dashboard', 'clubs', 'config', 'users']
    : ['dashboard', 'clubs', 'users', 'seasons', 'sessions', 'courts', 'players'];
  const selectedSeason = seasons.find((s) => s.id === (seasonId ?? ctx.selectedSeasonId)) ?? null;
  const selectedSession = sessions.find((s) => s.id === sessionId) ?? null;

  const sessionsInSeason = useMemo(() => {
    const target = seasonId ?? ctx.selectedSeasonId;
    return target ? sessions.filter((s) => s.season_id === target) : sessions;
  }, [sessions, seasonId, ctx.selectedSeasonId]);

  useEffect(() => {
    setHydrated(true);
    try {
      const flash = sessionStorage.getItem('leagueos.admin.flash.error');
      if (flash) {
        setError(flash);
        sessionStorage.removeItem('leagueos.admin.flash.error');
      }
      const params = new URLSearchParams(window.location.search);
      const inviteEmail = (params.get('email') || '').trim();
      if (inviteEmail) setLoginEmail(inviteEmail);
      if (!auth) {
        const rawAuth = localStorage.getItem(STORAGE_AUTH);
        if (rawAuth) {
          const parsed = JSON.parse(rawAuth) as AuthState;
          if (parsed?.token && Number.isInteger(parsed?.clubId)) {
            setAuth(parsed);
            setSelectedClubId(parsed.clubId);
          }
        }
      }
      if (!profile) {
        const rawProfile = localStorage.getItem(STORAGE_PROFILE);
        if (rawProfile) setProfile(JSON.parse(rawProfile) as Profile);
      }
    } catch {
      // ignore bad local storage
    }
    // auth/profile are intentionally not dependencies; this is initial restore only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!auth) return;
    localStorage.setItem(STORAGE_AUTH, JSON.stringify(auth));
  }, [auth]);

  useEffect(() => {
    if (!profile) {
      localStorage.removeItem(STORAGE_PROFILE);
      return;
    }
    localStorage.setItem(STORAGE_PROFILE, JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    localStorage.setItem(STORAGE_CTX, JSON.stringify(ctx));
  }, [ctx]);

  useEffect(() => {
    if (!auth) return;
    void loadAdminData(auth.token, auth.clubId);
  }, [auth?.token]); // intentionally token-driven

  async function loadAdminData(token: string, clubId: number) {
    setLoading(true);
    setError(null);
    try {
      let effectiveToken = token;
      const me = await client.profile(token);
      setProfile(me);
      const availableClubs =
        me.role === 'GLOBAL_ADMIN'
          ? await client.clubs(token).catch(() => [] as Club[])
          : await client.profileClubs(token);
      setClubs(availableClubs);

      const activeClubId = availableClubs.find((c) => c.id === clubId)?.id ?? availableClubs[0]?.id ?? clubId;
      setSelectedClubId(activeClubId);

      // Keep global-admin token scoped to selected club so club-scoped routes work from Users modal.
      if (me.role === 'GLOBAL_ADMIN' && activeClubId > 0 && clubId !== activeClubId) {
        const scoped = await client.switchClub(token, activeClubId);
        effectiveToken = scoped.token;
        setAuth({ token: scoped.token, clubId: activeClubId });
      }

      if (me.role === 'GLOBAL_ADMIN') {
        const [usersList, featureFlagList] = await Promise.all([
          client.adminUsers(effectiveToken).catch(() => [] as AdminUser[]),
          client.featureFlags(effectiveToken).catch(() => [] as FeatureFlag[]),
        ]);
        setAdminUsers(usersList);
        setFeatureFlags(featureFlagList);
        setClubUsers([]);
        setPlayers([]);
        setCourts([]);
        setSeasons([]);
        setSessions([]);
        setGames([]);
        setParticipantsByGame({});
        setSeasonLeaderboardRows([]);
        setSeasonLeaderboardSession(null);
        setNewSessionSeasonId(null);
        return;
      }

      const [activePlayers, inactivePlayers, clubCourts, clubSeasons, clubSessions, clubGames, clubUsersList] = await Promise.all([
        client.players(token, activeClubId, true),
        client.players(token, activeClubId, false).catch(() => [] as Player[]),
        client.courts(token, activeClubId),
        client.seasons(token, activeClubId),
        client.sessions(token, activeClubId),
        client.games(token, activeClubId, undefined, undefined, undefined, true).catch(() => [] as Game[]),
        client.clubUsers(token, activeClubId).catch(() => [] as ClubUser[]),
      ]);
      const clubPlayers = mergeAdminPlayers(activePlayers, inactivePlayers);

      setPlayers(clubPlayers);
      setCourts(clubCourts);
      setSeasons(clubSeasons);
      setSessions(clubSessions);
      setGames(clubGames);
      setAdminUsers([]);
      setClubUsers(clubUsersList);
      setFeatureFlags([]);
      setNewSessionSeasonId((prev) => prev ?? clubSeasons[0]?.id ?? null);

      // Build participantsByGame from embedded participants (no extra per-game round-trips)
      const participantsMap: Record<number, GameParticipant[]> = {};
      for (const g of clubGames) {
        if (g.participants) participantsMap[g.id] = g.participants;
      }
      setParticipantsByGame(participantsMap);

      if (page === 'seasonDetail' && seasonId) {
        try {
          const seasonBoard = await client.seasonLeaderboard(token, activeClubId, seasonId);
          setSeasonLeaderboardRows(seasonBoard.leaderboard);
          setSeasonLeaderboardSession(seasonBoard.session);
        } catch {
          setSeasonLeaderboardRows([]);
          setSeasonLeaderboardSession(null);
        }
      } else {
        setSeasonLeaderboardRows([]);
        setSeasonLeaderboardSession(null);
      }
    } catch (e) {
      if (page === 'users' && token) {
        const msg = 'Users page is currently unavailable. Redirected to dashboard.';
        setError(msg);
        try {
          sessionStorage.setItem('leagueos.admin.flash.error', msg);
        } catch {
          // no-op
        }
        router.replace('/admin');
        return;
      }
      setProfile(null);
      setAuth(null);
      setClubs([]);
      setPlayers([]);
      setCourts([]);
      setSeasons([]);
      setSessions([]);
      setGames([]);
      setAdminUsers([]);
      setClubUsers([]);
      setFeatureFlags([]);
      setParticipantsByGame({});
      setSeasonLeaderboardRows([]);
      setSeasonLeaderboardSession(null);
      localStorage.removeItem(STORAGE_AUTH);
      localStorage.removeItem(STORAGE_PROFILE);
      setError(getMessage(e, 'Session restore failed. Please sign in again.'));
    } finally {
      setLoading(false);
    }
  }

  async function doLogin() {
    const email = loginEmail.trim();
    const password = loginPassword;
    if (!email) {
      setError('Email is required.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!password) {
      setError('Password is required.');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await client.login({ email, password });
      const me = await client.profile(res.token);
      const nextRole = toAdminEffectiveRole(me.role, me.club_role);
      if (!canAccessAdmin(nextRole)) {
        throw new Error('This account does not have admin access.');
      }

      const isGlobal = me.role === 'GLOBAL_ADMIN';
      const pool = isGlobal
        ? await client.clubs(res.token).catch(() => [] as Club[])
        : await client.profileClubs(res.token);
      const firstClubId = isGlobal ? (res.club_id ?? 0) : (pool[0]?.id ?? res.club_id ?? DEFAULT_CLUB_ID);
      const scoped =
        isGlobal || res.club_id === firstClubId ? res : await client.switchClub(res.token, firstClubId);
      setProfile(me);
      setClubs(pool);
      setSelectedClubId(firstClubId);
      setAuth({ token: scoped.token, clubId: firstClubId });
      setSuccess('Signed in. Loading admin workspace...');
    } catch (e) {
      setError(getMessage(e, 'Login failed.'));
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    if (!auth) return;
    await loadAdminData(auth.token, selectedClubId);
  }

  async function switchClub(nextClubId: number) {
    if (!auth || Number.isNaN(nextClubId)) return;
    try {
      setLoading(true);
      setError(null);
      const scoped = await client.switchClub(auth.token, nextClubId);
      setAuth({ token: scoped.token, clubId: nextClubId });
      setSelectedClubId(nextClubId);
      await loadAdminData(scoped.token, nextClubId);
    } catch (e) {
      setError(getMessage(e, 'Failed to switch club.'));
      setLoading(false);
    }
  }

  function logout() {
    setAuth(null);
    setProfile(null);
    setClubs([]);
    setPlayers([]);
    setCourts([]);
    setSeasons([]);
    setSessions([]);
    setGames([]);
    setAdminUsers([]);
    setClubUsers([]);
    setFeatureFlags([]);
    setParticipantsByGame({});
    setError(null);
    setSuccess(null);
    localStorage.removeItem(STORAGE_AUTH);
    localStorage.removeItem(STORAGE_PROFILE);
  }

  if (!hydrated) {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#eef2f7', padding: 24 }}>
        <section
          style={{
            width: '100%',
            maxWidth: 520,
            background: '#fff',
            border: '1px solid #dbe3ef',
            borderRadius: 18,
            padding: 20,
            boxShadow: '0 16px 30px rgba(15,23,42,.08)',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <img src="/LeagueOS_Full_Logo.png" alt="LeagueOS logo" style={{ width: 220, marginBottom: 8 }} />
            <p style={{ margin: '0', color: '#64748b' }}>Admin workspace for club operations.</p>
          </div>
        </section>
      </main>
    );
  }

  if (auth && !profile) {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#eef2f7', padding: 24 }}>
        <section
          style={{
            width: '100%',
            maxWidth: 520,
            background: '#fff',
            border: '1px solid #dbe3ef',
            borderRadius: 18,
            padding: 20,
            boxShadow: '0 16px 30px rgba(15,23,42,.08)',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <img src="/LeagueOS_Full_Logo.png" alt="LeagueOS logo" style={{ width: 220, marginBottom: 8 }} />
            <p style={{ margin: '0 0 12px', color: '#64748b' }}>Admin workspace for club operations.</p>
          </div>
        </section>
      </main>
    );
  }

  if (!auth || !profile) {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#eef2f7', padding: 24 }}>
        <section style={{ width: '100%', maxWidth: 520, background: '#fff', border: '1px solid #dbe3ef', borderRadius: 18, padding: 20, boxShadow: '0 16px 30px rgba(15,23,42,.08)' }}>
          <img src="/LeagueOS_Full_Logo.png" alt="LeagueOS logo" style={{ width: 260, marginBottom: 8 }} />
          <p style={{ margin: '0 0 12px', color: '#64748b' }}>Admin workspace for club operations.</p>
          <div style={{ display: 'grid', gap: 10 }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, color: '#334155', fontWeight: 600 }}>Email</span>
              <input value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} style={field} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, color: '#334155', fontWeight: 600 }}>Password</span>
              <input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} style={field} />
            </label>
            {error ? <div style={adminAlertError}>{error}</div> : null}
            {success ? <div style={adminAlertSuccess}>{success}</div> : null}
            <button style={primaryBtn} onClick={() => void doLogin()} disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In to Admin'}
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (!allowed) {
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#eef2f7', padding: 24 }}>
        <section style={{ width: '100%', maxWidth: 520, background: '#fff', border: '1px solid #dbe3ef', borderRadius: 18, padding: 20 }}>
          <h2 style={{ margin: 0, color: '#0f172a' }}>Unauthorized</h2>
          <p style={{ margin: '8px 0 0', color: '#64748b' }}>Only GLOBAL_ADMIN and CLUB_ADMIN can access `/admin`.</p>
        </section>
      </main>
    );
  }

  if (!pageAllowedForRole) {
    return (
      <main style={adminPageShell}>
        <AdminSidebar active="clubs" visibleItems={visibleNavItems} />
        <section style={adminMainPanel}>
          <AdminTopbar
            title="Clubs"
            subtitle={profile.display_name || profile.email || undefined}
            roleLabel={role}
            clubOptions={clubs}
            selectedClubId={selectedClubId}
            onClubChange={(clubId) => void switchClub(clubId)}
            seasonOptions={[]}
            selectedSeasonId={null}
            onSeasonChange={() => {}}
            canSelectClub={false}
            showSeasonFilter={false}
            onRefresh={() => void refresh()}
            onLogout={logout}
            loading={loading}
          />
          <div style={adminAlertError}>
            Global Admin can manage clubs and users. Season, session, court, and player pages are hidden for this role.
          </div>
          <AdminCard title="Go to Clubs">
            <p style={{ margin: 0, color: '#475569' }}>
              Use the Clubs page to create and manage clubs.
            </p>
            <div style={{ marginTop: 12 }}>
              <Link href="/admin/clubs" style={primaryBtn}>Open Clubs</Link>
            </div>
          </AdminCard>
        </section>
      </main>
    );
  }

  const activeNav: AdminNavKey =
    page === 'seasonDetail' ? 'seasons' :
    page === 'sessionDetail' ? 'sessions' :
    (page as AdminNavKey);

  const breadcrumbs = buildAdminBreadcrumbs({ page, seasonId, sessionId, seasons, sessions });

  const sessionMatches = selectedSession
    ? games.filter((g) => g.session_id === selectedSession.id)
    : [];

  const showClubSelector = role === 'GLOBAL_ADMIN' && page !== 'clubs';

  return (
    <main style={adminPageShell}>
      <AdminSidebar active={activeNav} visibleItems={visibleNavItems} />
      <section style={adminMainPanel}>
        <AdminTopbar
          title={adminPageTitle(page)}
          subtitle={profile.display_name || profile.email || undefined}
          roleLabel={role}
          clubOptions={clubs}
          selectedClubId={selectedClubId}
          onClubChange={(clubId) => void switchClub(clubId)}
          seasonOptions={seasons.map((s) => ({ id: s.id, name: s.name }))}
          selectedSeasonId={ctx.selectedSeasonId}
          onSeasonChange={(id) => setCtx((prev) => ({ ...prev, selectedSeasonId: id }))}
          canSelectClub={showClubSelector}
          showSeasonFilter={!isGlobalAdmin}
          onRefresh={() => void refresh()}
          onLogout={logout}
          loading={loading}
        />
        <AdminBreadcrumbs items={breadcrumbs} />
        {error ? <div style={adminAlertError}>{error}</div> : null}
        {success ? <div style={adminAlertSuccess}>{success}</div> : null}

        {page === 'dashboard' ? (
          <DashboardPanel clubs={clubs} players={players} courts={courts} seasons={seasons} sessions={sessions} />
        ) : null}
        {page === 'clubs' ? (
          <ClubsPanel
            canManage={canManageClubs(role)}
            clubs={clubs}
            showAddClubModal={showAddClubModal}
            setShowAddClubModal={setShowAddClubModal}
            newClubName={newClubName}
            setNewClubName={setNewClubName}
            newClubDescription={newClubDescription}
            setNewClubDescription={setNewClubDescription}
            clubAdminSearch={clubAdminSearch}
            setClubAdminSearch={setClubAdminSearch}
            clubAdminInviteEmail={clubAdminInviteEmail}
            setClubAdminInviteEmail={setClubAdminInviteEmail}
            clubAdminCandidates={clubAdminCandidates}
            selectedClubAdminId={selectedClubAdminId}
            setSelectedClubAdminId={setSelectedClubAdminId}
            clubAdminSearching={clubAdminSearching}
            lastClubInvite={lastClubInvite}
            setLastClubInvite={setLastClubInvite}
            onSearchAdmins={async (q) => {
              if (!auth) return;
              if (q.trim().length < 3) {
                setClubAdminCandidates([]);
                setSelectedClubAdminId(null);
                return;
              }
              setClubAdminSearching(true);
              try {
                const results = await client.clubAdminCandidates(auth.token, q.trim());
                setClubAdminCandidates(results);
              } finally {
                setClubAdminSearching(false);
              }
            }}
            onCreate={async () => {
              if (!auth || !newClubName.trim() || (!selectedClubAdminId && !clubAdminInviteEmail.trim())) return;
              const created = await client.createClub(auth.token, {
                name: newClubName.trim(),
                description: newClubDescription.trim() || undefined,
                club_admin_user_id: selectedClubAdminId ?? undefined,
                club_admin_email: !selectedClubAdminId ? clubAdminInviteEmail.trim() : undefined,
              });
              setLastClubInvite(created.invite ? {
                email: created.invite.email,
                temporary_password: created.invite.temporary_password,
                invite_link: created.invite.invite_link,
              } : null);
              setNewClubName('');
              setNewClubDescription('');
              setClubAdminSearch('');
              setClubAdminInviteEmail('');
              setClubAdminCandidates([]);
              setSelectedClubAdminId(null);
              setShowAddClubModal(false);
              setSuccess(created.invite ? 'Club created. Invite generated for club admin.' : 'Club created and admin assigned.');
              await refresh();
            }}
            onDelete={async (clubId) => {
              if (!auth) return;
              await client.deleteClub(auth.token, clubId);
              setSuccess('Club deleted.');
              await refresh();
            }}
          />
        ) : null}
        {page === 'config' ? (
          <ConfigPanel
            featureFlags={featureFlags}
            loading={loading}
            onToggle={async (flag, enabled) => {
              if (!auth) return;
              await client.updateFeatureFlag(auth.token, flag.key, enabled);
              setSuccess(`Updated ${flag.name}.`);
              await refresh();
            }}
          />
        ) : null}
        {page === 'users' ? (
          <UsersPanel
            canManage={role === 'GLOBAL_ADMIN'}
            isGlobalAdmin={role === 'GLOBAL_ADMIN'}
            users={adminUsers}
            clubUsers={clubUsers}
            clubs={clubs}
            selectedClubId={selectedClubId}
            showAddUserModal={showAddUserModal}
            setShowAddUserModal={setShowAddUserModal}
            addUserError={addUserError}
            setAddUserError={setAddUserError}
            newUserEmail={newUserEmail}
            setNewUserEmail={setNewUserEmail}
            newUserFullName={newUserFullName}
            setNewUserFullName={setNewUserFullName}
            newUserPrimaryClubId={newUserPrimaryClubId}
            setNewUserPrimaryClubId={setNewUserPrimaryClubId}
            newUserRole={newUserRole}
            setNewUserRole={setNewUserRole}
            onCreate={async () => {
              if (!auth || !newUserEmail.trim() || !newUserFullName.trim() || !newUserPrimaryClubId) return;
              setError(null);
              setSuccess(null);
              setAddUserError(null);
              try {
                await client.createAdminUser(auth.token, {
                  email: newUserEmail.trim(),
                  full_name: newUserFullName.trim(),
                  primary_club_id: newUserPrimaryClubId,
                  role: newUserRole,
                });
                setNewUserEmail('');
                setNewUserFullName('');
                setNewUserPrimaryClubId(null);
                setNewUserRole('RECORDER');
                setShowAddUserModal(false);
                setAddUserError(null);
                setSuccess('User created.');
                await refresh();
              } catch (e) {
                const isDuplicate = e instanceof ApiError && (e.code === 'USER_EMAIL_EXISTS' || e.status === 409);
                const msg = isDuplicate
                  ? 'User with this email already exists. Please use a different email or assign the existing user.'
                  : getMessage(e, 'Failed to create user.');
                setAddUserError(msg);
              }
            }}
            onToggleStatus={async (u) => {
              if (!auth) return;
              await client.setAdminUserStatus(auth.token, u.id, !u.is_active);
              setSuccess(`User ${u.is_active ? 'disabled' : 'enabled'}.`);
              await refresh();
            }}
            onLoadClubUser={async (userId) => {
              if (!auth) throw new Error('Not authenticated');
              return client.clubUserDetail(auth.token, selectedClubId, userId);
            }}
            onSaveClubUser={async (userId, payload) => {
              if (!auth) throw new Error('Not authenticated');
              await client.updateClubUser(auth.token, selectedClubId, userId, payload);
              setSuccess('User updated.');
              await refresh();
            }}
            onResetClubUserPassword={async (userId, newPassword, confirmPassword) => {
              if (!auth) throw new Error('Not authenticated');
              await client.resetClubUserPassword(auth.token, selectedClubId, userId, newPassword, confirmPassword);
              setSuccess('Password changed.');
            }}
            onDeleteClubUser={async (userId) => {
              if (!auth) throw new Error('Not authenticated');
              await client.deleteClubUser(auth.token, selectedClubId, userId);
              setSuccess('User removed from club.');
              await refresh();
            }}
          />
        ) : null}
        {page === 'players' ? (
          <PlayersPanel
            players={players}
            clubUsers={clubUsers}
            newPlayerName={newPlayerName}
            setNewPlayerName={setNewPlayerName}
            newPlayerEmail={newPlayerEmail}
            setNewPlayerEmail={setNewPlayerEmail}
            newPlayerPhone={newPlayerPhone}
            setNewPlayerPhone={setNewPlayerPhone}
            newPlayerAddress={newPlayerAddress}
            setNewPlayerAddress={setNewPlayerAddress}
            newPlayerSex={newPlayerSex}
            setNewPlayerSex={setNewPlayerSex}
            newPlayerEloSingles={newPlayerEloSingles}
            setNewPlayerEloSingles={setNewPlayerEloSingles}
            newPlayerEloDoubles={newPlayerEloDoubles}
            setNewPlayerEloDoubles={setNewPlayerEloDoubles}
            newPlayerEloMixed={newPlayerEloMixed}
            setNewPlayerEloMixed={setNewPlayerEloMixed}
            newPlayerShowOnLeaderboard={newPlayerShowOnLeaderboard}
            setNewPlayerShowOnLeaderboard={setNewPlayerShowOnLeaderboard}
            showAddPlayerModal={showAddPlayerModal}
            setShowAddPlayerModal={setShowAddPlayerModal}
            newPlayerType={newPlayerType}
            setNewPlayerType={setNewPlayerType}
            lastPlayerInvite={lastPlayerInvite}
            setLastPlayerInvite={setLastPlayerInvite}
            onCreate={async () => {
              if (!auth || !newPlayerName.trim()) return;
              await client.createPlayer(auth.token, selectedClubId, {
                display_name: newPlayerName.trim(),
                email: newPlayerEmail.trim() || undefined,
                phone: newPlayerPhone.trim() || undefined,
                elo_initial_singles: Number(newPlayerEloSingles || '1000'),
                elo_initial_doubles: Number(newPlayerEloDoubles || '1000'),
                elo_initial_mixed: Number(newPlayerEloMixed || '1000'),
                player_type: newPlayerType,
                sex: newPlayerSex,
                is_active: true,
                show_on_leaderboard: newPlayerShowOnLeaderboard,
              });
              setNewPlayerName('');
              setNewPlayerEmail('');
              setNewPlayerPhone('');
              setNewPlayerAddress('');
              setNewPlayerSex('M');
              setNewPlayerEloSingles('1000');
              setNewPlayerEloDoubles('1000');
              setNewPlayerEloMixed('1000');
              setNewPlayerShowOnLeaderboard(true);
              setShowAddPlayerModal(false);
              setLastPlayerInvite(null);
              setSuccess('Player created.');
              await refresh();
            }}
            onUpsertExisting={async (playerId) => {
              if (!auth || !newPlayerName.trim()) return;
              await client.updatePlayer(auth.token, selectedClubId, playerId, {
                display_name: newPlayerName.trim(),
                email: newPlayerEmail.trim() || null,
                phone: newPlayerPhone.trim() || null,
                elo_initial_singles: Number(newPlayerEloSingles || '1000'),
                elo_initial_doubles: Number(newPlayerEloDoubles || '1000'),
                elo_initial_mixed: Number(newPlayerEloMixed || '1000'),
                player_type: newPlayerType,
                sex: newPlayerSex,
                is_active: true,
                show_on_leaderboard: newPlayerShowOnLeaderboard,
              });
              setNewPlayerName('');
              setNewPlayerEmail('');
              setNewPlayerPhone('');
              setNewPlayerAddress('');
              setNewPlayerSex('M');
              setNewPlayerEloSingles('1000');
              setNewPlayerEloDoubles('1000');
              setNewPlayerEloMixed('1000');
              setNewPlayerShowOnLeaderboard(true);
              setShowAddPlayerModal(false);
              setLastPlayerInvite(null);
              setSuccess('Player updated.');
              await refresh();
            }}
            onInviteFromPlayer={async (p) => {
              if (!auth) return;
              const invite = await client.inviteUserFromPlayer(auth.token, selectedClubId, p.id);
              setLastPlayerInvite({
                email: invite.email,
                temporary_password: invite.temporary_password ?? undefined,
                invite_link: invite.invite_link,
                status: invite.status,
              });
              setSuccess(invite.status === 'USER_CREATED_INVITE_READY' ? 'User account created and assigned to this club.' : 'User account linked to this club.');
              await refresh();
            }}
            onToggle={async (p) => {
              if (!auth) return;
              await client.updatePlayer(auth.token, selectedClubId, p.id, { is_active: !p.is_active });
              setSuccess('Player updated.');
              await refresh();
            }}
            onDelete={async (p) => {
              if (!auth) return;
              try {
                await client.deletePlayer(auth.token, selectedClubId, p.id);
                setSuccess('Player deleted.');
                setError(null);
                await refresh();
              } catch (e) {
                if (e instanceof ApiError && e.code === 'PLAYER_IN_USE') {
                  setError('Cannot delete this player because they are already used in match/rating history. Deactivate the player instead, or remove related records first.');
                  return;
                }
                setError(getMessage(e, 'Failed to delete player.'));
              }
            }}
          />
        ) : null}
        {page === 'courts' ? (
          <CourtsPanel
            courts={courts}
            newCourtName={newCourtName}
            setNewCourtName={setNewCourtName}
            onCreate={async () => {
              if (!auth || !newCourtName.trim()) return;
              await client.createCourt(auth.token, selectedClubId, { name: newCourtName.trim(), is_active: true });
              setNewCourtName('');
              setSuccess('Court created.');
              await refresh();
            }}
            onToggle={async (court) => {
              if (!auth) return;
              await client.updateCourt(auth.token, selectedClubId, court.id, { is_active: !court.is_active });
              setSuccess('Court updated.');
              await refresh();
            }}
            onDelete={async (court) => {
              if (!auth) return;
              await client.deleteCourt(auth.token, selectedClubId, court.id);
              setSuccess('Court deleted.');
              await refresh();
            }}
          />
        ) : null}
        {page === 'seasons' ? (
          <SeasonsPanel
            seasons={seasons}
            sessions={sessions}
            games={games}
            players={players}
            newSeasonName={newSeasonName}
            setNewSeasonName={setNewSeasonName}
            newSeasonFormat={newSeasonFormat}
            setNewSeasonFormat={setNewSeasonFormat}
            onCreate={async () => {
              if (!auth || !newSeasonName.trim()) return;
              await client.createSeason(auth.token, selectedClubId, {
                name: newSeasonName.trim(),
                format: newSeasonFormat,
                weekday: 0,
                start_time_local: '00:00:00',
                timezone: 'America/Vancouver',
                is_active: true,
              });
              setNewSeasonName('');
              setSuccess('Season created.');
              await refresh();
            }}
            onToggle={async (s) => {
              if (!auth) return;
              await client.updateSeason(auth.token, selectedClubId, s.id, { is_active: !s.is_active });
              setSuccess('Season updated.');
              await refresh();
            }}
            onDelete={async (s) => {
              if (!auth) return;
              const seasonSessions = sessions.filter((x) => x.season_id === s.id);
              const seasonSessionIds = new Set(seasonSessions.map((x) => x.id));
              const seasonGames = games.filter((g) => seasonSessionIds.has(g.session_id));
              if (seasonSessions.length > 0 || seasonGames.length > 0) {
                setError('Season can only be deleted when it has no sessions and no games.');
                return;
              }
              await client.deleteSeason(auth.token, selectedClubId, s.id);
              setError(null);
              setSuccess('Season deleted.');
              await refresh();
            }}
          />
        ) : null}
        {page === 'seasonDetail' ? (
          <SeasonDetailPanel
            season={selectedSeason}
            sessions={sessions.filter((s) => s.season_id === selectedSeason?.id)}
            players={players}
            leaderboardRows={seasonLeaderboardRows}
            leaderboardSession={seasonLeaderboardSession}
            onSessionCreate={async () => {
              if (!auth || !selectedSeason || !newSessionDate) return;
              const sessionStartIso = combineSessionDateAndTimeToIso(newSessionDate, newSessionStartTime);
              if (!sessionStartIso) throw new Error('Invalid session start date/time.');
              await client.createSession(auth.token, selectedClubId, {
                season_id: selectedSeason.id,
                session_start_time: sessionStartIso,
                status: newSessionStatus,
                location: newSessionName,
                address: newSessionLocation || undefined,
              });
              setSuccess('Session created.');
              setNewSessionLocation('');
              await refresh();
            }}
            newSessionDate={newSessionDate}
            setNewSessionDate={setNewSessionDate}
            newSessionStartTime={newSessionStartTime}
            setNewSessionStartTime={setNewSessionStartTime}
            newSessionStatus={newSessionStatus}
            setNewSessionStatus={setNewSessionStatus}
            newSessionName={newSessionName}
            setNewSessionName={setNewSessionName}
            newSessionLocation={newSessionLocation}
            setNewSessionLocation={setNewSessionLocation}
            loading={loading}
            onRenameSeason={async (newName) => {
              if (!auth || !selectedSeason) return;
              await client.updateSeason(auth.token, selectedClubId, selectedSeason.id, { name: newName });
              setSuccess('Season renamed.');
              await refresh();
            }}
            onRenameSession={async (sessionId, newName) => {
              if (!auth) return;
              await client.updateSession(auth.token, selectedClubId, sessionId, { location: newName });
              setSuccess('Session renamed.');
              await refresh();
            }}
          />
        ) : null}
        {page === 'sessions' ? (
          <SessionsPanel
            sessions={sessionsInSeason}
            seasons={seasons}
            games={games}
            participantsByGame={participantsByGame}
            selectedSeasonId={ctx.selectedSeasonId}
            setSelectedSeasonId={(id) => setCtx((prev) => ({ ...prev, selectedSeasonId: id }))}
            newSessionSeasonId={newSessionSeasonId}
            setNewSessionSeasonId={setNewSessionSeasonId}
            newSessionDate={newSessionDate}
            setNewSessionDate={setNewSessionDate}
            newSessionStartTime={newSessionStartTime}
            setNewSessionStartTime={setNewSessionStartTime}
            newSessionStatus={newSessionStatus}
            setNewSessionStatus={setNewSessionStatus}
            newSessionName={newSessionName}
            setNewSessionName={setNewSessionName}
            onCreate={async () => {
              if (!auth || !newSessionSeasonId) return;
              const sessionStartIso = combineSessionDateAndTimeToIso(newSessionDate, newSessionStartTime);
              if (!sessionStartIso) throw new Error('Invalid session start date/time.');
              await client.createSession(auth.token, selectedClubId, {
                season_id: newSessionSeasonId,
                session_start_time: sessionStartIso,
                status: newSessionStatus,
                location: newSessionName,
              });
              setSuccess('Session created.');
              await refresh();
            }}
            onDeleteSession={async (sessionId) => {
              if (!auth) return;
              await client.deleteSession(auth.token, selectedClubId, sessionId);
              setSuccess('Session deleted.');
              await refresh();
            }}
            onRenameSession={async (sessionId, newName) => {
              if (!auth) return;
              await client.updateSession(auth.token, selectedClubId, sessionId, { location: newName });
              setSuccess('Session renamed.');
              await refresh();
            }}
          />
        ) : null}
        {page === 'sessionDetail' ? (
          <SessionDetailPanel
            session={selectedSession}
            season={seasons.find((s) => s.id === selectedSession?.season_id) ?? null}
            sessionMatches={sessionMatches}
            participantsByGame={participantsByGame}
            players={players}
            courts={courts}
            onAddMatch={async (payload) => {
              if (!auth || !selectedSession) return;
              const startTimeIso = combineSessionDateAndTimeToIso(selectedSession.session_date, payload.startTimeLocal);
              if (!startTimeIso) {
                throw new Error('Invalid start time. Please pick a valid time in 5-minute increments.');
              }
              if (!payload.courtId) {
                throw new Error('Please select a court.');
              }
              const game = await client.createGame(auth.token, selectedClubId, {
                session_id: selectedSession.id,
                court_id: payload.courtId,
                start_time: startTimeIso,
                score_a: payload.scoreA,
                score_b: payload.scoreB,
              });
              await client.upsertGameParticipants(auth.token, selectedClubId, game.id, [
                { player_id: payload.sideAPlayerIds[0], side: 'A' },
                { player_id: payload.sideAPlayerIds[1], side: 'A' },
                { player_id: payload.sideBPlayerIds[0], side: 'B' },
                { player_id: payload.sideBPlayerIds[1], side: 'B' },
              ]);
              setSuccess('Match added.');
              await refresh();
            }}
            onClose={async () => {
              if (!auth || !selectedSession) return;
              await client.closeSession(auth.token, selectedClubId, selectedSession.id);
              setSuccess('Session closed.');
              await refresh();
            }}
            onOpen={async () => {
              if (!auth || !selectedSession) return;
              await client.openSession(auth.token, selectedClubId, selectedSession.id);
              setSuccess('Session opened.');
              await refresh();
            }}
            onFinalize={async () => {
              if (!auth || !selectedSession) return;
              try {
                await client.finalizeSession(auth.token, selectedClubId, selectedSession.id);
                setSuccess('Session finalized.');
                await refresh();
              } catch (e) {
                setError(getMessage(e, 'Failed to finalize session.'));
              }
            }}
            onRevert={async () => {
              if (!auth || !selectedSession) return;
              await client.revertSessionFinalize(auth.token, selectedClubId, selectedSession.id);
              setSuccess('Session reverted.');
              await refresh();
            }}
            onDeleteMatch={async (gameId) => {
              if (!auth || !selectedSession) return;
              await client.deleteGame(auth.token, selectedClubId, gameId);
              setSuccess('Match deleted.');
              await refresh();
            }}
            onEditMatch={async (gameId, payload) => {
              if (!auth || !selectedSession) return;
              const startTimeIso = combineSessionDateAndTimeToIso(selectedSession.session_date, payload.startTimeLocal);
              if (!startTimeIso) {
                throw new Error('Invalid start time. Please pick a valid time in 5-minute increments.');
              }
              if (!payload.courtId) {
                throw new Error('Please select a court.');
              }
              await client.updateGame(auth.token, selectedClubId, gameId, {
                court_id: payload.courtId,
                start_time: startTimeIso,
                score_a: payload.scoreA,
                score_b: payload.scoreB,
              });
              await client.upsertGameParticipants(auth.token, selectedClubId, gameId, [
                { player_id: payload.sideAPlayerIds[0], side: 'A' },
                { player_id: payload.sideAPlayerIds[1], side: 'A' },
                { player_id: payload.sideBPlayerIds[0], side: 'B' },
                { player_id: payload.sideBPlayerIds[1], side: 'B' },
              ]);
              setSuccess('Match updated.');
              await refresh();
            }}
            onStatusChange={async (nextStatus) => {
              if (!auth || !selectedSession) return;
              if (nextStatus === selectedSession.status) return;
              setError(null);
              setSuccess(null);
              try {
                if (nextStatus === 'OPEN') {
                  if (selectedSession.status === 'CLOSED') {
                    await client.openSession(auth.token, selectedClubId, selectedSession.id);
                  } else {
                    await client.updateSession(auth.token, selectedClubId, selectedSession.id, { status: 'OPEN' });
                  }
                } else if (nextStatus === 'CLOSED') {
                  if (selectedSession.status === 'OPEN') {
                    await client.closeSession(auth.token, selectedClubId, selectedSession.id);
                  } else {
                    await client.updateSession(auth.token, selectedClubId, selectedSession.id, { status: 'CLOSED' });
                  }
                } else {
                  await client.updateSession(auth.token, selectedClubId, selectedSession.id, { status: nextStatus });
                }
                setSuccess(`Session status updated to ${nextStatus}.`);
                await refresh();
              } catch (e) {
                setError(getMessage(e, `Failed to update status to ${nextStatus}.`));
              }
            }}
            onUpdateSchedule={async (sessionDate, startTimeHHmm) => {
              if (!auth || !selectedSession) return;
              const sessionStartIso = combineSessionDateAndTimeToIso(sessionDate, `${startTimeHHmm}:00`);
              if (!sessionStartIso) {
                throw new Error('Invalid session start date/time.');
              }
              await client.updateSession(auth.token, selectedClubId, selectedSession.id, {
                session_start_time: sessionStartIso,
              });
              setSuccess('Session date/time updated.');
              await refresh();
            }}
          />
        ) : null}
      </section>
    </main>
  );
}

function DashboardPanel({ clubs, players, courts, seasons, sessions }: { clubs: Club[]; players: Player[]; courts: Court[]; seasons: Season[]; sessions: Session[] }) {
  const cards = [
    ['Clubs', clubs.length],
    ['Players', players.length],
    ['Courts', courts.length],
    ['Seasons', seasons.length],
    ['Sessions', sessions.length],
    ['Open Sessions', sessions.filter((s) => s.status === 'OPEN').length],
  ];
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
        {cards.map(([label, value]) => (
          <AdminCard key={label} title={String(label)}>
            <div style={{ fontSize: 32, fontWeight: 800, color: '#0f172a' }}>{value}</div>
          </AdminCard>
        ))}
      </div>
      <AdminCard title="Needs Attention">
        <div style={{ display: 'grid', gap: 8 }}>
          {sessions.filter((s) => s.status === 'OPEN').length === 0 ? (
            <div style={{ color: '#9f1239' }}>No OPEN session found for the current club.</div>
          ) : null}
          {players.filter((p) => !p.email).length > 0 ? (
            <div style={{ color: '#92400e' }}>{players.filter((p) => !p.email).length} player(s) missing email.</div>
          ) : null}
          {courts.length === 0 ? <div style={{ color: '#9f1239' }}>No courts configured.</div> : null}
          {sessions.filter((s) => s.status === 'OPEN').length > 0 && courts.length > 0 ? (
            <div style={{ color: '#065f46' }}>Core setup looks good for session operations.</div>
          ) : null}
        </div>
      </AdminCard>
    </div>
  );
}

function ClubsPanel({
  canManage,
  clubs,
  showAddClubModal,
  setShowAddClubModal,
  newClubName,
  setNewClubName,
  newClubDescription,
  setNewClubDescription,
  clubAdminSearch,
  setClubAdminSearch,
  clubAdminInviteEmail,
  setClubAdminInviteEmail,
  clubAdminCandidates,
  selectedClubAdminId,
  setSelectedClubAdminId,
  clubAdminSearching,
  lastClubInvite,
  setLastClubInvite,
  onSearchAdmins,
  onCreate,
  onDelete,
}: {
  canManage: boolean;
  clubs: Club[];
  showAddClubModal: boolean;
  setShowAddClubModal: (v: boolean) => void;
  newClubName: string;
  setNewClubName: (v: string) => void;
  newClubDescription: string;
  setNewClubDescription: (v: string) => void;
  clubAdminSearch: string;
  setClubAdminSearch: (v: string) => void;
  clubAdminInviteEmail: string;
  setClubAdminInviteEmail: (v: string) => void;
  clubAdminCandidates: Array<{ id: number; email: string; full_name?: string | null; display_name?: string | null }>;
  selectedClubAdminId: number | null;
  setSelectedClubAdminId: (id: number | null) => void;
  clubAdminSearching: boolean;
  lastClubInvite: null | { email: string; temporary_password: string; invite_link: string };
  setLastClubInvite: (v: null | { email: string; temporary_password: string; invite_link: string }) => void;
  onSearchAdmins: (q: string) => Promise<void>;
  onCreate: () => Promise<void>;
  onDelete: (clubId: number) => Promise<void>;
}) {
  const selectedAdmin = clubAdminCandidates.find((u) => u.id === selectedClubAdminId) ?? null;

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <AdminCard title="Club Directory" action={canManage ? (
        <button style={primaryBtn} onClick={() => setShowAddClubModal(true)}>Add Club</button>
      ) : null}>
        {lastClubInvite ? (
          <div style={{ ...adminAlertSuccess, marginBottom: 10 }}>
            Invite ready for <strong>{lastClubInvite.email}</strong>. Temporary password: <code>{lastClubInvite.temporary_password}</code>
            <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a href={lastClubInvite.invite_link} target="_blank" rel="noreferrer" style={{ color: '#0d9488', fontWeight: 700 }}>
                Open invite link
              </a>
              <button
                style={outlineBtn}
                onClick={() => void navigator.clipboard?.writeText(lastClubInvite.invite_link)}
              >
                Copy Invite Link
              </button>
              <button style={outlineBtn} onClick={() => setLastClubInvite(null)}>Dismiss</button>
            </div>
          </div>
        ) : null}
        {!canManage ? (
          <AdminEmptyState title="Global Admin action required" description="Club creation and deletion is available only to Global Admin. Club Admin can view club information here." />
        ) : null}
        <AdminTable
          columns={['ID', 'Club Name', 'Description', 'Created', 'Actions']}
          rows={clubs.map((club) => [
            club.id,
            <Link key={`club-${club.id}`} href={`/admin/clubs`} style={{ color: '#0d9488', textDecoration: 'none', fontWeight: 700 }}>{club.name}</Link>,
            club.description || '-',
            fmtDateTime(club.created_at),
            canManage ? (
              <button key="delete" style={outlineBtn} onClick={() => { if (window.confirm(`Delete ${club.name}?`)) void onDelete(club.id); }}>Delete</button>
            ) : 'View only',
          ])}
        />
      </AdminCard>

      {showAddClubModal ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.35)', display: 'grid', placeItems: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ width: '100%', maxWidth: 640, background: '#fff', borderRadius: 16, border: '1px solid #cbd5e1', boxShadow: '0 20px 50px rgba(15,23,42,.25)', padding: 16, display: 'grid', gap: 10 }}>
            <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 18 }}>Add Club</div>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 12, color: '#64748b' }}>Club Name</span>
              <input value={newClubName} onChange={(e) => setNewClubName(e.target.value)} style={field} placeholder="Enter club name" />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 12, color: '#64748b' }}>Club Description</span>
              <textarea value={newClubDescription} onChange={(e) => setNewClubDescription(e.target.value)} style={{ ...field, minHeight: 90, resize: 'vertical' }} placeholder="Enter club description" />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 12, color: '#64748b' }}>Club Admin</span>
              <input
                value={clubAdminSearch}
                onChange={(e) => {
                  const q = e.target.value;
                  setClubAdminSearch(q);
                  setSelectedClubAdminId(null);
                  void onSearchAdmins(q);
                }}
                style={field}
                placeholder="Search by full name or email (min 3 chars)"
              />
            </label>
            <div style={{ color: '#64748b', fontSize: 12 }}>Select an existing user above, or invite a new club admin by email below.</div>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 12, color: '#64748b' }}>Invite Club Admin by Email (optional)</span>
              <input
                value={clubAdminInviteEmail}
                onChange={(e) => {
                  setClubAdminInviteEmail(e.target.value);
                  if (e.target.value.trim()) setSelectedClubAdminId(null);
                }}
                style={field}
                placeholder="new-admin@example.com"
              />
            </label>
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: 8, minHeight: 74, maxHeight: 180, overflowY: 'auto', background: '#f8fafc' }}>
              {clubAdminSearch.trim().length < 3 ? <div style={{ color: '#64748b', fontSize: 12 }}>Type at least 3 characters to search users.</div> : null}
              {clubAdminSearch.trim().length >= 3 && clubAdminSearching ? <div style={{ color: '#64748b', fontSize: 12 }}>Searching…</div> : null}
              {clubAdminSearch.trim().length >= 3 && !clubAdminSearching && !clubAdminCandidates.length ? <div style={{ color: '#64748b', fontSize: 12 }}>No matching users found.</div> : null}
              {clubAdminCandidates.map((u) => (
                <label key={u.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 4px', cursor: 'pointer' }}>
                  <input type="radio" checked={selectedClubAdminId === u.id} onChange={() => setSelectedClubAdminId(u.id)} />
                  <span style={{ fontSize: 13 }}>
                    {(u.full_name || u.display_name || '(No name)')} — {u.email}
                  </span>
                </label>
              ))}
            </div>
            {selectedAdmin ? <div style={{ color: '#0f766e', fontSize: 12 }}>Selected admin: {selectedAdmin.full_name || selectedAdmin.display_name || selectedAdmin.email}</div> : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <button
                style={outlineBtn}
                onClick={() => {
                  setShowAddClubModal(false);
                  setNewClubName('');
                  setNewClubDescription('');
                  setClubAdminSearch('');
                  setClubAdminInviteEmail('');
                  setSelectedClubAdminId(null);
                }}
              >
                Cancel
              </button>
              <button
                style={primaryBtn}
                onClick={() => void onCreate()}
                disabled={!newClubName.trim() || (!selectedClubAdminId && !clubAdminInviteEmail.trim())}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}


function UsersPanel(props: {
  canManage: boolean;
  isGlobalAdmin: boolean;
  users: AdminUser[];
  clubUsers: ClubUser[];
  clubs: Club[];
  selectedClubId: number;
  showAddUserModal: boolean;
  setShowAddUserModal: (v: boolean) => void;
  addUserError: string | null;
  setAddUserError: (v: string | null) => void;
  newUserEmail: string;
  setNewUserEmail: (v: string) => void;
  newUserFullName: string;
  setNewUserFullName: (v: string) => void;
  newUserPrimaryClubId: number | null;
  setNewUserPrimaryClubId: (v: number | null) => void;
  newUserRole: 'CLUB_ADMIN' | 'RECORDER';
  setNewUserRole: (v: 'CLUB_ADMIN' | 'RECORDER') => void;
  onCreate: () => Promise<void>;
  onToggleStatus: (u: AdminUser) => Promise<void>;
  onLoadClubUser: (userId: number) => Promise<ClubUser>;
  onSaveClubUser: (
    userId: number,
    payload: {
      full_name: string;
      email: string;
      phone?: string;
      sex: 'M' | 'F';
      player_type: 'ROSTER' | 'DROP_IN' | 'DROP_IN_A1';
      elo_initial_singles: number;
      elo_initial_doubles: number;
      elo_initial_mixed: number;
      is_active: boolean;
    },
  ) => Promise<void>;
  onResetClubUserPassword: (userId: number, newPassword: string, confirmPassword: string) => Promise<void>;
  onDeleteClubUser: (userId: number) => Promise<void>;
}) {
  const {
    canManage,
    isGlobalAdmin,
    users,
    clubUsers,
    clubs,
    selectedClubId,
    showAddUserModal,
    setShowAddUserModal,
    addUserError,
    setAddUserError,
    newUserEmail,
    setNewUserEmail,
    newUserFullName,
    setNewUserFullName,
    newUserPrimaryClubId,
    setNewUserPrimaryClubId,
    newUserRole,
    setNewUserRole,
    onCreate,
    onToggleStatus,
    onLoadClubUser,
    onSaveClubUser,
    onResetClubUserPassword,
    onDeleteClubUser,
  } = props;

  const selectedClub = clubs.find((c) => c.id === selectedClubId);
  const clubScopedUsers = users.filter((u) => (u.memberships ?? []).some((m) => m.club_id === selectedClubId));
  const [showUserDetailModal, setShowUserDetailModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailName, setDetailName] = useState('');
  const [detailEmail, setDetailEmail] = useState('');
  const [detailPhone, setDetailPhone] = useState('');
  const [detailSex, setDetailSex] = useState<'M' | 'F'>('M');
  const [detailPlayerType, setDetailPlayerType] = useState<'ROSTER' | 'DROP_IN' | 'DROP_IN_A1'>('ROSTER');
  const [detailEloSingles, setDetailEloSingles] = useState('1000');
  const [detailEloDoubles, setDetailEloDoubles] = useState('1000');
  const [detailEloMixed, setDetailEloMixed] = useState('1000');
  const [detailActive, setDetailActive] = useState(true);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordResetNotice, setPasswordResetNotice] = useState<null | { email: string; password: string }>(null);
  const actionIconBtn: React.CSSProperties = {
    ...outlineBtn,
    minWidth: 34,
    padding: '8px 10px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 16,
    lineHeight: 1,
  };
  const deleteIconBtn: React.CSSProperties = {
    ...actionIconBtn,
    color: '#b91c1c',
    borderColor: '#fca5a5',
  };

  async function openDetail(userId: number) {
    try {
      setShowUserDetailModal(true);
      setSelectedUserId(userId);
      setDetailError(null);
      setDetailLoading(true);
      const row = await onLoadClubUser(userId);
      setDetailName(row.full_name || '');
      setDetailEmail(row.email || '');
      setDetailPhone(row.phone || '');
      setDetailSex((row.sex === 'F' ? 'F' : 'M'));
      setDetailPlayerType((row.player_type as 'ROSTER' | 'DROP_IN' | 'DROP_IN_A1') || 'ROSTER');
      setDetailEloSingles(String(row.elo_initial_singles ?? 1000));
      setDetailEloDoubles(String(row.elo_initial_doubles ?? 1000));
      setDetailEloMixed(String(row.elo_initial_mixed ?? 1000));
      setDetailActive(Boolean(row.is_active));
      setNewPassword('');
      setConfirmPassword('');
    } catch (e) {
      setDetailError(getMessage(e, 'Failed to load user detail.'));
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <AdminCard
        title={`Users in ${selectedClub?.name ?? `Club ${selectedClubId}`}`}
        action={isGlobalAdmin && canManage ? <button style={primaryBtn} onClick={() => { setNewUserPrimaryClubId(selectedClubId); setAddUserError(null); setShowAddUserModal(true); }}>Add User</button> : null}
      >
        {passwordResetNotice ? (
          <div style={{ border: '1px solid #86efac', background: '#f0fdf4', color: '#166534', borderRadius: 10, padding: '8px 10px', fontSize: 13, marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span>
              Password updated for <strong>{passwordResetNotice.email}</strong>. New password: <code>{passwordResetNotice.password}</code>
            </span>
            <button
              style={outlineBtn}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(passwordResetNotice.password);
                } catch {
                  // no-op
                }
              }}
            >
              Copy
            </button>
          </div>
        ) : null}
        {isGlobalAdmin ? (
          <>
            <AdminTable
              columns={['User Email', 'Full Name', 'Role in Club', 'Status', 'Action']}
              rows={clubScopedUsers.map((u) => {
                const memberships = u.memberships ?? [];
                const clubMembership = memberships.find((m) => m.club_id === selectedClubId);
                return [
                  <button
                    key={`email-${u.id}`}
                    style={{ ...outlineBtn, padding: 0, border: 'none', background: 'transparent', color: '#0d9488', fontWeight: 700, cursor: 'pointer' }}
                    onClick={() => void openDetail(u.id)}
                  >
                    {u.email}
                  </button>,
                  u.full_name || u.display_name || '-',
                  clubMembership?.role || '-',
                  u.is_active ? 'Enabled' : 'Disabled',
                  canManage ? (
                    <div key={`actions-${u.id}`} style={{ display: 'flex', gap: 8 }}>
                      <button key={`toggle-${u.id}`} style={outlineBtn} onClick={() => void onToggleStatus(u)}>
                        {u.is_active ? 'Disable' : 'Enable'}
                      </button>
                      <button
                        key={`delete-${u.id}`}
                        style={deleteIconBtn}
                        title={`Remove ${u.email} from club`}
                        aria-label={`Remove ${u.email} from club`}
                        onClick={() => {
                          if (window.confirm(`Remove ${u.email} from this club?`)) void onDeleteClubUser(u.id);
                        }}
                      >
                        🗑
                      </button>
                    </div>
                  ) : '-',
                ];
              })}
            />
            {!clubScopedUsers.length ? (
              <div style={{ marginTop: 10, color: '#64748b', fontSize: 13 }}>No users assigned to this club yet.</div>
            ) : null}
          </>
        ) : (
          <>
            <AdminTable
              columns={['User Name', 'Email', 'Role in Club', 'Status', 'Action']}
              rows={clubUsers.map((u) => [
                <button
                  key={`name-${u.id}`}
                  style={{ ...outlineBtn, padding: 0, border: 'none', background: 'transparent', color: '#0d9488', fontWeight: 700, cursor: 'pointer' }}
                  onClick={() => void openDetail(u.id)}
                >
                  {u.full_name}
                </button>,
                u.email,
                u.role_in_club,
                u.is_active ? 'Enabled' : 'Disabled',
                <button
                  key={`delete-${u.id}`}
                  style={deleteIconBtn}
                  title={`Remove ${u.email} from club`}
                  aria-label={`Remove ${u.email} from club`}
                  onClick={() => {
                    if (window.confirm(`Remove ${u.email} from this club?`)) void onDeleteClubUser(u.id);
                  }}
                >
                  🗑
                </button>,
              ])}
            />
            {!clubUsers.length ? <div style={{ marginTop: 10, color: '#64748b', fontSize: 13 }}>No users in this club.</div> : null}
          </>
        )}
      </AdminCard>

      {isGlobalAdmin && showAddUserModal ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.35)', display: 'grid', placeItems: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ width: '100%', maxWidth: 560, background: '#fff', borderRadius: 16, border: '1px solid #cbd5e1', boxShadow: '0 20px 50px rgba(15,23,42,.25)', padding: 16, display: 'grid', gap: 10 }}>
            <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 18 }}>Add User</div>
            {addUserError ? <div style={{ border: '1px solid #fecaca', background: '#fef2f2', color: '#991b1b', borderRadius: 10, padding: '8px 10px', fontSize: 13 }}>{addUserError}</div> : null}
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 12, color: '#64748b' }}>User Email</span>
              <input value={newUserEmail} onChange={(e) => { setAddUserError(null); setNewUserEmail(e.target.value); }} style={field} />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 12, color: '#64748b' }}>Full Name</span>
              <input value={newUserFullName} onChange={(e) => { setAddUserError(null); setNewUserFullName(e.target.value); }} style={field} />
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 12, color: '#64748b' }}>Primary Club</span>
              <select value={newUserPrimaryClubId ?? ''} onChange={(e) => { setAddUserError(null); setNewUserPrimaryClubId(e.target.value ? Number(e.target.value) : null); }} style={field}>
                <option value="">Select club</option>
                {clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label style={{ display: 'grid', gap: 4 }}>
              <span style={{ fontSize: 12, color: '#64748b' }}>Role</span>
              <select value={newUserRole} onChange={(e) => { setAddUserError(null); setNewUserRole(e.target.value as 'CLUB_ADMIN' | 'RECORDER'); }} style={field}>
                <option value="RECORDER">RECORDER</option>
                <option value="CLUB_ADMIN">CLUB_ADMIN</option>
              </select>
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button style={outlineBtn} onClick={() => { setAddUserError(null); setShowAddUserModal(false); }}>Cancel</button>
              <button style={primaryBtn} disabled={!newUserEmail.trim() || !newUserFullName.trim() || !newUserPrimaryClubId} onClick={() => void onCreate()}>Save</button>
            </div>
          </div>
        </div>
      ) : null}

      {showUserDetailModal ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.35)', display: 'grid', placeItems: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ width: '100%', maxWidth: 760, background: '#fff', borderRadius: 16, border: '1px solid #cbd5e1', boxShadow: '0 20px 50px rgba(15,23,42,.25)', padding: 16, display: 'grid', gap: 10 }}>
            <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 18 }}>User Information</div>
            {detailError ? <div style={{ ...adminAlertError }}>{detailError}</div> : null}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label style={{ display: 'grid', gap: 4 }}><span style={{ fontSize: 12, color: '#64748b' }}>Name</span><input value={detailName} onChange={(e) => setDetailName(e.target.value)} style={field} /></label>
              <label style={{ display: 'grid', gap: 4 }}><span style={{ fontSize: 12, color: '#64748b' }}>Email</span><input value={detailEmail} onChange={(e) => setDetailEmail(e.target.value)} style={field} /></label>
              <label style={{ display: 'grid', gap: 4 }}><span style={{ fontSize: 12, color: '#64748b' }}>Phone</span><input value={detailPhone} onChange={(e) => setDetailPhone(e.target.value)} style={field} /></label>
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 12, color: '#64748b' }}>Sex</span>
                <select value={detailSex} onChange={(e) => setDetailSex(e.target.value as 'M' | 'F')} style={field}><option value="M">M</option><option value="F">F</option></select>
              </label>
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 12, color: '#64748b' }}>Player Type</span>
                <select value={detailPlayerType} onChange={(e) => setDetailPlayerType(e.target.value as 'ROSTER' | 'DROP_IN' | 'DROP_IN_A1')} style={field}>
                  <option value="ROSTER">ROSTER</option>
                  <option value="DROP_IN">DROP_IN</option>
                  <option value="DROP_IN_A1">DROP_IN_A1</option>
                </select>
              </label>
              <label style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: 12, color: '#64748b' }}>Status</span>
                <select value={detailActive ? 'active' : 'inactive'} onChange={(e) => setDetailActive(e.target.value === 'active')} style={field}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>
              <label style={{ display: 'grid', gap: 4 }}><span style={{ fontSize: 12, color: '#64748b' }}>Initial ELO Singles</span><input type="number" min={0} value={detailEloSingles} onChange={(e) => setDetailEloSingles(e.target.value)} style={field} /></label>
              <label style={{ display: 'grid', gap: 4 }}><span style={{ fontSize: 12, color: '#64748b' }}>Initial ELO Doubles</span><input type="number" min={0} value={detailEloDoubles} onChange={(e) => setDetailEloDoubles(e.target.value)} style={field} /></label>
              <label style={{ display: 'grid', gap: 4 }}><span style={{ fontSize: 12, color: '#64748b' }}>Initial ELO Mixed Doubles</span><input type="number" min={0} value={detailEloMixed} onChange={(e) => setDetailEloMixed(e.target.value)} style={field} /></label>
            </div>
            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 10, display: 'grid', gap: 8 }}>
              <div style={{ fontWeight: 700, color: '#0f172a' }}>Change Password</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <label style={{ display: 'grid', gap: 4 }}><span style={{ fontSize: 12, color: '#64748b' }}>New Password</span><input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} style={field} /></label>
                <label style={{ display: 'grid', gap: 4 }}><span style={{ fontSize: 12, color: '#64748b' }}>Confirm Password</span><input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} style={field} /></label>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button style={outlineBtn} onClick={() => setShowUserDetailModal(false)}>Close</button>
              <button
                style={outlineBtn}
                disabled={!selectedUserId || !newPassword || !confirmPassword || detailLoading}
                onClick={async () => {
                  if (!selectedUserId) return;
                  try {
                    setDetailError(null);
                    if (newPassword.length < 8) {
                      setDetailError('Password must be at least 8 characters.');
                      return;
                    }
                    if (newPassword !== confirmPassword) {
                      setDetailError('New password and confirm password must match.');
                      return;
                    }
                    await onResetClubUserPassword(selectedUserId, newPassword, confirmPassword);
                    setPasswordResetNotice({ email: detailEmail.trim(), password: newPassword });
                    setNewPassword('');
                    setConfirmPassword('');
                    setShowUserDetailModal(false);
                  } catch (e) {
                    setDetailError(getMessage(e, 'Failed to change password.'));
                  }
                }}
              >
                Change Password
              </button>
              {isGlobalAdmin ? (
                <button
                  style={outlineBtn}
                  disabled={!selectedUserId || detailLoading}
                  onClick={async () => {
                    if (!selectedUserId) return;
                    const tempPassword = generateTempPassword();
                    try {
                      setDetailError(null);
                      await onResetClubUserPassword(selectedUserId, tempPassword, tempPassword);
                      setPasswordResetNotice({ email: detailEmail.trim(), password: tempPassword });
                      setShowUserDetailModal(false);
                    } catch (e) {
                      setDetailError(getMessage(e, 'Failed to reset password.'));
                    }
                  }}
                >
                  Reset to Default
                </button>
              ) : null}
              <button
                style={primaryBtn}
                disabled={!selectedUserId || !detailName.trim() || !detailEmail.trim() || detailLoading}
                onClick={async () => {
                  if (!selectedUserId) return;
                  try {
                    setDetailError(null);
                    const wantsPasswordUpdate = Boolean(newPassword || confirmPassword);
                    if (wantsPasswordUpdate) {
                      if (newPassword.length < 8) {
                        setDetailError('Password must be at least 8 characters.');
                        return;
                      }
                      if (newPassword !== confirmPassword) {
                        setDetailError('New password and confirm password must match.');
                        return;
                      }
                    }
                    await onSaveClubUser(selectedUserId, {
                      full_name: detailName.trim(),
                      email: detailEmail.trim(),
                      phone: detailPhone.trim() || undefined,
                      sex: detailSex,
                      player_type: detailPlayerType,
                      elo_initial_singles: Number(detailEloSingles) || 0,
                      elo_initial_doubles: Number(detailEloDoubles) || 0,
                      elo_initial_mixed: Number(detailEloMixed) || 0,
                      is_active: detailActive,
                    });

                    if (wantsPasswordUpdate) {
                      await onResetClubUserPassword(selectedUserId, newPassword, confirmPassword);
                      setPasswordResetNotice({ email: detailEmail.trim(), password: newPassword });
                    }

                    setNewPassword('');
                    setConfirmPassword('');
                    setShowUserDetailModal(false);
                  } catch (e) {
                    setDetailError(getMessage(e, 'Failed to save user.'));
                  }
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PlayersPanel(props: {
  players: Player[];
  clubUsers: ClubUser[];
  newPlayerName: string;
  setNewPlayerName: (v: string) => void;
  newPlayerEmail: string;
  setNewPlayerEmail: (v: string) => void;
  newPlayerPhone: string;
  setNewPlayerPhone: (v: string) => void;
  newPlayerAddress: string;
  setNewPlayerAddress: (v: string) => void;
  newPlayerSex: 'M' | 'F';
  setNewPlayerSex: (v: 'M' | 'F') => void;
  newPlayerEloSingles: string;
  setNewPlayerEloSingles: (v: string) => void;
  newPlayerEloDoubles: string;
  setNewPlayerEloDoubles: (v: string) => void;
  newPlayerEloMixed: string;
  setNewPlayerEloMixed: (v: string) => void;
  newPlayerShowOnLeaderboard: boolean;
  setNewPlayerShowOnLeaderboard: (v: boolean) => void;
  showAddPlayerModal: boolean;
  setShowAddPlayerModal: (v: boolean) => void;
  newPlayerType: 'ROSTER' | 'DROP_IN' | 'DROP_IN_A1';
  setNewPlayerType: (v: 'ROSTER' | 'DROP_IN' | 'DROP_IN_A1') => void;
  lastPlayerInvite: null | { email: string; temporary_password?: string | null; invite_link: string; status: string };
  setLastPlayerInvite: (v: null | { email: string; temporary_password?: string | null; invite_link: string; status: string }) => void;
  onCreate: () => Promise<void>;
  onUpsertExisting: (playerId: number) => Promise<void>;
  onInviteFromPlayer: (p: Player) => Promise<void>;
  onToggle: (p: Player) => Promise<void>;
  onDelete: (p: Player) => Promise<void>;
}) {
  const {
    players,
    clubUsers,
    newPlayerName,
    setNewPlayerName,
    newPlayerEmail,
    setNewPlayerEmail,
    newPlayerPhone,
    setNewPlayerPhone,
    newPlayerAddress,
    setNewPlayerAddress,
    newPlayerSex,
    setNewPlayerSex,
    newPlayerEloSingles,
    setNewPlayerEloSingles,
    newPlayerEloDoubles,
    setNewPlayerEloDoubles,
    newPlayerEloMixed,
    setNewPlayerEloMixed,
    newPlayerShowOnLeaderboard,
    setNewPlayerShowOnLeaderboard,
    showAddPlayerModal,
    setShowAddPlayerModal,
    newPlayerType,
    setNewPlayerType,
    lastPlayerInvite,
    setLastPlayerInvite,
    onCreate,
    onUpsertExisting,
    onInviteFromPlayer,
    onToggle,
    onDelete,
  } = props;
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const emailValue = newPlayerEmail.trim();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const hasInvalidEmail = emailValue.length > 0 && !emailPattern.test(emailValue);

  const closeOnboardingModal = () => {
    setEditingPlayer(null);
    setShowAddPlayerModal(false);
  };

  const openOnboardingForExistingPlayer = (p: Player) => {
    setNewPlayerName(p.display_name || '');
    setNewPlayerEmail(p.email || '');
    setNewPlayerPhone(p.phone || '');
    setNewPlayerAddress('');
    setNewPlayerSex((p.sex === 'F' ? 'F' : 'M'));
    setNewPlayerType((p.player_type as 'ROSTER' | 'DROP_IN' | 'DROP_IN_A1') || 'ROSTER');
    setNewPlayerEloSingles(String(p.elo_initial_singles ?? 1000));
    setNewPlayerEloDoubles(String(p.elo_initial_doubles ?? 1000));
    setNewPlayerEloMixed(String(p.elo_initial_mixed ?? 1000));
    setNewPlayerShowOnLeaderboard(p.show_on_leaderboard ?? true);
    setEditingPlayer(p);
    setShowAddPlayerModal(true);
  };

  const iconActionBtn: React.CSSProperties = {
    ...outlineBtn,
    width: 40,
    minWidth: 40,
    padding: '8px 0',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 16,
    lineHeight: 1,
  };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <AdminCard title="Player Onboarding" action={<button style={primaryBtn} onClick={() => setShowAddPlayerModal(true)}>Add Player</button>}>
        <div style={{ color: '#64748b', fontSize: 13 }}>Use "Add Player" to open the full onboarding form.</div>
      </AdminCard>
      {showAddPlayerModal ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.35)', display: 'grid', placeItems: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ width: 'min(860px, 100%)', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, boxShadow: '0 20px 60px rgba(2,6,23,.25)', padding: 16, display: 'grid', gap: 12 }}>
            <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 18 }}>
              {editingPlayer ? `Update Player: ${editingPlayer.display_name}` : 'Add Player'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <label style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>Player Name</label>
                <input value={newPlayerName} onChange={(e) => setNewPlayerName(e.target.value)} placeholder="Player name" style={field} />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <label style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>Email</label>
                <input
                  value={newPlayerEmail}
                  onChange={(e) => setNewPlayerEmail(e.target.value)}
                  placeholder="email@example.com"
                  style={{ ...field, borderColor: hasInvalidEmail ? '#dc2626' : field.borderColor }}
                />
                {hasInvalidEmail ? (
                  <div style={{ fontSize: 12, color: '#dc2626' }}>Please enter a valid email address.</div>
                ) : null}
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <label style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>Phone Number</label>
                <input value={newPlayerPhone} onChange={(e) => setNewPlayerPhone(e.target.value)} placeholder="+1 (555) 555-5555" style={field} />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <label style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>Address</label>
                <input value={newPlayerAddress} onChange={(e) => setNewPlayerAddress(e.target.value)} placeholder="Address" style={field} />
                <div style={{ fontSize: 11, color: '#64748b' }}>Address capture only (not persisted in API yet).</div>
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <label style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>Sex</label>
                <select value={newPlayerSex} onChange={(e) => setNewPlayerSex(e.target.value as 'M' | 'F')} style={field}>
                  <option value="M">M</option>
                  <option value="F">F</option>
                </select>
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <label style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>Player Type</label>
                <select value={newPlayerType} onChange={(e) => setNewPlayerType(e.target.value as 'ROSTER' | 'DROP_IN' | 'DROP_IN_A1')} style={field}>
                  <option value="ROSTER">ROSTER</option>
                  <option value="DROP_IN">DROP_IN</option>
                </select>
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <label style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>Initial ELO Singles</label>
                <input type="number" min={0} value={newPlayerEloSingles} onChange={(e) => setNewPlayerEloSingles(e.target.value)} style={field} />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <label style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>Initial ELO Doubles</label>
                <input type="number" min={0} value={newPlayerEloDoubles} onChange={(e) => setNewPlayerEloDoubles(e.target.value)} style={field} />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <label style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>Initial ELO Mixed Doubles</label>
                <input type="number" min={0} value={newPlayerEloMixed} onChange={(e) => setNewPlayerEloMixed(e.target.value)} style={field} />
              </div>
              <div style={{ display: 'grid', gap: 6, alignContent: 'end' }}>
                <label style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>Visible on leaderboard</label>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#334155' }}>
                  <input type="checkbox" checked={newPlayerShowOnLeaderboard} onChange={(e) => setNewPlayerShowOnLeaderboard(e.target.checked)} />
                  Visible on leaderboard
                </label>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button style={outlineBtn} onClick={closeOnboardingModal}>Cancel</button>
              <button
                style={primaryBtn}
                onClick={() => void (editingPlayer ? onUpsertExisting(editingPlayer.id) : onCreate())}
                disabled={!newPlayerName.trim() || hasInvalidEmail}
              >
                {editingPlayer ? 'Update' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <AdminCard title="Club Players">
        {lastPlayerInvite ? (
          <div style={{ ...adminAlertSuccess, marginBottom: 10 }}>
            Invite ready for <strong>{lastPlayerInvite.email}</strong>.
            {lastPlayerInvite.temporary_password ? (
              <> Temporary password: <code>{lastPlayerInvite.temporary_password}</code></>
            ) : (
              <> Existing user linked to this club.</>
            )}
            <div style={{ marginTop: 6, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <a href={lastPlayerInvite.invite_link} target="_blank" rel="noreferrer" style={{ color: '#0d9488', fontWeight: 700 }}>
                Open invite link
              </a>
              <button
                style={outlineBtn}
                onClick={() => void navigator.clipboard?.writeText(lastPlayerInvite.invite_link)}
              >
                Copy Invite Link
              </button>
              <button style={outlineBtn} onClick={() => setLastPlayerInvite(null)}>Dismiss</button>
            </div>
          </div>
        ) : null}
        <AdminTable
          columns={['Player Name', 'ID', 'Email', 'Type', 'Status', 'Actions']}
          rows={players.map((p) => [
            p.display_name,
            p.id,
            p.email || '-',
            p.player_type || '-',
            p.is_active ? 'Active' : 'Inactive',
            <div key={`actions-${p.id}`} style={{ display: 'flex', gap: 8 }}>
              <button
                style={outlineBtn}
                disabled={clubUsers.some((u) => u.email.toLowerCase() === (p.email || '').toLowerCase())}
                onClick={() => {
                  if (!p.email) {
                    openOnboardingForExistingPlayer(p);
                    return;
                  }
                  void onInviteFromPlayer(p);
                }}
              >
                {!p.email ? 'Email Required' : clubUsers.some((u) => u.email.toLowerCase() === (p.email || '').toLowerCase()) ? 'User Linked' : 'Create/Link User'}
              </button>
              <button
                style={iconActionBtn}
                title={`Edit ${p.display_name}`}
                aria-label={`Edit ${p.display_name}`}
                onClick={() => openOnboardingForExistingPlayer(p)}
              >
                ✎
              </button>
              <button style={outlineBtn} onClick={() => void onToggle(p)}>{p.is_active ? 'Deactivate' : 'Activate'}</button>
              <button
                style={iconActionBtn}
                title={`Delete ${p.display_name}`}
                aria-label={`Delete ${p.display_name}`}
                onClick={() => { if (window.confirm(`Delete ${p.display_name}?`)) void onDelete(p); }}
              >
                🗑
              </button>
            </div>,
          ])}
        />
      </AdminCard>
    </div>
  );
}

function CourtsPanel(props: {
  courts: Court[];
  newCourtName: string;
  setNewCourtName: (v: string) => void;
  onCreate: () => Promise<void>;
  onToggle: (c: Court) => Promise<void>;
  onDelete: (c: Court) => Promise<void>;
}) {
  const { courts, newCourtName, setNewCourtName, onCreate, onToggle, onDelete } = props;
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <AdminCard title="Add Court">
        <div style={{ display: 'grid', gridTemplateColumns: '2fr auto', gap: 8 }}>
          <input value={newCourtName} onChange={(e) => setNewCourtName(e.target.value)} placeholder="Court name" style={field} />
          <button style={primaryBtn} onClick={() => void onCreate()} disabled={!newCourtName.trim()}>Create Court</button>
        </div>
      </AdminCard>
      <AdminCard title="Courts">
        <AdminTable
          columns={['Court', 'Status', 'Created', 'Actions']}
          rows={courts.map((c) => [
            c.name,
            c.is_active ? 'Active' : 'Inactive',
            fmtDateTime(c.created_at),
            <div key={`court-${c.id}`} style={{ display: 'flex', gap: 8 }}>
              <button style={outlineBtn} onClick={() => void onToggle(c)}>{c.is_active ? 'Deactivate' : 'Activate'}</button>
              <button style={outlineBtn} onClick={() => { if (window.confirm(`Delete ${c.name}?`)) void onDelete(c); }}>Delete</button>
            </div>,
          ])}
        />
      </AdminCard>
    </div>
  );
}

function SeasonsPanel(props: {
  seasons: Season[];
  sessions: Session[];
  games: Game[];
  players: Player[];
  newSeasonName: string;
  setNewSeasonName: (v: string) => void;
  newSeasonFormat: 'SINGLES' | 'DOUBLES' | 'MIXED_DOUBLES';
  setNewSeasonFormat: (v: 'SINGLES' | 'DOUBLES' | 'MIXED_DOUBLES') => void;
  onCreate: () => Promise<void>;
  onToggle: (s: Season) => Promise<void>;
  onDelete: (s: Season) => Promise<void>;
}) {
  const {
    seasons, sessions, games, players, newSeasonName, setNewSeasonName, newSeasonFormat, setNewSeasonFormat, onCreate, onToggle, onDelete,
  } = props;
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <AdminCard title="Create Season">
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: 8 }}>
          <input value={newSeasonName} onChange={(e) => setNewSeasonName(e.target.value)} placeholder="Season name" style={field} />
          <select value={newSeasonFormat} onChange={(e) => setNewSeasonFormat(e.target.value as 'SINGLES' | 'DOUBLES' | 'MIXED_DOUBLES')} style={field}>
            <option value="DOUBLES">DOUBLES</option>
            <option value="SINGLES">SINGLES</option>
            <option value="MIXED_DOUBLES">MIXED_DOUBLES</option>
          </select>
          <button style={primaryBtn} onClick={() => void onCreate()} disabled={!newSeasonName.trim()}>Create</button>
        </div>
      </AdminCard>
      <AdminCard title="Seasons">
        <AdminTable
          columns={['Season Name', 'Start Date', 'End Date', '# Players', 'Status', '# Sessions', '# Games', 'Actions']}
          rows={seasons.map((s) => {
            const seasonSessions = sessions.filter((x) => x.season_id === s.id).sort((a, b) => a.session_date.localeCompare(b.session_date));
            const seasonSessionIds = new Set(seasonSessions.map((x) => x.id));
            const seasonGamesCount = games.filter((g) => seasonSessionIds.has(g.session_id)).length;
            const canDeleteSeason = seasonSessions.length === 0 && seasonGamesCount === 0;
            const startDate = seasonSessions[0]?.session_date ?? '-';
            const endDate = seasonSessions[seasonSessions.length - 1]?.session_date ?? '-';
            return [
              <Link key={`season-${s.id}`} href={`/admin/seasons/${s.id}`} style={{ color: '#0d9488', textDecoration: 'none', fontWeight: 700 }}>{s.name}</Link>,
              fmtDate(startDate),
              fmtDate(endDate),
              players.length,
              s.is_active ? 'Active' : 'Closed',
              seasonSessions.length,
              seasonGamesCount,
              <div key="actions" style={{ display: 'flex', gap: 8 }}>
                <button style={outlineBtn} onClick={() => void onToggle(s)}>{s.is_active ? 'Deactivate' : 'Activate'}</button>
                <button
                  style={outlineBtn}
                  onClick={() => { if (window.confirm(`Delete ${s.name}?`)) void onDelete(s); }}
                  disabled={!canDeleteSeason}
                  title={canDeleteSeason ? 'Delete season' : 'Can delete only when season has no sessions and no games'}
                >
                  Delete
                </button>
              </div>,
            ];
          })}
        />
      </AdminCard>
    </div>
  );
}

function SeasonDetailPanel(props: {
  season: Season | null;
  sessions: Session[];
  players: Player[];
  onSessionCreate: () => Promise<void>;
  newSessionDate: string;
  setNewSessionDate: (v: string) => void;
  newSessionStartTime: string;
  setNewSessionStartTime: (v: string) => void;
  newSessionStatus: 'UPCOMING' | 'OPEN' | 'CANCELLED';
  setNewSessionStatus: (v: 'UPCOMING' | 'OPEN' | 'CANCELLED') => void;
  newSessionName: string;
  setNewSessionName: (v: string) => void;
  newSessionLocation: string;
  setNewSessionLocation: (v: string) => void;
  loading: boolean;
  leaderboardRows: LeaderboardEntry[];
  leaderboardSession: Session | null;
  onRenameSeason: (newName: string) => Promise<void>;
  onRenameSession: (sessionId: number, newName: string) => Promise<void>;
}) {
  const {
    season,
    sessions,
    players,
    onSessionCreate,
    newSessionDate,
    setNewSessionDate,
    newSessionStartTime,
    setNewSessionStartTime,
    newSessionStatus,
    setNewSessionStatus,
    newSessionName,
    setNewSessionName,
    newSessionLocation,
    setNewSessionLocation,
    loading,
    leaderboardRows,
    leaderboardSession,
    onRenameSeason,
    onRenameSession,
  } = props;
  const [showCreateSessionModal, setShowCreateSessionModal] = useState(false);
  const [newSessionEndTime, setNewSessionEndTime] = useState(() => defaultSessionTimes().endTimeHHMM);
  const [renamingSeasonName, setRenamingSeasonName] = useState(false);
  const [renameSeasonNameValue, setRenameSeasonNameValue] = useState('');
  const [renamingSessionId, setRenamingSessionId] = useState<number | null>(null);
  const [renameSessionValue, setRenameSessionValue] = useState('');
  const openCreateSessionModal = () => {
    const defaults = defaultSessionTimes();
    setNewSessionDate(defaults.date);
    setNewSessionStartTime(defaults.startTimeHHMMSS);
    setNewSessionEndTime(defaults.endTimeHHMM);
    setShowCreateSessionModal(true);
  };
  if (!season) return <AdminEmptyState title="Season not found" description="Select a valid season from the Seasons page." />;
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <AdminCard title="Season Info">
        <div style={{ display: 'grid', gap: 10 }}>
          {renamingSeasonName ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                autoFocus
                value={renameSeasonNameValue}
                onChange={(e) => setRenameSeasonNameValue(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter' && renameSeasonNameValue.trim()) {
                    await onRenameSeason(renameSeasonNameValue.trim());
                    setRenamingSeasonName(false);
                  }
                  if (e.key === 'Escape') setRenamingSeasonName(false);
                }}
                style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', border: '1.5px solid #0d9488', borderRadius: 6, padding: '4px 8px', minWidth: 220 }}
              />
              <button
                style={{ ...primaryBtn, padding: '4px 14px', fontSize: 13 }}
                onClick={async () => {
                  if (!renameSeasonNameValue.trim()) return;
                  await onRenameSeason(renameSeasonNameValue.trim());
                  setRenamingSeasonName(false);
                }}
              >Save</button>
              <button style={{ ...outlineBtn, padding: '4px 10px', fontSize: 13 }} onClick={() => setRenamingSeasonName(false)}>Cancel</button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{season.name}</span>
              <button
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', color: '#64748b', fontSize: 13, borderRadius: 4 }}
                title="Rename season"
                onClick={() => { setRenameSeasonNameValue(season.name); setRenamingSeasonName(true); }}
              >✏ Rename</button>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,minmax(0,1fr))', gap: 10 }}>
            <Info label="Format" value={season.format} />
            <Info label="Timezone" value={season.timezone} />
            <Info label="Status" value={season.is_active ? 'Active' : 'Closed'} />
          </div>
        </div>
      </AdminCard>

      <AdminCard title="Sessions in Season" action={<button style={primaryBtn} onClick={openCreateSessionModal}>Add Session</button>}>
        <AdminTable
          columns={['Session Name', 'Session Date', 'Start Time', 'Status', 'Matches', 'Players']}
          rows={sessions.map((s) => [
            renamingSessionId === s.id ? (
              <span key={`sess-rename-${s.id}`} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  autoFocus
                  value={renameSessionValue}
                  onChange={(e) => setRenameSessionValue(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter' && renameSessionValue.trim()) {
                      await onRenameSession(s.id, renameSessionValue.trim());
                      setRenamingSessionId(null);
                    }
                    if (e.key === 'Escape') setRenamingSessionId(null);
                  }}
                  style={{ fontSize: 13, border: '1.5px solid #0d9488', borderRadius: 5, padding: '2px 7px', minWidth: 130 }}
                />
                <button style={{ ...primaryBtn, padding: '2px 10px', fontSize: 12 }} onClick={async () => {
                  if (!renameSessionValue.trim()) return;
                  await onRenameSession(s.id, renameSessionValue.trim());
                  setRenamingSessionId(null);
                }}>✓</button>
                <button style={{ ...outlineBtn, padding: '2px 8px', fontSize: 12 }} onClick={() => setRenamingSessionId(null)}>✗</button>
              </span>
            ) : (
              <span key={`sess-link-${s.id}`} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <Link href={`/admin/sessions/${s.id}`} style={{ color: '#0d9488', textDecoration: 'none', fontWeight: 700 }}>{s.location || `Session ${s.id}`}</Link>
                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 12, padding: '1px 4px' }} title="Rename" onClick={() => { setRenameSessionValue(s.location || ''); setRenamingSessionId(s.id); }}>✏</button>
              </span>
            ),
            fmtDate(s.session_date),
            s.start_time_local,
            s.status,
            '-', // match count can be derived later from games
            '-', // session player count can be derived later from participants
          ])}
        />
      </AdminCard>
      {showCreateSessionModal ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.35)', display: 'grid', placeItems: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ width: 'min(760px, 100%)', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, boxShadow: '0 20px 60px rgba(2,6,23,.25)', padding: 16, display: 'grid', gap: 12 }}>
            <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 18 }}>Add Session</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <label style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>Session Name</label>
                <input value={newSessionName} onChange={(e) => setNewSessionName(e.target.value)} placeholder="Session Name" style={field} />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <label style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>Session Date</label>
                <input type="date" value={newSessionDate} onChange={(e) => setNewSessionDate(e.target.value)} style={field} />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <label style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>Start Time</label>
                <input type="time" step={300} value={newSessionStartTime.slice(0, 5)} onChange={(e) => setNewSessionStartTime(`${e.target.value}:00`)} style={field} />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <label style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>End Time</label>
                <input type="time" step={300} value={newSessionEndTime} onChange={(e) => setNewSessionEndTime(e.target.value)} style={field} />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <label style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>Location</label>
                <input value={newSessionLocation} onChange={(e) => setNewSessionLocation(e.target.value)} placeholder="Main Hall" style={field} />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <label style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>Status</label>
                <select value={newSessionStatus} onChange={(e) => setNewSessionStatus(e.target.value as 'UPCOMING' | 'OPEN' | 'CANCELLED')} style={field}>
                  <option value="UPCOMING">UPCOMING</option>
                  <option value="OPEN">OPEN</option>
                  <option value="CANCELLED">CANCELLED</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button style={outlineBtn} onClick={() => setShowCreateSessionModal(false)} disabled={loading}>Cancel</button>
              <button
                style={primaryBtn}
                disabled={loading || !newSessionName.trim() || !newSessionDate}
                onClick={async () => {
                  try {
                    await onSessionCreate();
                    setShowCreateSessionModal(false);
                  } catch {
                    // parent handler surfaces error banner
                  }
                }}
              >
                {loading ? 'Creating...' : 'Create Session'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <AdminCard title="Players in Season" action={<Link href="/admin/players" style={{ ...outlineBtn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>Manage Club Players</Link>}>
        <AdminTable
          columns={['Player Name', 'ID', 'Matches Played', 'Player Status', 'ELO Score']}
          rows={players.map((p) => [p.display_name, p.id, '-', p.player_type || '-', '-'])}
        />
      </AdminCard>

      <AdminCard title="Season Leaderboard">
        {leaderboardSession ? (
          <div style={{ marginBottom: 10, color: '#475569', fontSize: 13 }}>
            Source session: <strong>{leaderboardSession.location || `Session ${leaderboardSession.id}`}</strong> ({fmtDate(leaderboardSession.session_date)} · {leaderboardSession.status})
          </div>
        ) : null}
        {leaderboardRows.length ? (
          <AdminTable
            columns={['#', 'Player', 'Delta', 'Played', 'Won', 'Points', 'Global ELO']}
            rows={leaderboardRows.map((row, i) => [
              i + 1,
              row.display_name,
              row.season_elo_delta > 0 ? `+${row.season_elo_delta}` : String(row.season_elo_delta),
              row.matches_played ?? 0,
              row.matches_won,
              row.total_points,
              row.global_elo_score ?? 1000,
            ])}
          />
        ) : (
          <AdminEmptyState title="No leaderboard data yet" description="Finalize at least one session in this season to populate leaderboard rankings." />
        )}
      </AdminCard>
    </div>
  );
}

function SessionsPanel(props: {
  sessions: Session[];
  seasons: Season[];
  games: Game[];
  participantsByGame: Record<number, GameParticipant[]>;
  selectedSeasonId: number | null;
  setSelectedSeasonId: (v: number | null) => void;
  newSessionSeasonId: number | null;
  setNewSessionSeasonId: (v: number | null) => void;
  newSessionDate: string;
  setNewSessionDate: (v: string) => void;
  newSessionStartTime: string;
  setNewSessionStartTime: (v: string) => void;
  newSessionStatus: 'UPCOMING' | 'OPEN' | 'CANCELLED';
  setNewSessionStatus: (v: 'UPCOMING' | 'OPEN' | 'CANCELLED') => void;
  newSessionName: string;
  setNewSessionName: (v: string) => void;
  onCreate: () => Promise<void>;
  onDeleteSession: (sessionId: number) => Promise<void>;
  onRenameSession: (sessionId: number, newName: string) => Promise<void>;
}) {
  const {
    sessions,
    seasons,
    games,
    participantsByGame,
    selectedSeasonId,
    setSelectedSeasonId,
    newSessionSeasonId,
    setNewSessionSeasonId,
    newSessionDate,
    setNewSessionDate,
    newSessionStartTime,
    setNewSessionStartTime,
    newSessionStatus,
    setNewSessionStatus,
    newSessionName,
    setNewSessionName,
    onCreate,
    onDeleteSession,
    onRenameSession,
  } = props;
  const [renamingSessionId, setRenamingSessionId] = useState<number | null>(null);
  const [renameSessionValue, setRenameSessionValue] = useState('');
  const seasonById = new Map(seasons.map((s) => [s.id, s]));
  const [showCreateSessionModal, setShowCreateSessionModal] = useState(false);
  const [newSessionEndTime, setNewSessionEndTime] = useState(() => defaultSessionTimes().endTimeHHMM);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Session | null>(null);
  const openCreateSessionModal = () => {
    const defaults = defaultSessionTimes();
    setNewSessionDate(defaults.date);
    setNewSessionStartTime(defaults.startTimeHHMMSS);
    setNewSessionEndTime(defaults.endTimeHHMM);
    setPanelError(null);
    setShowCreateSessionModal(true);
  };
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {panelError ? <div style={adminAlertError}>{panelError}</div> : null}
      <AdminCard title="Add New Session" action={<button style={primaryBtn} onClick={openCreateSessionModal}>Create</button>}>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ color: '#64748b', fontSize: 13 }}>Use Create to open session setup.</div>
          <div style={{ display: 'grid', gap: 6, maxWidth: 320 }}>
            <label style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>Season Filter</label>
            <select
              value={selectedSeasonId ?? ''}
              onChange={(e) => setSelectedSeasonId(e.target.value ? Number(e.target.value) : null)}
              style={field}
            >
              <option value="">All Seasons</option>
              {seasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
      </AdminCard>
      {showCreateSessionModal ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.35)', display: 'grid', placeItems: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ width: 'min(760px, 100%)', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, boxShadow: '0 20px 60px rgba(2,6,23,.25)', padding: 16, display: 'grid', gap: 12 }}>
            <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 18 }}>Create Session</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <label style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>Season</label>
                <select value={newSessionSeasonId ?? ''} onChange={(e) => setNewSessionSeasonId(e.target.value ? Number(e.target.value) : null)} style={field}>
                  <option value="">Select season</option>
                  {seasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <label style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>Session Name</label>
                <input value={newSessionName} onChange={(e) => setNewSessionName(e.target.value)} placeholder="Session Name" style={field} />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <label style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>Session Date</label>
                <input type="date" value={newSessionDate} onChange={(e) => setNewSessionDate(e.target.value)} style={field} />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <label style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>Status</label>
                <select value={newSessionStatus} onChange={(e) => setNewSessionStatus(e.target.value as 'UPCOMING' | 'OPEN' | 'CANCELLED')} style={field}>
                  <option value="UPCOMING">UPCOMING</option>
                  <option value="OPEN">OPEN</option>
                  <option value="CANCELLED">CANCELLED</option>
                </select>
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <label style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>Start Time</label>
                <input type="time" step={300} value={newSessionStartTime.slice(0,5)} onChange={(e) => setNewSessionStartTime(`${e.target.value}:00`)} style={field} />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <label style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>End Time</label>
                <input type="time" step={300} value={newSessionEndTime} onChange={(e) => setNewSessionEndTime(e.target.value)} style={field} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button style={outlineBtn} onClick={() => setShowCreateSessionModal(false)}>Cancel</button>
              <button
                style={primaryBtn}
                onClick={async () => {
                  if (!newSessionSeasonId) {
                    setPanelError('Select a season before creating a session.');
                    return;
                  }
                  if (!newSessionName.trim()) {
                    setPanelError('Enter a session name.');
                    return;
                  }
                  if (!newSessionDate) {
                    setPanelError('Select a session date.');
                    return;
                  }
                  setPanelError(null);
                  try {
                    await onCreate();
                    setShowCreateSessionModal(false);
                  } catch (e) {
                    setPanelError(getMessage(e, 'Failed to create session.'));
                  }
                }}
                disabled={!newSessionSeasonId || !newSessionName.trim() || !newSessionDate}
              >
                Create Session
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {deleteTarget ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.35)', display: 'grid', placeItems: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ width: 'min(520px, 100%)', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, boxShadow: '0 20px 60px rgba(2,6,23,.25)', padding: 16, display: 'grid', gap: 12 }}>
            <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 20 }}>Delete Session</div>
            <div style={{ color: '#475569' }}>
              Delete <strong>{deleteTarget.location || `Session ${deleteTarget.id}`}</strong>? This action permanently removes the session.
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button style={outlineBtn} onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button
                style={{ ...primaryBtn, background: '#dc2626' }}
                onClick={async () => {
                  try {
                    await onDeleteSession(deleteTarget.id);
                    setDeleteTarget(null);
                    setPanelError(null);
                  } catch (e) {
                    setPanelError(getMessage(e, 'Unable to delete session.'));
                  }
                }}
              >
                Delete Session
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <AdminCard title="Club Sessions">
        <AdminTable
          columns={['Session Name', 'Session Date', 'Start Time', 'Session Status', 'Matches', 'Players', 'Actions']}
          rows={sessions
            .slice()
            .sort((a, b) => b.session_date.localeCompare(a.session_date))
            .map((s) => {
              const season = seasonById.get(s.season_id);
              const sessionGames = games.filter((g) => g.session_id === s.id);
              const playerCount = countUniquePlayersInSessionGames(sessionGames, participantsByGame);
              return [
                renamingSessionId === s.id ? (
                  <span key={`sess-rename-sp-${s.id}`} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <input
                      autoFocus
                      value={renameSessionValue}
                      onChange={(e) => setRenameSessionValue(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === 'Enter' && renameSessionValue.trim()) {
                          await onRenameSession(s.id, renameSessionValue.trim());
                          setRenamingSessionId(null);
                        }
                        if (e.key === 'Escape') setRenamingSessionId(null);
                      }}
                      style={{ fontSize: 13, border: '1.5px solid #0d9488', borderRadius: 5, padding: '2px 7px', minWidth: 130 }}
                    />
                    <button style={{ ...primaryBtn, padding: '2px 10px', fontSize: 12 }} onClick={async () => {
                      if (!renameSessionValue.trim()) return;
                      await onRenameSession(s.id, renameSessionValue.trim());
                      setRenamingSessionId(null);
                    }}>✓</button>
                    <button style={{ ...outlineBtn, padding: '2px 8px', fontSize: 12 }} onClick={() => setRenamingSessionId(null)}>✗</button>
                  </span>
                ) : (
                  <span key={`sd-${s.id}`} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <Link href={`/admin/sessions/${s.id}`} style={{ color: '#0d9488', textDecoration: 'none', fontWeight: 700 }}>{s.location || `Session ${s.id}`}</Link>
                    <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: 12, padding: '1px 4px' }} title="Rename" onClick={() => { setRenameSessionValue(s.location || ''); setRenamingSessionId(s.id); }}>✏</button>
                  </span>
                ),
                fmtDate(s.session_date),
                s.start_time_local || '-',
                s.status,
                sessionGames.length,
                playerCount || '-',
                <button
                  key={`delete-${s.id}`}
                  style={outlineBtn}
                  onClick={() => {
                    if (sessionGames.length > 0) {
                      setPanelError('This session has recorded matches. Resolve matches before deleting the session.');
                      return;
                    }
                    setPanelError(null);
                    setDeleteTarget(s);
                  }}
                >
                  Delete
                </button>,
              ];
            })}
        />
      </AdminCard>
    </div>
  );
}

function SessionDetailPanel(props: {
  session: Session | null;
  season: Season | null;
  sessionMatches: Game[];
  participantsByGame: Record<number, GameParticipant[]>;
  players: Player[];
  courts: Court[];
  onAddMatch: (payload: AddMatchPayload) => Promise<void>;
  onClose: () => Promise<void>;
  onOpen: () => Promise<void>;
  onFinalize: () => Promise<void>;
  onRevert: () => Promise<void>;
  onDeleteMatch: (gameId: number) => Promise<void>;
  onEditMatch: (gameId: number, payload: AddMatchPayload) => Promise<void>;
  onStatusChange: (status: 'UPCOMING' | 'OPEN' | 'CLOSED' | 'CANCELLED') => Promise<void>;
  onUpdateSchedule: (sessionDate: string, startTimeHHmm: string) => Promise<void>;
}) {
  const {
    session,
    season,
    sessionMatches,
    participantsByGame,
    players,
    courts,
    onAddMatch,
    onClose,
    onOpen,
    onFinalize,
    onRevert,
    onDeleteMatch,
    onEditMatch,
    onStatusChange,
    onUpdateSchedule,
  } = props;
  type MatchSortKey = 'serial' | 'player1' | 'player2' | 'player3' | 'player4' | 'court' | 'startTime' | 'scoreA' | 'scoreB' | 'status';
  const [statusSaving, setStatusSaving] = useState(false);
  const [showAddMatchModal, setShowAddMatchModal] = useState(false);
  const [addMatchBusy, setAddMatchBusy] = useState(false);
  const [addMatchError, setAddMatchError] = useState<string | null>(null);
  const [deleteGameTarget, setDeleteGameTarget] = useState<Game | null>(null);
  const [deleteGameBusy, setDeleteGameBusy] = useState(false);
  const [deleteGameError, setDeleteGameError] = useState<string | null>(null);
  const [editGameTarget, setEditGameTarget] = useState<Game | null>(null);
  const [editMatchBusy, setEditMatchBusy] = useState(false);
  const [editMatchError, setEditMatchError] = useState<string | null>(null);
  const [editCourtId, setEditCourtId] = useState<number | null>(null);
  const [editStartTime, setEditStartTime] = useState('19:00');
  const [editScoreA, setEditScoreA] = useState(21);
  const [editScoreB, setEditScoreB] = useState(17);
  const [editA1, setEditA1] = useState<number>(players[0]?.id ?? 0);
  const [editA2, setEditA2] = useState<number>(players[1]?.id ?? 0);
  const [editB1, setEditB1] = useState<number>(players[2]?.id ?? 0);
  const [editB2, setEditB2] = useState<number>(players[3]?.id ?? 0);
  const [courtId, setCourtId] = useState<number | null>(null);
  const [startTime, setStartTime] = useState('19:00');
  const [scoreA, setScoreA] = useState(21);
  const [scoreB, setScoreB] = useState(17);
  const [a1, setA1] = useState<number>(players[0]?.id ?? 0);
  const [a2, setA2] = useState<number>(players[1]?.id ?? 0);
  const [b1, setB1] = useState<number>(players[2]?.id ?? 0);
  const [b2, setB2] = useState<number>(players[3]?.id ?? 0);
  const [confirmSoftDuplicate, setConfirmSoftDuplicate] = useState<null | {
    message: string;
    payload: AddMatchPayload;
  }>(null);
  const [matchSort, setMatchSort] = useState<{ key: MatchSortKey; direction: 'asc' | 'desc' }>({
    key: 'serial',
    direction: 'asc',
  });
  const courtById = new Map(courts.map((c) => [c.id, c.name]));
  const canManageMatches = session?.status === 'OPEN' || session?.status === 'CLOSED';
  const playerOptions = players.length ? players : [{ id: 0, display_name: 'No players', club_id: 0, is_active: false, created_at: '' }];
  const timeOptions = Array.from({ length: 24 * 12 }, (_, i) => {
    const hh = String(Math.floor(i / 12)).padStart(2, '0');
    const mm = String((i % 12) * 5).padStart(2, '0');
    return `${hh}:${mm}`;
  });
  const getHHmm = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const formatTimeLabel = (value: string) => {
    const [hh, mm] = value.split(':').map(Number);
    if (!Number.isInteger(hh) || !Number.isInteger(mm)) return value;
    const suffix = hh >= 12 ? 'PM' : 'AM';
    const hour12 = hh % 12 === 0 ? 12 : hh % 12;
    return `${hour12}:${String(mm).padStart(2, '0')} ${suffix}`;
  };
  const [editingSchedule, setEditingSchedule] = useState(false);
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [scheduleDate, setScheduleDate] = useState(() => session?.session_date ?? '');
  const [scheduleTime, setScheduleTime] = useState(() => (session?.start_time_local ? session.start_time_local.slice(0, 5) : '19:00'));

  useEffect(() => {
    if (!session) return;
    setEditingSchedule(false);
    setScheduleError(null);
    setScheduleDate(session.session_date);
    setScheduleTime(session.start_time_local ? session.start_time_local.slice(0, 5) : '19:00');
  }, [session?.id, session?.session_date, session?.start_time_local]);
  const isSoftDuplicate = (payload: AddMatchPayload): boolean => {
    if (!session) return false;
    const targetSessionId = session.id;
    const incomingPlayers = [...payload.sideAPlayerIds, ...payload.sideBPlayerIds].sort((x, y) => x - y).join(',');
    return sessionMatches.some((game) => {
      if (game.session_id !== targetSessionId) return false;
      const gamePlayers = (participantsByGame[game.id] ?? []).map((p) => p.player_id).sort((x, y) => x - y).join(',');
      const samePlayers = gamePlayers === incomingPlayers;
      const sameScore =
        (game.score_a === payload.scoreA && game.score_b === payload.scoreB) ||
        (game.score_a === payload.scoreB && game.score_b === payload.scoreA);
      return samePlayers && sameScore;
    });
  };

  const compareString = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  const compareNumber = (a: number, b: number) => a - b;
  const toggleMatchSort = (key: MatchSortKey) => {
    setMatchSort((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const matchRows = useMemo(() => {
    const mapped = sessionMatches.map((g, idx) => {
      const participants = participantsByGame[g.id] ?? [];
      const sideA = participants.filter((p) => p.side === 'A').map((p) => p.display_name);
      const sideB = participants.filter((p) => p.side === 'B').map((p) => p.display_name);
      const startTs = Date.parse(g.start_time);
      return {
        game: g,
        serial: idx + 1,
        player1: sideA[0] || '-',
        player2: sideA[1] || '-',
        player3: sideB[0] || '-',
        player4: sideB[1] || '-',
        court: courtById.get(g.court_id) || `Court ${g.court_id}`,
        startTimeLabel: fmtDateTime(g.start_time),
        startTimeTs: Number.isNaN(startTs) ? Number.NEGATIVE_INFINITY : startTs,
        scoreA: g.score_a,
        scoreB: g.score_b,
        status: 'Created',
      };
    });

    mapped.sort((a, b) => {
      let result = 0;
      switch (matchSort.key) {
        case 'serial':
          result = compareNumber(a.serial, b.serial);
          break;
        case 'player1':
          result = compareString(a.player1, b.player1);
          break;
        case 'player2':
          result = compareString(a.player2, b.player2);
          break;
        case 'player3':
          result = compareString(a.player3, b.player3);
          break;
        case 'player4':
          result = compareString(a.player4, b.player4);
          break;
        case 'court':
          result = compareString(a.court, b.court);
          break;
        case 'startTime':
          result = compareNumber(a.startTimeTs, b.startTimeTs);
          break;
        case 'scoreA':
          result = compareNumber(a.scoreA, b.scoreA);
          break;
        case 'scoreB':
          result = compareNumber(a.scoreB, b.scoreB);
          break;
        case 'status':
          result = compareString(a.status, b.status);
          break;
      }
      return matchSort.direction === 'asc' ? result : -result;
    });

    return mapped;
  }, [courtById, matchSort.direction, matchSort.key, participantsByGame, sessionMatches]);

  const sortArrow = (key: MatchSortKey) => {
    if (matchSort.key !== key) return '↕';
    return matchSort.direction === 'asc' ? '↑' : '↓';
  };
  const sortableHeader = (label: string, key: MatchSortKey) => (
    <button
      type="button"
      onClick={() => toggleMatchSort(key)}
      style={{ border: 0, background: 'transparent', padding: 0, fontWeight: 700, color: 'inherit', cursor: 'pointer' }}
      aria-label={`Sort by ${label}. Current order ${matchSort.key === key ? matchSort.direction : 'none'}.`}
      title={`Sort by ${label}`}
    >
      {label} {sortArrow(key)}
    </button>
  );

  useEffect(() => {
    setA1(players[0]?.id ?? 0);
    setA2(players[1]?.id ?? 0);
    setB1(players[2]?.id ?? 0);
    setB2(players[3]?.id ?? 0);
  }, [players]);

  useEffect(() => {
    setCourtId(courts[0]?.id ?? null);
  }, [courts]);

  useEffect(() => {
    if (!session) return;
    const normalized = floorToFiveMinuteIncrement((session.start_time_local || '19:00:00').slice(0, 5));
    setStartTime(normalized);
  }, [session?.id, session?.start_time_local]);

  if (!session) return <AdminEmptyState title="Session not found" description="Select a valid session from the Sessions page." />;

  async function submitAddMatch(payload: AddMatchPayload) {
    try {
      setAddMatchBusy(true);
      setAddMatchError(null);
      await onAddMatch(payload);
      setShowAddMatchModal(false);
      setConfirmSoftDuplicate(null);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'GAME_CONFLICT') {
        const [hoursRaw, minutesRaw] = floorToFiveMinuteIncrement(startTime).split(':');
        const hours = Number(hoursRaw);
        const minutes = Number(minutesRaw);
        if (Number.isInteger(hours) && Number.isInteger(minutes)) {
          const next = new Date(0, 0, 1, hours, minutes + 5, 0, 0);
          setStartTime(`${String(next.getHours()).padStart(2, '0')}:${String(next.getMinutes()).padStart(2, '0')}`);
        }
        setAddMatchError('A game already exists for this court and start time. Time moved to the next 5-minute slot.');
      } else if (e instanceof ApiError && e.code === 'INVALID_GAME_TIME') {
        setAddMatchError('Start time must be on a 5-minute boundary. Try 7:00, 7:05, 7:10.');
      } else if (e instanceof ApiError && e.code === 'SESSION_IMMUTABLE') {
        setAddMatchError('Session is not writable anymore.');
      } else {
        setAddMatchError(e instanceof Error ? e.message : 'Failed to add match.');
      }
    } finally {
      setAddMatchBusy(false);
    }
  }

  function openEditModal(game: Game) {
    const participants = participantsByGame[game.id] ?? [];
    const sideA = participants.filter((p) => p.side === 'A').map((p) => p.player_id);
    const sideB = participants.filter((p) => p.side === 'B').map((p) => p.player_id);
    const gameHhmm = getHHmm(game.start_time) ?? floorToFiveMinuteIncrement((session?.start_time_local || '19:00:00').slice(0, 5));

    setEditGameTarget(game);
    setEditMatchError(null);
    setEditCourtId(game.court_id);
    setEditStartTime(gameHhmm);
    setEditScoreA(game.score_a);
    setEditScoreB(game.score_b);
    setEditA1(sideA[0] ?? players[0]?.id ?? 0);
    setEditA2(sideA[1] ?? players[1]?.id ?? players[0]?.id ?? 0);
    setEditB1(sideB[0] ?? players[2]?.id ?? players[0]?.id ?? 0);
    setEditB2(sideB[1] ?? players[3]?.id ?? players[1]?.id ?? 0);
  }

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <AdminCard title={`Session Info: ${session.location || `Session ${session.id}`}`} action={
        <div style={{ display: 'flex', gap: 8 }}>
          {session.status === 'UPCOMING' ? <button style={outlineBtn} onClick={() => void onStatusChange('OPEN')}>Open Session</button> : null}
          {session.status === 'OPEN' ? <button style={outlineBtn} onClick={() => void onClose()}>Close Session</button> : null}
          {session.status === 'CLOSED' ? <button style={outlineBtn} onClick={() => void onOpen()}>Open Session</button> : null}
          {session.status === 'CLOSED' ? <button style={primaryBtn} onClick={() => void onFinalize()}>Finalize Session</button> : null}
          {session.status === 'FINALIZED' ? <button style={outlineBtn} onClick={() => void onRevert()}>Revert Finalize</button> : null}
        </div>
      }>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,minmax(0,1fr))', gap: 10 }}>
          <div style={{ gridColumn: 'span 2', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 10 }}>
            <div style={{ color: '#64748b', fontSize: 12 }}>Session Date &amp; Time</div>
            {session.status !== 'UPCOMING' ? (
              <div style={{ marginTop: 4, color: '#0f172a', fontWeight: 700 }}>
                {fmtDate(session.session_date)} · {fmtLocalTimeLabel(session.start_time_local)}
              </div>
            ) : !editingSchedule ? (
              <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ color: '#0f172a', fontWeight: 700 }}>
                  {fmtDate(session.session_date)} · {fmtLocalTimeLabel(session.start_time_local)}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setScheduleError(null);
                    setEditingSchedule(true);
                  }}
                  title="Edit Date & Time"
                  aria-label="Edit Date & Time"
                  style={{ ...outlineBtn, padding: 6, minWidth: 32, minHeight: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                  </svg>
                </button>
              </div>
            ) : (
              <div style={{ marginTop: 6, display: 'grid', gap: 6 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 6 }}>
                  <input
                    type="date"
                    value={scheduleDate}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    style={field}
                  />
                  <input
                    type="time"
                    step={300}
                    value={scheduleTime}
                    onChange={(e) => setScheduleTime(e.target.value)}
                    style={field}
                  />
                </div>
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingSchedule(false);
                      setScheduleError(null);
                      setScheduleDate(session.session_date);
                      setScheduleTime(session.start_time_local ? session.start_time_local.slice(0, 5) : '19:00');
                    }}
                    style={{ ...outlineBtn, padding: '6px 10px', fontSize: 12 }}
                    disabled={scheduleSaving}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!scheduleDate) {
                        setScheduleError('Select a session date.');
                        return;
                      }
                      if (!scheduleTime) {
                        setScheduleError('Select a start time.');
                        return;
                      }
                      setScheduleError(null);
                      setScheduleSaving(true);
                      try {
                        await onUpdateSchedule(scheduleDate, scheduleTime);
                        setEditingSchedule(false);
                      } catch (e) {
                        setScheduleError(getMessage(e, 'Failed to update session date/time.'));
                      } finally {
                        setScheduleSaving(false);
                      }
                    }}
                    style={{ ...primaryBtn, padding: '6px 10px', fontSize: 12 }}
                    disabled={scheduleSaving}
                  >
                    {scheduleSaving ? 'Saving…' : 'Save'}
                  </button>
                </div>
                {scheduleError ? <div style={{ fontSize: 11, color: 'var(--bad)' }}>{scheduleError}</div> : null}
              </div>
            )}
          </div>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 10 }}>
            <div style={{ color: '#64748b', fontSize: 12 }}>Status</div>
            {session.status === 'FINALIZED' ? (
              <div style={{ marginTop: 4, color: '#0f172a', fontWeight: 700 }}>FINALIZED</div>
            ) : (
              <div style={{ marginTop: 6, display: 'grid', gap: 6 }}>
                <select
                  aria-label="Session Status"
                  value={session.status}
                  disabled={statusSaving}
                  onChange={async (e) => {
                    const nextStatus = e.target.value as 'UPCOMING' | 'OPEN' | 'CLOSED' | 'CANCELLED';
                    setStatusSaving(true);
                    try {
                      await onStatusChange(nextStatus);
                    } finally {
                      setStatusSaving(false);
                    }
                  }}
                  style={{
                    height: 40,
                    width: '100%',
                    minWidth: 0,
                    borderRadius: 10,
                    border: '1px solid #0ea5e9',
                    padding: '0 12px',
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#0f172a',
                    background: statusSaving ? '#f1f5f9' : '#fff',
                    opacity: statusSaving ? 0.8 : 1,
                    cursor: statusSaving ? 'wait' : 'pointer',
                    appearance: 'auto',
                    WebkitAppearance: 'menulist',
                  }}
                >
                  <option value="UPCOMING">UPCOMING</option>
                  <option value="OPEN">OPEN</option>
                  <option value="CLOSED">CLOSED</option>
                  <option value="CANCELLED">CANCELLED</option>
                </select>
                <div style={{ fontSize: 11, color: '#64748b' }}>{statusSaving ? 'Updating status…' : 'Choose a new status to update this session.'}</div>
              </div>
            )}
          </div>
          <Info label="Season" value={season?.name || `Season ${session.season_id}`} />
          <Info label="Opened" value={fmtDateTime(session.opened_at)} />
          <Info label="Finalized" value={fmtDateTime(session.finalized_at)} />
        </div>
      </AdminCard>
      <AdminCard title={`Matches in Session (${sessionMatches.length})`} action={
        <button
          style={outlineBtn}
          disabled={!canManageMatches}
          onClick={() => {
            setAddMatchError(null);
            setConfirmSoftDuplicate(null);
            setShowAddMatchModal(true);
          }}
        >
          Add Match
        </button>
      }>
        {!canManageMatches ? (
          <div style={{ ...adminAlertError, marginBottom: 10 }}>
            Match edits are disabled for {session.status} sessions. Revert finalize or reopen the session first.
          </div>
        ) : null}
        <AdminTable
          columns={[
            sortableHeader('S/N', 'serial'),
            sortableHeader('Player 1', 'player1'),
            sortableHeader('Player 2', 'player2'),
            sortableHeader('Player 3', 'player3'),
            sortableHeader('Player 4', 'player4'),
            sortableHeader('Court', 'court'),
            sortableHeader('Start Time', 'startTime'),
            sortableHeader('Score A', 'scoreA'),
            sortableHeader('Score B', 'scoreB'),
            sortableHeader('Status', 'status'),
            'Actions',
          ]}
          rows={matchRows.map((row) => {
            const g = row.game;
            return [
              row.serial,
              row.player1,
              row.player2,
              row.player3,
              row.player4,
              row.court,
              row.startTimeLabel,
              row.scoreA,
              row.scoreB,
              row.status,
              <div key={`game-actions-${g.id}`} style={{ display: 'flex', gap: 6 }}>
                {canManageMatches ? (
                  <>
                    <button
                      type="button"
                      style={{ ...outlineBtn, minWidth: 34, padding: '8px 10px' }}
                      onClick={() => openEditModal(g)}
                      title="Edit match"
                      aria-label={`Edit match ${row.serial}`}
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      style={{ ...outlineBtn, minWidth: 34, padding: '8px 10px', color: '#b91c1c', borderColor: '#fca5a5' }}
                      onClick={() => {
                        setDeleteGameError(null);
                        setDeleteGameTarget(g);
                      }}
                      title="Delete match"
                      aria-label={`Delete match ${row.serial}`}
                    >
                      🗑
                    </button>
                  </>
                ) : (
                  <span style={{ color: '#64748b', fontSize: 13 }}>Locked</span>
                )}
              </div>,
            ];
          })}
        />
      </AdminCard>
      {editGameTarget ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.35)', display: 'grid', placeItems: 'center', zIndex: 1001, padding: 16 }}>
          <div style={{ width: 'min(880px, 100%)', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, boxShadow: '0 20px 60px rgba(2,6,23,.25)', padding: 16, display: 'grid', gap: 12 }}>
            <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 20 }}>Edit Match</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <label style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>Session Name</label>
                <input value={session.location || `Session ${session.id}`} readOnly style={{ ...field, background: '#f8fafc' }} />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <label style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>Session Date</label>
                <input value={session.session_date} readOnly style={{ ...field, background: '#f8fafc' }} />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <label style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>Court</label>
                <select value={editCourtId ?? ''} onChange={(e) => setEditCourtId(e.target.value ? Number(e.target.value) : null)} style={field}>
                  <option value="">Select court</option>
                  {courts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <label style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>Start Time</label>
                <select value={editStartTime} onChange={(e) => setEditStartTime(e.target.value)} style={field}>
                  {timeOptions.map((value) => (
                    <option key={`edit-time-${value}`} value={value}>
                      {formatTimeLabel(value)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ borderRadius: 14, background: '#818cf8', border: '1px solid #6366f1', padding: 12, display: 'grid', gap: 8 }}>
                <div style={{ fontWeight: 700, color: '#eef2ff' }}>Team A</div>
                <select value={editA1} onChange={(e) => setEditA1(Number(e.target.value))} style={field}>{playerOptions.map((p) => <option key={`ea1-${p.id}`} value={p.id}>{p.display_name}</option>)}</select>
                <select value={editA2} onChange={(e) => setEditA2(Number(e.target.value))} style={field}>{playerOptions.map((p) => <option key={`ea2-${p.id}`} value={p.id}>{p.display_name}</option>)}</select>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: '#eef2ff', fontWeight: 700 }}>Score A</span>
                  <input type="number" min={0} value={editScoreA} onChange={(e) => setEditScoreA(Number(e.target.value))} style={field} />
                </label>
              </div>
              <div style={{ borderRadius: 14, background: '#fda4af', border: '1px solid #fb7185', padding: 12, display: 'grid', gap: 8 }}>
                <div style={{ fontWeight: 700, color: '#881337' }}>Team B</div>
                <select value={editB1} onChange={(e) => setEditB1(Number(e.target.value))} style={field}>{playerOptions.map((p) => <option key={`eb1-${p.id}`} value={p.id}>{p.display_name}</option>)}</select>
                <select value={editB2} onChange={(e) => setEditB2(Number(e.target.value))} style={field}>{playerOptions.map((p) => <option key={`eb2-${p.id}`} value={p.id}>{p.display_name}</option>)}</select>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: '#881337', fontWeight: 700 }}>Score B</span>
                  <input type="number" min={0} value={editScoreB} onChange={(e) => setEditScoreB(Number(e.target.value))} style={field} />
                </label>
              </div>
            </div>
            {editMatchError ? <div style={adminAlertError}>{editMatchError}</div> : null}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <button
                style={primaryBtn}
                disabled={editMatchBusy}
                onClick={async () => {
                  if (!editGameTarget) return;
                  const normalizedTime = floorToFiveMinuteIncrement(editStartTime);
                  const duplicateBySlot = sessionMatches.some((game) => {
                    if (!editCourtId) return false;
                    if (game.id === editGameTarget.id) return false;
                    const gameHhmm = getHHmm(game.start_time);
                    return game.session_id === session.id && game.court_id === editCourtId && gameHhmm === normalizedTime;
                  });
                  if (duplicateBySlot) {
                    setEditMatchError('A game already exists for this session, court, and start time.');
                    return;
                  }
                  const validationError = validateAddGameInput({
                    courtId: editCourtId,
                    scoreA: editScoreA,
                    scoreB: editScoreB,
                    sideAPlayerIds: [editA1, editA2],
                    sideBPlayerIds: [editB1, editB2],
                    sessionId: session.id,
                    startTime: normalizedTime,
                  });
                  if (validationError) {
                    setEditMatchError(validationError);
                    return;
                  }
                  try {
                    setEditMatchBusy(true);
                    await onEditMatch(editGameTarget.id, {
                      courtId: editCourtId,
                      startTimeLocal: normalizedTime,
                      scoreA: editScoreA,
                      scoreB: editScoreB,
                      sideAPlayerIds: [editA1, editA2],
                      sideBPlayerIds: [editB1, editB2],
                    });
                    setEditGameTarget(null);
                    setEditMatchError(null);
                  } catch (e) {
                    setEditMatchError(getMessage(e, 'Failed to update match.'));
                  } finally {
                    setEditMatchBusy(false);
                  }
                }}
              >
                {editMatchBusy ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                style={outlineBtn}
                disabled={editMatchBusy}
                onClick={() => {
                  setEditGameTarget(null);
                  setEditMatchError(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {deleteGameTarget ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.35)', display: 'grid', placeItems: 'center', zIndex: 1001, padding: 16 }}>
          <div style={{ width: 'min(520px, 100%)', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, boxShadow: '0 20px 60px rgba(2,6,23,.25)', padding: 16, display: 'grid', gap: 10 }}>
            <h3 style={{ margin: 0, color: '#0f172a' }}>Delete Match</h3>
            <p style={{ margin: 0, color: '#334155' }}>
              Delete this match from <strong>{session.location || `Session ${session.id}`}</strong>?
            </p>
            {deleteGameError ? <div style={adminAlertError}>{deleteGameError}</div> : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                style={outlineBtn}
                disabled={deleteGameBusy}
                onClick={() => {
                  setDeleteGameTarget(null);
                  setDeleteGameError(null);
                }}
              >
                Cancel
              </button>
              <button
                style={{ ...primaryBtn, background: '#dc2626' }}
                disabled={deleteGameBusy}
                onClick={async () => {
                  try {
                    setDeleteGameBusy(true);
                    await onDeleteMatch(deleteGameTarget.id);
                    setDeleteGameTarget(null);
                    setDeleteGameError(null);
                  } catch (e) {
                    setDeleteGameError(getMessage(e, 'Failed to delete match.'));
                  } finally {
                    setDeleteGameBusy(false);
                  }
                }}
              >
                {deleteGameBusy ? 'Deleting...' : 'Delete Match'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {showAddMatchModal ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.35)', display: 'grid', placeItems: 'center', zIndex: 1000, padding: 16 }}>
          <div style={{ width: 'min(880px, 100%)', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, boxShadow: '0 20px 60px rgba(2,6,23,.25)', padding: 16, display: 'grid', gap: 12 }}>
            <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 20 }}>Add Match</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <label style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>Session Name</label>
                <input value={session.location || `Session ${session.id}`} readOnly style={{ ...field, background: '#f8fafc' }} />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <label style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>Session Date</label>
                <input value={session.session_date} readOnly style={{ ...field, background: '#f8fafc' }} />
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <label style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>Court</label>
                <select value={courtId ?? ''} onChange={(e) => setCourtId(e.target.value ? Number(e.target.value) : null)} style={field}>
                  <option value="">Select court</option>
                  {courts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <label style={{ fontSize: 13, color: '#475569', fontWeight: 600 }}>Start Time</label>
                <select value={startTime} onChange={(e) => setStartTime(e.target.value)} style={field}>
                  {timeOptions.map((value) => (
                    <option key={value} value={value}>
                      {formatTimeLabel(value)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ borderRadius: 14, background: '#818cf8', border: '1px solid #6366f1', padding: 12, display: 'grid', gap: 8 }}>
                <div style={{ fontWeight: 700, color: '#eef2ff' }}>Team A</div>
                <select value={a1} onChange={(e) => setA1(Number(e.target.value))} style={field}>{playerOptions.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}</select>
                <select value={a2} onChange={(e) => setA2(Number(e.target.value))} style={field}>{playerOptions.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}</select>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: '#eef2ff', fontWeight: 700 }}>Score A</span>
                  <input type="number" min={0} value={scoreA} onChange={(e) => setScoreA(Number(e.target.value))} style={field} />
                </label>
              </div>
              <div style={{ borderRadius: 14, background: '#fda4af', border: '1px solid #fb7185', padding: 12, display: 'grid', gap: 8 }}>
                <div style={{ fontWeight: 700, color: '#881337' }}>Team B</div>
                <select value={b1} onChange={(e) => setB1(Number(e.target.value))} style={field}>{playerOptions.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}</select>
                <select value={b2} onChange={(e) => setB2(Number(e.target.value))} style={field}>{playerOptions.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}</select>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ color: '#881337', fontWeight: 700 }}>Score B</span>
                  <input type="number" min={0} value={scoreB} onChange={(e) => setScoreB(Number(e.target.value))} style={field} />
                </label>
              </div>
            </div>
            {addMatchError ? <div style={adminAlertError}>{addMatchError}</div> : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button style={outlineBtn} onClick={() => setShowAddMatchModal(false)} disabled={addMatchBusy}>Cancel</button>
              <button
                style={primaryBtn}
                disabled={addMatchBusy}
                onClick={async () => {
                  const normalizedTime = floorToFiveMinuteIncrement(startTime);
                  const [hRaw, mRaw] = normalizedTime.split(':');
                  const h = Number(hRaw);
                  const m = Number(mRaw);
                  if (!Number.isInteger(h) || !Number.isInteger(m) || m % 5 !== 0) {
                    setAddMatchError('Start time must be aligned to 5-minute increments.');
                    return;
                  }
                  const duplicateBySlot = sessionMatches.some((game) => {
                    if (!courtId) return false;
                    const gameHhmm = getHHmm(game.start_time);
                    return game.session_id === session.id && game.court_id === courtId && gameHhmm === normalizedTime;
                  });
                  if (duplicateBySlot) {
                    setAddMatchError('A game already exists for this session, court, and start time.');
                    return;
                  }
                  const payload: AddMatchPayload = {
                    courtId,
                    startTimeLocal: normalizedTime,
                    scoreA,
                    scoreB,
                    sideAPlayerIds: [a1, a2],
                    sideBPlayerIds: [b1, b2],
                  };
                  const validationError = validateAddGameInput({
                    courtId,
                    scoreA,
                    scoreB,
                    sideAPlayerIds: [a1, a2],
                    sideBPlayerIds: [b1, b2],
                    sessionId: session.id,
                    startTime: normalizedTime,
                  });
                  if (validationError) {
                    setAddMatchError(validationError);
                    return;
                  }
                  if (isSoftDuplicate(payload)) {
                    setConfirmSoftDuplicate({
                      message: 'Potential duplicate: same session, same 4 players, and same score. Save anyway?',
                      payload,
                    });
                    return;
                  }
                  await submitAddMatch(payload);
                }}
              >
                {addMatchBusy ? 'Saving...' : 'Save Game'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {confirmSoftDuplicate ? (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.35)', display: 'grid', placeItems: 'center', zIndex: 1001, padding: 16 }}>
          <div style={{ width: 'min(520px, 100%)', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, boxShadow: '0 20px 60px rgba(2,6,23,.25)', padding: 16, display: 'grid', gap: 10 }}>
            <h3 style={{ margin: 0, color: '#0f766e' }}>Confirm Duplicate</h3>
            <p style={{ margin: 0, color: '#334155' }}>{confirmSoftDuplicate.message}</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button style={outlineBtn} onClick={() => setConfirmSoftDuplicate(null)}>Cancel</button>
              <button
                style={primaryBtn}
                onClick={async () => {
                  const payload = confirmSoftDuplicate.payload;
                  setConfirmSoftDuplicate(null);
                  await submitAddMatch(payload);
                }}
              >
                Continue Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 10 }}>
      <div style={{ color: '#64748b', fontSize: 12 }}>{label}</div>
      <div style={{ marginTop: 4, color: '#0f172a', fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function ConfigPanel({
  featureFlags,
  loading,
  onToggle,
}: {
  featureFlags: FeatureFlag[];
  loading: boolean;
  onToggle: (flag: FeatureFlag, enabled: boolean) => Promise<void>;
}) {
  const rows = featureFlags.map((flag) => ([
    <div key={`${flag.key}-meta`} style={{ display: 'grid', gap: 4 }}>
      <div style={{ color: '#0f172a', fontWeight: 700 }}>{flag.name}</div>
      <div style={{ color: '#64748b', fontSize: 13 }}>{flag.key}</div>
    </div>,
    <span key={`${flag.key}-desc`} style={{ color: '#475569' }}>{flag.description || '-'}</span>,
    <span key={`${flag.key}-status`} style={{ fontWeight: 700, color: flag.enabled ? '#047857' : '#64748b' }}>
      {flag.enabled ? 'Enabled' : 'Disabled'}
    </span>,
    <button
      key={`${flag.key}-toggle`}
      style={flag.enabled ? outlineBtn : primaryBtn}
      disabled={loading}
      onClick={() => void onToggle(flag, !flag.enabled)}
    >
      {flag.enabled ? 'Disable' : 'Enable'}
    </button>,
  ]));

  return (
    <AdminCard title="Feature Flags">
      <p style={{ margin: '0 0 12px', color: '#475569' }}>
        Centralized runtime feature switches. These values are stored in the API database and used by both the UI and backend.
      </p>
      {featureFlags.length ? (
        <AdminTable
          columns={['Feature', 'Description', 'Status', 'Action']}
          rows={rows}
        />
      ) : (
        <AdminEmptyState
          title="No feature flags found"
          description="Seed or migrate feature flags in the API to manage them here."
        />
      )}
    </AdminCard>
  );
}
